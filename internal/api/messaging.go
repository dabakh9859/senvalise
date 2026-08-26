package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"senvalise/internal/messaging"
	"senvalise/internal/models"
)

// Messagerie sortante : envoi des pieces commerciales, relance des impayes et
// diffusions publicitaires, sur WhatsApp (passerelle WAHA) ou par SMS (API
// d'Orange Senegal).
//
// Deux principes gouvernent ce fichier :
//
//  1. rien ne part de facon synchrone. Un clic cree des lignes « queued » dans
//     la table messages, un facteur les reprend en tache de fond. L'ecran rend
//     donc la main tout de suite, une diffusion de trois cents clients ne tient
//     pas une requete HTTP ouverte, et un redemarrage du serveur ne perd pas
//     les messages restants ;
//
//  2. le debit est plafonne. WhatsApp bannit les comptes qui emettent en
//     rafale : le facteur respecte un intervalle minimum et un quota par
//     minute, tous deux configurables.
const messagingSettingKey = "messaging_config"

// readMessagingConfig lit la configuration. Elle est relue a chaque cycle du
// facteur plutot que gardee en memoire : une correction de parametre doit
// prendre effet sans redemarrage.
func (s *Server) readMessagingConfig() messaging.Config {
	var row models.Setting
	if s.DB.Where("key = ?", messagingSettingKey).First(&row).Error != nil {
		return messaging.DefaultConfig()
	}
	return messaging.Parse(row.Value)
}

func (s *Server) writeMessagingConfig(config messaging.Config) error {
	raw, err := config.Encode()
	if err != nil {
		return err
	}
	var row models.Setting
	if s.DB.Where("key = ?", messagingSettingKey).First(&row).Error == nil {
		return s.DB.Model(&row).Updates(map[string]any{"value": raw, "secret": true}).Error
	}
	return s.DB.Create(&models.Setting{Key: messagingSettingKey, Value: raw, Secret: true}).Error
}

// maskedConfig retire les secrets avant de repondre a l'ecran. Ils ne sont
// jamais renvoyes, meme au gerant : un secret affiche finit copie ailleurs.
// Les booleens « hasApiKey » disent seulement si la valeur est renseignee.
type maskedConfig struct {
	messaging.Config
	HasAPIKey       bool     `json:"hasApiKey"`
	HasClientSecret bool     `json:"hasClientSecret"`
	Placeholders    []string `json:"placeholders"`
}

func mask(config messaging.Config) maskedConfig {
	out := maskedConfig{Config: config, HasAPIKey: config.WhatsApp.APIKey != "", HasClientSecret: config.SMS.ClientSecret != "", Placeholders: messaging.Placeholders}
	out.WhatsApp.APIKey = ""
	out.SMS.ClientSecret = ""
	return out
}

func (s *Server) messagingConfig(c *fiber.Ctx) error {
	return c.JSON(mask(s.readMessagingConfig()))
}

// updateMessagingConfig conserve un secret laisse vide. L'ecran ne le recoit
// jamais : s'il devait le renvoyer pour enregistrer le reste du formulaire,
// modifier le numero expediteur effacerait la cle d'API.
func (s *Server) updateMessagingConfig(c *fiber.Ctx) error {
	current := s.readMessagingConfig()
	incoming := current
	if c.BodyParser(&incoming) != nil {
		return fiber.NewError(422, "Configuration de messagerie invalide")
	}
	if strings.TrimSpace(incoming.WhatsApp.APIKey) == "" {
		incoming.WhatsApp.APIKey = current.WhatsApp.APIKey
	}
	if strings.TrimSpace(incoming.SMS.ClientSecret) == "" {
		incoming.SMS.ClientSecret = current.SMS.ClientSecret
	}
	incoming.Normalise()
	if incoming.SMS.Enabled && messaging.InternationalPhone(incoming.SMS.Sender) == "" {
		return fiber.NewError(422, "Le numéro expéditeur Orange est invalide.")
	}
	if err := s.writeMessagingConfig(incoming); err != nil {
		return err
	}
	s.log(c, "update", "messaging", 0, "Configuration de la messagerie")
	return c.JSON(mask(incoming))
}

// messagingStatus alimente le bandeau d'etat : session WhatsApp, credits SMS
// configures, et etat de la file. L'erreur de la passerelle est rendue comme
// une donnee et non comme un code HTTP : une passerelle eteinte est un etat
// normal de l'ecran de configuration, pas une panne de l'API.
func (s *Server) messagingStatus(c *fiber.Ctx) error {
	config := s.readMessagingConfig()
	out := fiber.Map{
		"whatsapp": fiber.Map{"enabled": config.WhatsApp.Enabled, "status": "DISABLED", "session": config.WhatsApp.Session},
		"sms":      fiber.Map{"enabled": config.SMS.Enabled, "configured": messaging.NewOrange(config.SMS).Configured(), "sender": config.SMS.Sender},
	}
	if config.WhatsApp.Enabled {
		status, err := messaging.NewWAHA(config.WhatsApp).Status()
		if err != nil {
			out["whatsapp"] = fiber.Map{"enabled": true, "status": "UNREACHABLE", "error": err.Error(), "session": config.WhatsApp.Session}
		} else {
			me := ""
			if status.Me != nil {
				me = strings.TrimSuffix(status.Me.ID, "@c.us")
			}
			out["whatsapp"] = fiber.Map{"enabled": true, "status": status.Status, "session": config.WhatsApp.Session, "phone": me}
		}
	}
	var queued, failed int64
	s.DB.Model(&models.Message{}).Where("status = ?", "queued").Count(&queued)
	s.DB.Model(&models.Message{}).Where("status = ? and created_at > ?", "failed", time.Now().Add(-24*time.Hour)).Count(&failed)
	out["queue"] = fiber.Map{"queued": queued, "failed24h": failed}
	return c.JSON(out)
}

