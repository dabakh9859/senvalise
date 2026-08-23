package api

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"senvalise/internal/models"
)

// Créances et relances.
//
// Le montant dû existait déjà, mais éparpillé : une carte du tableau de bord,
// un graphique d'ancienneté, un tableau au fond des rapports — trois écrans
// réservés au gérant, aucun utilisable pour appeler un client. Le
// recouvrement se fait pourtant au comptoir.
//
// Cette vue regroupe l'impayé par client, la plus vieille facture en tête,
// et garde la trace des relances déjà envoyées pour éviter de harceler
// quelqu'un qu'on a appelé la veille. Aucun coût d'achat n'y transite : le
// vendeur y a sa place sans voir les marges.

type receivableLine struct {
	SaleID    uint      `json:"saleId"`
	Reference string    `json:"reference"`
	Date      time.Time `json:"date"`
	Total     int64     `json:"total"`
	Paid      int64     `json:"paid"`
	Due       int64     `json:"due"`
	Days      int       `json:"days"`
	Bucket    string    `json:"bucket"`
}

type receivableCustomer struct {
	CustomerID     uint             `json:"customerId"`
	Name           string           `json:"name"`
	Phone          string           `json:"phone"`
	Email          string           `json:"email"`
	Due            int64            `json:"due"`
	Invoices       int              `json:"invoices"`
	OldestDays     int              `json:"oldestDays"`
	Bucket         string           `json:"bucket"`
	LastReminderAt *time.Time       `json:"lastReminderAt"`
	Reminders      int              `json:"reminders"`
	Lines          []receivableLine `json:"lines"`
}

// buckets d'ancienneté, identiques à ceux du tableau de bord pour que les
// deux écrans racontent la même histoire.
func ageingBucket(days int) string {
	switch {
	case days <= 30:
		return "1–30 j"
	case days <= 60:
		return "31–60 j"
	case days <= 90:
		return "61–90 j"
	}
	return "90 j et +"
}

var ageingOrder = []string{"1–30 j", "31–60 j", "61–90 j", "90 j et +"}

func (s *Server) receivables(c *fiber.Ctx) error {
	var sales []models.Sale
	// Une facture annulée ne se recouvre pas ; un client anonyme non plus,
	// on n'aurait personne à relancer.
	if e := s.DB.Preload("Customer").
		Where("status <> ? AND total > paid AND customer_id IS NOT NULL", "cancelled").
		Order("created_at asc").Find(&sales).Error; e != nil {
		return dbError(e, "lecture des créances")
	}

	now := time.Now()
	grouped := map[uint]*receivableCustomer{}
	order := []uint{}
	for _, sale := range sales {
		due := sale.Total - sale.Paid
		if due <= 0 || sale.CustomerID == nil {
			continue
		}
		days := int(now.Sub(sale.CreatedAt).Hours() / 24)
		if days < 0 {
			days = 0
		}
		id := *sale.CustomerID
		entry, seen := grouped[id]
		if !seen {
			entry = &receivableCustomer{CustomerID: id, Name: fmt.Sprintf("Client #%d", id)}
			if sale.Customer != nil {
				entry.Name, entry.Phone, entry.Email = sale.Customer.Name, sale.Customer.Phone, sale.Customer.Email
			}
			grouped[id] = entry
			order = append(order, id)
		}
		entry.Due += due
		entry.Invoices++
		if days > entry.OldestDays {
			entry.OldestDays = days
			entry.Bucket = ageingBucket(days)
		}
		entry.Lines = append(entry.Lines, receivableLine{
			SaleID: sale.ID, Reference: sale.Reference, Date: sale.CreatedAt,
			Total: sale.Total, Paid: sale.Paid, Due: due, Days: days, Bucket: ageingBucket(days),
		})
	}

	// Relances déjà passées, pour ne pas rappeler deux fois le même jour.
	type reminderStat struct {
		CustomerID uint
		Count      int
		Last       time.Time
	}
	var stats []reminderStat
	s.DB.Model(&models.Message{}).
		Where("type = ? AND customer_id IS NOT NULL", "billing").
		Select("customer_id, count(*) as count, max(created_at) as last").
		Group("customer_id").Scan(&stats)
	for _, stat := range stats {
		if entry, ok := grouped[stat.CustomerID]; ok {
			entry.Reminders = stat.Count
			last := stat.Last
			entry.LastReminderAt = &last
		}
	}

	// La plus vieille dette en tête : c'est celle qu'on relance en premier.
	out := make([]receivableCustomer, 0, len(order))
	for _, id := range order {
		out = append(out, *grouped[id])
	}
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j].OldestDays > out[j-1].OldestDays; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}

	totals := map[string]int64{}
	counts := map[string]int{}
	var outstanding int64
	var invoices int
	for _, entry := range out {
		outstanding += entry.Due
		invoices += entry.Invoices
		for _, line := range entry.Lines {
			totals[line.Bucket] += line.Due
			counts[line.Bucket]++
		}
	}
	buckets := make([]fiber.Map, 0, len(ageingOrder))
	for _, label := range ageingOrder {
		buckets = append(buckets, fiber.Map{"label": label, "amount": totals[label], "count": counts[label]})
	}

	return c.JSON(fiber.Map{
		"totals": fiber.Map{
			"outstanding": outstanding,
			"invoices":    invoices,
			"customers":   len(out),
			"overdue":     totals["31–60 j"] + totals["61–90 j"] + totals["90 j et +"],
		},
		"buckets":   buckets,
		"customers": out,
	})
}