func (s *Server) whatsappSession(c *fiber.Ctx) error {
	config := s.readMessagingConfig()
	if !config.WhatsApp.Enabled {
		return fiber.NewError(422, "Activez WhatsApp avant de piloter la session.")
	}
	client := messaging.NewWAHA(config.WhatsApp)
	var err error
	action := c.Params("action")
	switch action {
	case "start":
		err = client.Start()
	case "stop":
		err = client.Stop()
	case "logout":
		err = client.Logout()
	default:
		return fiber.ErrNotFound
	}
	if err != nil {
		return fiber.NewError(502, err.Error())
	}
	s.log(c, action, "whatsapp-session", 0, "Session WhatsApp : "+action)
	return s.messagingStatus(c)
}

// whatsappQR rend le code d'appairage. Il expire en une vingtaine de secondes,
// l'ecran le redemande donc en boucle tant que la session n'est pas appairee.
func (s *Server) whatsappQR(c *fiber.Ctx) error {
	config := s.readMessagingConfig()
	if !config.WhatsApp.Enabled {
		return fiber.NewError(422, "WhatsApp est désactivé.")
	}
	image, err := messaging.NewWAHA(config.WhatsApp).QR()
	if err != nil {
		return fiber.NewError(502, err.Error())
	}
	return c.JSON(fiber.Map{"qr": image})
}

// ---------- file d'envoi ----------

// queue depose un message. Le destinataire est normalise ici : une file qui
// accepte des numeros mal formes ne produit que des echecs differes.
func (s *Server) queue(message *models.Message) error {
	message.Status = "queued"
	message.Recipient = strings.TrimSpace(message.Recipient)
	if messaging.NormalisePhone(message.Recipient) == "" {
		message.Status, message.Error = "skipped", "Numéro de téléphone absent ou invalide"
	}
	return s.DB.Create(message).Error
}

// deliver effectue l'envoi d'une ligne de la file. Il ne journalise ni ne
// reessaie : le facteur s'en charge, et le meme code sert a l'envoi d'essai.
func (s *Server) deliver(config messaging.Config, message *models.Message) (string, error) {
	switch message.Channel {
	case "whatsapp":
		if !config.WhatsApp.Enabled {
			return "", fmt.Errorf("WhatsApp est désactivé dans les paramètres")
		}
		chat := messaging.ChatID(message.Recipient)
		if chat == "" {
			return "", fmt.Errorf("numéro invalide")
		}
		client := messaging.NewWAHA(config.WhatsApp)
		// Une piece jointe part comme document, avec le texte en legende :
		// deux messages separes arriveraient dans le desordre.
		// L'etat du stock n'est pas une piece enregistree : il est compose au
		// moment de l'envoi, comme les factures le sont, pour que le document
		// recu decrive le stock de l'instant et non celui de la mise en file.
		if message.DocKind == stockAlertDocKind {
			raw, err := s.stockAlertPDF(s.stockReport())
			if err != nil {
				return "", err
			}
			return client.SendFile(chat, "Etat-du-stock.pdf", "application/pdf", raw, message.Body)
		}
		if message.DocKind != "" && message.DocID != 0 {
			raw, filename, _, err := s.documentPDF(message.DocKind, message.DocID)
			if err != nil {
				return "", err
			}
			return client.SendFile(chat, filename, "application/pdf", raw, message.Body)
		}
		return client.SendText(chat, message.Body)
	case "sms":
		if !config.SMS.Enabled {
			return "", fmt.Errorf("le SMS est désactivé dans les paramètres")
		}
		return messaging.NewOrange(config.SMS).Send(message.Recipient, message.Body)
	}
	return "", fmt.Errorf("canal inconnu : %s", message.Channel)
}

// StartOutbox lance le facteur. Un seul tourne par processus ; il s'arrete
// avec le serveur.
func (s *Server) StartOutbox() {
	go func() {
		for {
			s.drainOutbox()
			s.runDueReminders()
			s.runStockAlert()
			time.Sleep(10 * time.Second)
		}
	}()
}

// drainOutbox envoie ce qui est du, dans la limite du quota par minute. La
// boucle sort des qu'elle a consomme son quota : le cycle suivant reprendra la
// suite dix secondes plus tard, ce qui etale naturellement une diffusion.
func (s *Server) drainOutbox() {
	defer func() {
		// Un envoi ne doit jamais tuer le facteur : une panique ici arreterait
		// silencieusement toute la messagerie jusqu'au prochain redemarrage.
		_ = recover()
	}()
	config := s.readMessagingConfig()
	quota := config.Throttle.PerMinute / 6
	if quota < 1 {
		quota = 1
	}
	var pending []models.Message
	if s.DB.Where("status = ? and (scheduled_at is null or scheduled_at <= ?)", "queued", time.Now()).
		Order("id asc").Limit(quota).Find(&pending).Error != nil {
		return
	}
	for index := range pending {
		message := &pending[index]
		// Verrou optimiste : deux facteurs (ou un redemarrage a chaud) ne
		// doivent pas envoyer deux fois la meme ligne.
		claim := s.DB.Model(&models.Message{}).Where("id = ? and status = ?", message.ID, "queued").
			Updates(map[string]any{"status": "sending", "attempts": message.Attempts + 1})
		if claim.Error != nil || claim.RowsAffected == 0 {
			continue
		}
		external, err := s.deliver(config, message)
		updates := map[string]any{}
		if err != nil {
			updates["status"], updates["error"] = "failed", trimError(err.Error())
		} else {
			now := time.Now()
			updates["status"], updates["sent_at"], updates["error"], updates["external_id"] = "sent", &now, "", external
		}
		s.DB.Model(&models.Message{}).Where("id = ?", message.ID).Updates(updates)
		if message.CampaignID != nil {
			s.refreshCampaign(*message.CampaignID)
		}
		time.Sleep(time.Duration(config.Throttle.MinDelaySeconds) * time.Second)
	}
}

func trimError(value string) string {
	if len(value) > 400 {
		return value[:400]
	}
	return value
}

// ---------- documents ----------

var documentKinds = map[string]string{"invoice": "sales", "quote": "quotes", "delivery": "delivery-notes"}

// documentToken signe un identifiant de document. Le lien envoye par SMS doit
// etre ouvrable sans compte — un client n'en a pas — mais rester impossible a
// deviner : la signature est un HMAC de la piece avec le secret du serveur,
// donc ni enumerable ni transferable a une autre facture.
func documentToken(kind string, id uint) string {
	mac := hmac.New(sha256.New, []byte(os.Getenv("JWT_SECRET")))
	fmt.Fprintf(mac, "document:%s:%d", kind, id)
	return hex.EncodeToString(mac.Sum(nil))[:24]
}

func (s *Server) publicDocumentURL(config messaging.Config, kind string, id uint) string {
	base := strings.TrimRight(config.PublicURL, "/")
	if base == "" {
		return ""
	}
	return fmt.Sprintf("%s/api/public/documents/%s/%d/%s", base, kind, id, documentToken(kind, id))
}

// documentPDFHandler sert la piece au gerant ou au vendeur connecte.
func (s *Server) documentPDFHandler(c *fiber.Ctx) error {
	kind := c.Params("kind")
	if documentKinds[kind] == "" {
		return fiber.ErrNotFound
	}
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return fiber.ErrBadRequest
	}
	raw, filename, _, err := s.documentPDF(kind, uint(id))
	if err != nil {
		return fiber.NewError(404, err.Error())
	}
	c.Set("Content-Type", "application/pdf")
	c.Set("Content-Disposition", `inline; filename="`+filename+`"`)
	return c.Send(raw)
}

// publicDocument sert la piece a un client muni du lien signe.
func (s *Server) publicDocument(c *fiber.Ctx) error {
	kind := c.Params("kind")
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if documentKinds[kind] == "" || err != nil {
		return fiber.ErrNotFound
	}
	if !hmac.Equal([]byte(c.Params("token")), []byte(documentToken(kind, uint(id)))) {
		return fiber.ErrNotFound
	}
	raw, filename, _, err := s.documentPDF(kind, uint(id))
	if err != nil {
		return fiber.ErrNotFound
	}
	c.Set("Content-Type", "application/pdf")
	c.Set("Content-Disposition", `inline; filename="`+filename+`"`)
	return c.Send(raw)
}

// documentValues alimente les jetons des modeles a partir d'une piece.
func (s *Server) documentValues(config messaging.Config, doc pdfDocument, kind string, id uint) map[string]string {
	name := "client"
	phone := ""
	if len(doc.CustomerRow) > 0 && strings.TrimSpace(doc.CustomerRow[0]) != "" {
		name = doc.CustomerRow[0]
	}
	if len(doc.CustomerRow) > 1 {
		phone = doc.CustomerRow[1]
	}
	values := map[string]string{
		"nom": name, "telephone": phone, "reference": doc.Reference,
		"date": frenchDate(doc.IssuedAt), "montant": messaging.Money(doc.Total),
		"paye": messaging.Money(doc.Paid), "reste": messaging.Money(doc.Remaining),
		"boutique": doc.Company.CompanyName, "lien": s.publicDocumentURL(config, kind, id),
	}
	for _, meta := range doc.Meta {
		if meta.Label == "VALIDITE" || meta.Label == "REGLEMENT" {
			values["echeance"] = meta.Value
		}
	}
	return values
}