// createReminder prépare une relance et la consigne.
//
// Rien n'envoie réellement de SMS ou d'e-mail dans cette application : la
// table des messages est un registre. La relance est donc rédigée ici, rendue
// au vendeur pour qu'il l'envoie depuis son téléphone, et gardée en trace —
// c'est cette trace qui alimente « dernière relance » et évite les rappels en
// double.
func (s *Server) createReminder(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("customerId"), 10, 64)
	if err != nil || id == 0 {
		return fiber.NewError(422, "Client invalide.")
	}
	var in struct {
		Channel string `json:"channel"`
		Body    string `json:"body"`
	}
	_ = c.BodyParser(&in)
	if in.Channel == "" {
		in.Channel = "whatsapp"
	}
	if in.Channel != "whatsapp" && in.Channel != "sms" && in.Channel != "email" {
		return fiber.NewError(422, "Canal de relance non reconnu.")
	}

	var customer models.Customer
	if s.DB.First(&customer, id).Error != nil {
		return fiber.ErrNotFound
	}

	var sales []models.Sale
	s.DB.Where("customer_id = ? AND status <> ? AND total > paid", customer.ID, "cancelled").
		Order("created_at asc").Find(&sales)
	if len(sales) == 0 {
		return fiber.NewError(422, "Ce client n’a plus rien à régler.")
	}
	var due int64
	references := make([]string, 0, len(sales))
	for _, sale := range sales {
		due += sale.Total - sale.Paid
		references = append(references, sale.Reference)
	}

	recipient := customer.Phone
	if in.Channel == "email" {
		recipient = customer.Email
	}
	if strings.TrimSpace(recipient) == "" {
		if in.Channel == "email" {
			return fiber.NewError(422, "Ce client n’a pas d’adresse e-mail enregistrée.")
		}
		return fiber.NewError(422, "Ce client n’a pas de numéro de téléphone enregistré.")
	}

	subject, body := s.reminderText(customer, due, references)
	if strings.TrimSpace(in.Body) != "" {
		body = in.Body
	}
	message := models.Message{
		CustomerID: &customer.ID, Channel: in.Channel, Type: "billing",
		Status: "pending", Recipient: recipient, Subject: subject, Body: body,
	}
	if e := s.DB.Create(&message).Error; e != nil {
		return dbError(e, "enregistrement de la relance")
	}
	s.log(c, "reminder", "customers", customer.ID,
		fmt.Sprintf("relance %s pour %d F sur %d facture(s)", in.Channel, due, len(sales)))
	return c.Status(201).JSON(fiber.Map{"message": message, "due": due, "invoices": len(sales)})
}

// reminderText compose la relance à partir du modèle « billing » s'il existe,
// pour que le ton reste celui choisi dans l'écran Modèles.
func (s *Server) reminderText(customer models.Customer, due int64, references []string) (string, string) {
	subject := "Solde à régler"
	body := "Bonjour {{nom}}, il reste {{montant}} FCFA sur la facture {{reference}}."
	var template models.MessageTemplate
	if s.DB.Where("type = ?", "billing").Order("id asc").First(&template).Error == nil {
		if strings.TrimSpace(template.Subject) != "" {
			subject = template.Subject
		}
		if strings.TrimSpace(template.Body) != "" {
			body = template.Body
		}
	}
	name := strings.TrimSpace(customer.Name)
	if name == "" {
		name = "cher client"
	}
	reference := strings.Join(references, ", ")
	if len(references) > 3 {
		reference = fmt.Sprintf("%s et %d autres", strings.Join(references[:3], ", "), len(references)-3)
	}
	replace := strings.NewReplacer(
		"{{nom}}", name,
		"{{montant}}", formatAmount(due),
		"{{reference}}", reference,
	)
	return replace.Replace(subject), replace.Replace(body)
}

// formatAmount écrit les milliers avec une espace, comme le fait l'interface.
func formatAmount(value int64) string {
	digits := strconv.FormatInt(value, 10)
	sign := ""
	if strings.HasPrefix(digits, "-") {
		sign, digits = "-", digits[1:]
	}
	var out []byte
	for i, r := range []byte(digits) {
		if i > 0 && (len(digits)-i)%3 == 0 {
			out = append(out, ' ')
		}
		out = append(out, r)
	}
	return sign + string(out)
}