// sendDocument met en file l'envoi d'un devis, d'une facture ou d'un bon.
//
// WhatsApp recoit le PDF en piece jointe. Le SMS ne peut rien joindre : il
// recoit le lien signe, a condition qu'une adresse publique soit configuree —
// sinon le client recevrait un texte renvoyant a nulle part.
func (s *Server) sendDocument(c *fiber.Ctx) error {
	kind := c.Params("kind")
	if documentKinds[kind] == "" {
		return fiber.ErrNotFound
	}
	id64, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return fiber.ErrBadRequest
	}
	id := uint(id64)
	var in struct {
		Channel string `json:"channel"`
		To      string `json:"to"`
		Message string `json:"message"`
		Attach  *bool  `json:"attach"`
	}
	if c.BodyParser(&in) != nil {
		return fiber.ErrBadRequest
	}
	if in.Channel != "sms" {
		in.Channel = "whatsapp"
	}
	config := s.readMessagingConfig()
	doc, err := s.loadDocument(kind, id)
	if err != nil {
		return fiber.NewError(404, err.Error())
	}
	recipient := strings.TrimSpace(in.To)
	if recipient == "" && len(doc.CustomerRow) > 1 {
		recipient = doc.CustomerRow[1]
	}
	if messaging.NormalisePhone(recipient) == "" {
		return fiber.NewError(422, "Ce client n'a pas de numéro de téléphone exploitable.")
	}
	values := s.documentValues(config, doc, kind, id)
	body := strings.TrimSpace(in.Message)
	if body == "" {
		body = messaging.Render(defaultDocumentBody(kind, in.Channel), values)
	} else {
		body = messaging.Render(body, values)
	}
	if in.Channel == "sms" && values["lien"] == "" {
		return fiber.NewError(422, "Renseignez l'adresse publique dans les paramètres : le SMS ne peut pas joindre de PDF, il envoie un lien.")
	}

	var customerID *uint
	if row := s.customerIDForDocument(kind, id); row != 0 {
		customerID = &row
	}
	message := models.Message{
		CustomerID: customerID, Channel: in.Channel, Type: kind, Recipient: recipient,
		Subject: doc.Title + " " + doc.Reference, Body: body,
	}
	// Le SMS ne transporte pas de fichier : on ne marque la piece jointe que
	// sur WhatsApp, sinon le facteur fabriquerait un PDF pour rien.
	if in.Channel == "whatsapp" && (in.Attach == nil || *in.Attach) {
		message.DocKind, message.DocID = kind, id
	}
	if err := s.queue(&message); err != nil {
		return err
	}
	s.log(c, "send", kind, id, doc.Title+" "+doc.Reference+" envoyé par "+channelLabel(in.Channel))
	return c.Status(201).JSON(message)
}

func channelLabel(channel string) string {
	if channel == "sms" {
		return "SMS"
	}
	return "WhatsApp"
}

func defaultDocumentBody(kind, channel string) string {
	switch kind {
	case "quote":
		if channel == "sms" {
			return "Bonjour {{nom}}, votre devis {{reference}} de {{montant}} est disponible ici : {{lien}} — {{boutique}}"
		}
		return "Bonjour {{nom}}, voici votre devis {{reference}} d'un montant de {{montant}}. Nous restons à votre disposition. — {{boutique}}"
	case "delivery":
		if channel == "sms" {
			return "Bonjour {{nom}}, votre bon de livraison {{reference}} est disponible ici : {{lien}} — {{boutique}}"
		}
		return "Bonjour {{nom}}, voici votre bon de livraison {{reference}}. Merci de le présenter à la réception de la marchandise. — {{boutique}}"
	default:
		if channel == "sms" {
			return "Bonjour {{nom}}, votre facture {{reference}} de {{montant}} est disponible ici : {{lien}} — {{boutique}}"
		}
		return "Bonjour {{nom}}, voici votre facture {{reference}} d'un montant de {{montant}}. Reste à payer : {{reste}}. Merci de votre confiance. — {{boutique}}"
	}
}

func (s *Server) customerIDForDocument(kind string, id uint) uint {
	var row struct{ CustomerID *uint }
	table := documentKinds[kind]
	if table == "" {
		return 0
	}
	s.DB.Table(strings.ReplaceAll(table, "-", "_")).Select("customer_id").Where("id = ?", id).Scan(&row)
	if row.CustomerID == nil {
		return 0
	}
	return *row.CustomerID
}

// ---------- relances d'impayes ----------

type debtRow struct {
	CustomerID   uint       `json:"customerId"`
	Name         string     `json:"name"`
	Phone        string     `json:"phone"`
	Invoices     int64      `json:"invoices"`
	Due          int64      `json:"due"`
	OldestDays   int64      `json:"oldestDays"`
	LastInvoice  string     `json:"lastInvoice"`
	LastSaleID   uint       `json:"lastSaleId"`
	LastRemindAt *time.Time `json:"lastRemindAt"`
}

// debts liste les clients devant de l'argent. La requete ne retient que les
// factures non annulees et regroupe par client identifie : une vente au
// comptoir sans fiche client n'est relancable par aucun canal.
func (s *Server) debts(c *fiber.Ctx) error {
	config := s.readMessagingConfig()
	minAmount := config.Reminders.MinAmount
	if raw := c.Query("min"); raw != "" {
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil && parsed >= 0 {
			minAmount = parsed
		}
	}
	afterDays := config.Reminders.AfterDays
	if raw := c.Query("after"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 0 {
			afterDays = parsed
		}
	}
	rows := make([]debtRow, 0)
	s.DB.Raw(`
		select cu.id customer_id, cu.name, coalesce(cu.phone,'') phone,
		       count(*) invoices,
		       coalesce(sum(greatest(s.total - s.paid, 0)),0) due,
		       max(extract(day from now() - s.created_at))::bigint oldest_days,
		       (array_agg(s.reference order by s.created_at desc))[1] last_invoice,
		       (array_agg(s.id order by s.created_at desc))[1] last_sale_id,
		       (select max(m.sent_at) from messages m
		          where m.customer_id = cu.id and m.type = 'reminder' and m.status = 'sent') last_remind_at
		  from sales s
		  join customers cu on cu.id = s.customer_id
		 where s.status <> 'cancelled' and s.total > s.paid
		   and s.created_at <= now() - make_interval(days => ?)
		 group by cu.id, cu.name, cu.phone
		having coalesce(sum(greatest(s.total - s.paid, 0)),0) >= ?
		 order by due desc`, afterDays, minAmount).Scan(&rows)
	var total int64
	for _, row := range rows {
		total += row.Due
	}
	// « settings » decrit la relance automatique, « filter » ce que la requete a
	// reellement applique. L'ecran liste toute la creance et se sert du premier
	// bloc pour rappeler a partir de quand le serveur relancerait seul : les
	// confondre laisserait croire que ce qui n'est pas affiche n'existe pas.
	return c.JSON(fiber.Map{"rows": rows, "total": total, "count": len(rows),
		"filter": fiber.Map{"minAmount": minAmount, "afterDays": afterDays},
		"settings": fiber.Map{"minAmount": config.Reminders.MinAmount, "afterDays": config.Reminders.AfterDays,
			"cooldownDays": config.Reminders.CooldownDays, "channel": config.Reminders.Channel, "body": config.Reminders.Body}})
}

// remindDebtors met en file les relances. Le delai de courtoisie est applique
// ici et non a l'affichage : le gerant voit toute sa creance, mais un client
// relance avant-hier n'est pas relance de nouveau aujourd'hui.
func (s *Server) remindDebtors(c *fiber.Ctx) error {
	var in struct {
		CustomerIDs []uint `json:"customerIds"`
		Channel     string `json:"channel"`
		Body        string `json:"body"`
		Force       bool   `json:"force"`
	}
	if c.BodyParser(&in) != nil {
		return fiber.ErrBadRequest
	}
	config := s.readMessagingConfig()
	channel := in.Channel
	if channel != "sms" && channel != "whatsapp" {
		channel = config.Reminders.Channel
	}
	body := strings.TrimSpace(in.Body)
	if body == "" {
		body = config.Reminders.Body
	}
	queued, skipped := s.queueReminders(config, channel, body, in.CustomerIDs, in.Force)
	if len(in.CustomerIDs) > 0 {
		s.log(c, "remind", "customers", 0, fmt.Sprintf("%d relance(s) d'impayés par %s", queued, channelLabel(channel)))
	}
	return c.JSON(fiber.Map{"queued": queued, "skipped": skipped})
}

// queueReminders est le coeur partage entre la relance manuelle et la relance
// automatique quotidienne.
//
// Les seuils de montant et d'anciennete ne s'appliquent qu'a la relance
// automatique. Une selection explicite du gerant les ignore : il a vu la ligne,
// il a coche la case, et un filtre invisible qui annule son geste sans rien
// dire est pire qu'une relance de trop. Le delai de courtoisie, lui, reste
// applique — c'est le client qu'il protege, pas la regle de gestion.
func (s *Server) queueReminders(config messaging.Config, channel, body string, only []uint, force bool) (int, int) {
	afterDays, minAmount := config.Reminders.AfterDays, config.Reminders.MinAmount
	if len(only) > 0 {
		afterDays, minAmount = 0, 0
	}
	rows := make([]debtRow, 0)
	s.DB.Raw(`
		select cu.id customer_id, cu.name, coalesce(cu.phone,'') phone,
		       count(*) invoices,
		       coalesce(sum(greatest(s.total - s.paid, 0)),0) due,
		       max(extract(day from now() - s.created_at))::bigint oldest_days,
		       (array_agg(s.reference order by s.created_at desc))[1] last_invoice,
		       (array_agg(s.id order by s.created_at desc))[1] last_sale_id,
		       (select max(m.sent_at) from messages m
		          where m.customer_id = cu.id and m.type = 'reminder' and m.status = 'sent') last_remind_at
		  from sales s
		  join customers cu on cu.id = s.customer_id
		 where s.status <> 'cancelled' and s.total > s.paid
		   and s.created_at <= now() - make_interval(days => ?)
		 group by cu.id, cu.name, cu.phone
		having coalesce(sum(greatest(s.total - s.paid, 0)),0) >= ?
		 order by due desc`, afterDays, minAmount).Scan(&rows)

	wanted := map[uint]bool{}
	for _, id := range only {
		wanted[id] = true
	}
	cooldown := time.Duration(config.Reminders.CooldownDays) * 24 * time.Hour
	queued, skipped := 0, 0
	found := map[uint]bool{}
	for _, row := range rows {
		if len(wanted) > 0 && !wanted[row.CustomerID] {
			continue
		}
		found[row.CustomerID] = true
		if messaging.NormalisePhone(row.Phone) == "" {
			skipped++
			continue
		}
		if !force && row.LastRemindAt != nil && time.Since(*row.LastRemindAt) < cooldown {
			skipped++
			continue
		}
		// Une relance deja en attente ne doit pas etre doublee par un second
		// clic ou par le passage automatique du soir.
		var pending int64
		s.DB.Model(&models.Message{}).Where("customer_id = ? and type = 'reminder' and status in ('queued','sending')", row.CustomerID).Count(&pending)
		if pending > 0 {
			skipped++
			continue
		}
		customerID := row.CustomerID
		values := map[string]string{
			"nom": row.Name, "telephone": row.Phone, "reference": row.LastInvoice,
			"montant": messaging.Money(row.Due), "reste": messaging.Money(row.Due),
			"paye": "", "date": "", "echeance": fmt.Sprintf("%d jour(s)", row.OldestDays),
			"boutique": s.readCheckoutSettings().InvoiceDefaults.CompanyName,
			"lien":     s.publicDocumentURL(config, "invoice", row.LastSaleID),
		}
		message := models.Message{
			CustomerID: &customerID, Channel: channel, Type: "reminder", Recipient: row.Phone,
			Subject: "Rappel de solde", Body: messaging.Render(body, values),
		}
		if s.queue(&message) == nil {
			queued++
		}
	}
	// Un client coche entre-temps solde n'a plus de dette : il est compte comme
	// ecarte plutot qu'oublie, sinon l'ecran annonce « 0 relance » sans motif.
	for id := range wanted {
		if !found[id] {
			skipped++
		}
	}
	return queued, skipped
}

// runDueReminders passe une fois par jour si la relance automatique est
// active. La marque est posee dans les reglages : sans elle, un redemarrage du
// serveur relancerait tout le monde une seconde fois.
func (s *Server) runDueReminders() {
	config := s.readMessagingConfig()
	if !config.Reminders.Enabled {
		return
	}
	const key = "messaging_last_reminder_run"
	today := time.Now().Format("2006-01-02")
	var row models.Setting
	if s.DB.Where("key = ?", key).First(&row).Error == nil {
		if row.Value == today {
			return
		}
		s.DB.Model(&row).Update("value", today)
	} else if s.DB.Create(&models.Setting{Key: key, Value: today}).Error != nil {
		return
	}
	s.queueReminders(config, config.Reminders.Channel, config.Reminders.Body, nil, false)
}

// ---------- campagnes ----------

// campaignAudience resout l'audience d'une campagne. Les criteres sont
// evalues au lancement : une liste figee a la creation aurait vieilli.
func (s *Server) campaignAudience(campaign models.Campaign) []models.Customer {
	query := s.DB.Model(&models.Customer{}).Where("active = true").Where("coalesce(phone,'') <> ''")
	// Le consentement WhatsApp est une donnee de la fiche client : une
	// publicite ne part pas sans lui. Une relance de facture, elle, releve de
	// la relation commerciale en cours et n'en depend pas.
	if campaign.Channel == "whatsapp" {
		query = query.Where("whats_app_consent = true")
	}
	if strings.TrimSpace(campaign.Zone) != "" {
		query = query.Where("zone = ?", campaign.Zone)
	}
	switch campaign.Audience {
	case "debtors":
		query = query.Where("exists (select 1 from sales s where s.customer_id = customers.id and s.status <> 'cancelled' and s.total > s.paid)")
	case "buyers":
		query = query.Where("exists (select 1 from sales s where s.customer_id = customers.id and s.status <> 'cancelled')")
	case "shop":
		query = query.Where("coalesce(password_hash,'') <> ''")
	}
	if campaign.ActiveDays > 0 {
		query = query.Where("exists (select 1 from sales s where s.customer_id = customers.id and s.created_at >= now() - make_interval(days => ?))", campaign.ActiveDays)
	}
	var rows []models.Customer
	query.Order("id asc").Find(&rows)
	return rows
}

func (s *Server) campaignPreview(c *fiber.Ctx) error {
	var campaign models.Campaign
	if s.DB.First(&campaign, c.Params("id")).Error != nil {
		return fiber.ErrNotFound
	}
	rows := s.campaignAudience(campaign)
	sample := make([]fiber.Map, 0, 5)
	for index, row := range rows {
		if index >= 5 {
			break
		}
		sample = append(sample, fiber.Map{"name": row.Name, "phone": row.Phone,
			"preview": messaging.Render(campaign.Body, s.customerValues(row))})
	}
	parts, unicode := messaging.SMSParts(campaign.Body)
	return c.JSON(fiber.Map{"count": len(rows), "sample": sample,
		"sms": fiber.Map{"parts": parts, "unicode": unicode, "billed": parts * len(rows)}})
}

func (s *Server) customerValues(customer models.Customer) map[string]string {
	return map[string]string{
		"nom": customer.Name, "telephone": customer.Phone,
		"boutique": s.readCheckoutSettings().InvoiceDefaults.CompanyName,
		"date":     frenchDate(time.Now()),
	}
}

// sendCampaign materialise l'audience en messages. Passe ce point la campagne
// ne bouge plus : son bilan compte des lignes reelles, pas une estimation.
func (s *Server) sendCampaign(c *fiber.Ctx) error {
	var campaign models.Campaign
	if s.DB.First(&campaign, c.Params("id")).Error != nil {
		return fiber.ErrNotFound
	}
	if campaign.Status == "sending" || campaign.Status == "sent" {
		return fiber.NewError(422, "Cette campagne a déjà été lancée.")
	}
	if strings.TrimSpace(campaign.Body) == "" {
		return fiber.NewError(422, "Le message de la campagne est vide.")
	}
	config := s.readMessagingConfig()
	if campaign.Channel == "whatsapp" && !config.WhatsApp.Enabled {
		return fiber.NewError(422, "Activez WhatsApp avant de lancer une campagne.")
	}
	if campaign.Channel == "sms" && !config.SMS.Enabled {
		return fiber.NewError(422, "Activez le SMS avant de lancer une campagne.")
	}
	rows := s.campaignAudience(campaign)
	if len(rows) == 0 {
		return fiber.NewError(422, "Aucun destinataire ne correspond à cette audience.")
	}
	now := time.Now()
	// L'heure d'envoi est reportee sur chaque message : le facteur, lui, ne
	// connait que la file, pas les campagnes.
	scheduled := campaign.ScheduledAt
	if scheduled != nil && scheduled.Before(now) {
		scheduled = nil
	}
	queued, skipped := 0, 0
	seen := map[string]bool{}
	for _, row := range rows {
		phone := messaging.NormalisePhone(row.Phone)
		if phone == "" || seen[phone] {
			skipped++
			continue
		}
		seen[phone] = true
		customerID := row.ID
		campaignID := campaign.ID
		message := models.Message{
			CustomerID: &customerID, CampaignID: &campaignID, Channel: campaign.Channel,
			Type: "campaign", Recipient: row.Phone, Subject: campaign.Subject,
			Body: messaging.Render(campaign.Body, s.customerValues(row)), ScheduledAt: scheduled,
		}
		if s.queue(&message) == nil {
			queued++
		}
	}
	userID, _ := c.Locals("userID").(uint)
	s.DB.Model(&campaign).Updates(map[string]any{
		"status": "sending", "started_at": &now, "total": queued + skipped,
		"sent": 0, "failed": 0, "skipped": skipped, "user_id": userID,
	})
	s.log(c, "send", "campaigns", campaign.ID, fmt.Sprintf("Campagne « %s » : %d destinataire(s) par %s", campaign.Name, queued, channelLabel(campaign.Channel)))
	s.DB.First(&campaign, campaign.ID)
	return c.JSON(fiber.Map{"campaign": campaign, "queued": queued, "skipped": skipped})
}

// cancelCampaign retire de la file ce qui n'est pas encore parti. Les messages
// deja envoyes restent : on n'efface pas une trace d'envoi.
func (s *Server) cancelCampaign(c *fiber.Ctx) error {
	var campaign models.Campaign
	if s.DB.First(&campaign, c.Params("id")).Error != nil {
		return fiber.ErrNotFound
	}
	result := s.DB.Model(&models.Message{}).Where("campaign_id = ? and status = ?", campaign.ID, "queued").
		Updates(map[string]any{"status": "skipped", "error": "Campagne annulée"})
	now := time.Now()
	s.DB.Model(&campaign).Updates(map[string]any{"status": "cancelled", "finished_at": &now})
	s.refreshCampaign(campaign.ID)
	s.log(c, "cancel", "campaigns", campaign.ID, "Campagne annulée")
	return c.JSON(fiber.Map{"cancelled": result.RowsAffected})
}

// refreshCampaign recompte le bilan depuis les messages. Compter au fil de
// l'eau dans la campagne exposerait a un ecart en cas de redemarrage ; ici le
// compte est toujours reconstruit depuis la source.
func (s *Server) refreshCampaign(id uint) {
	var counts struct {
		Sent, Failed, Skipped, Pending int64
	}
	s.DB.Raw(`select
		count(*) filter (where status = 'sent') sent,
		count(*) filter (where status = 'failed') failed,
		count(*) filter (where status = 'skipped') skipped,
		count(*) filter (where status in ('queued','sending')) pending
		from messages where campaign_id = ?`, id).Scan(&counts)
	updates := map[string]any{"sent": counts.Sent, "failed": counts.Failed, "skipped": counts.Skipped}
	if counts.Pending == 0 {
		var campaign models.Campaign
		if s.DB.First(&campaign, id).Error == nil && campaign.Status == "sending" {
			now := time.Now()
			updates["status"], updates["finished_at"] = "sent", &now
		}
	}
	s.DB.Model(&models.Campaign{}).Where("id = ?", id).Updates(updates)
}

// campaignReport rend le detail des envois d'une campagne, echecs en tete :
// c'est ce que le gerant regarde en premier.
func (s *Server) campaignReport(c *fiber.Ctx) error {
	var campaign models.Campaign
	if s.DB.First(&campaign, c.Params("id")).Error != nil {
		return fiber.ErrNotFound
	}
	s.refreshCampaign(campaign.ID)
	s.DB.First(&campaign, campaign.ID)
	var messages []models.Message
	s.DB.Where("campaign_id = ?", campaign.ID).
		Order("case status when 'failed' then 0 when 'queued' then 1 when 'sending' then 2 else 3 end, id asc").
		Limit(500).Find(&messages)
	return c.JSON(fiber.Map{"campaign": campaign, "messages": messages})
}

// ---------- envoi d'essai ----------

// testMessage envoie tout de suite, hors file : l'interet d'un essai est de
// voir l'erreur, pas de la retrouver dans un journal dix secondes plus tard.
func (s *Server) testMessage(c *fiber.Ctx) error {
	var in struct {
		Channel string `json:"channel"`
		To      string `json:"to"`
		Body    string `json:"body"`
	}
	if c.BodyParser(&in) != nil {
		return fiber.ErrBadRequest
	}
	if in.Channel != "sms" {
		in.Channel = "whatsapp"
	}
	if strings.TrimSpace(in.Body) == "" {
		in.Body = "Message d'essai SenValise."
	}
	if messaging.NormalisePhone(in.To) == "" {
		return fiber.NewError(422, "Numéro de destinataire invalide.")
	}
	config := s.readMessagingConfig()
	message := models.Message{Channel: in.Channel, Type: "test", Recipient: in.To,
		Subject: "Essai", Body: in.Body, Status: "sending", Attempts: 1}
	if err := s.DB.Create(&message).Error; err != nil {
		return err
	}
	external, err := s.deliver(config, &message)
	if err != nil {
		s.DB.Model(&message).Updates(map[string]any{"status": "failed", "error": trimError(err.Error())})
		return fiber.NewError(502, err.Error())
	}
	now := time.Now()
	s.DB.Model(&message).Updates(map[string]any{"status": "sent", "sent_at": &now, "external_id": external})
	return c.JSON(fiber.Map{"sent": true, "externalId": external})
}

// retryMessage remet un echec dans la file, apres correction du numero ou de
// la configuration.
func (s *Server) retryMessage(c *fiber.Ctx) error {
	var message models.Message
	if s.DB.First(&message, c.Params("id")).Error != nil {
		return fiber.ErrNotFound
	}
	if message.Status == "queued" || message.Status == "sending" {
		return fiber.NewError(422, "Ce message est déjà en attente d'envoi.")
	}
	if err := s.DB.Model(&message).Updates(map[string]any{"status": "queued", "error": "", "scheduled_at": nil}).Error; err != nil {
		return err
	}
	return c.JSON(fiber.Map{"queued": true})
}

// registerMessaging accroche les routes authentifiees. Le lien public d'un
// document, lui, est declare plus haut dans Register : il doit precede le
// groupe « /api », dont le middleware s'applique par prefixe.
func (s *Server) registerMessaging(a fiber.Router) {
	a.Get("/messaging/config", s.messagingConfig)
	a.Put("/messaging/config", s.updateMessagingConfig)
	a.Get("/messaging/status", s.messagingStatus)
	a.Post("/messaging/session/:action", s.whatsappSession)
	a.Get("/messaging/qr", s.whatsappQR)
	a.Post("/messaging/test", s.testMessage)
	a.Post("/messages/:id/retry", s.retryMessage)

	// L'envoi d'une piece reste ouvert au vendeur : c'est le prolongement de
	// la vente qu'il vient de saisir. Le PDF suit la meme regle.
	a.Get("/documents/:kind/:id/pdf", s.documentPDFHandler)
	a.Post("/documents/:kind/:id/send", s.sendDocument)

	a.Get("/debts", s.debts)
	a.Post("/debts/remind", s.remindDebtors)

	a.Get("/campaigns/:id/preview", s.campaignPreview)
	a.Get("/campaigns/:id/report", s.campaignReport)
	a.Post("/campaigns/:id/send", s.sendCampaign)
	a.Post("/campaigns/:id/cancel", s.cancelCampaign)
}
