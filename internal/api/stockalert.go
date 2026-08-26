package api

import (
	"bytes"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
	"github.com/gofiber/fiber/v2"

	"senvalise/internal/messaging"
	"senvalise/internal/models"
)

// L'alerte de rupture.
//
// Une rupture de stock ne se decouvre pas en ouvrant l'application : elle se
// decouvre devant la cliente, quand la valise qu'elle veut n'est plus la. Le
// tableau de bord la signalait deja, mais il fallait penser a le regarder —
// et personne ne consulte un ecran de gestion le matin avant d'ouvrir.
//
// La boutique previent donc d'elle-meme, une fois par jour, sur un numero
// choisi. Le message dit l'essentiel en trois lignes ; le detail complet part
// en piece jointe, sous la forme d'un document qui se lit et s'imprime.

type stockAlertLine struct {
	Product  string `json:"product"`
	SKU      string `json:"sku"`
	Category string `json:"category"`
	Stock    int64  `json:"stock"`
	AlertAt  int64  `json:"alertAt"`
	Price    int64  `json:"price"`
}

type stockAlertReport struct {
	At      time.Time        `json:"at"`
	Out     []stockAlertLine `json:"out"`
	Low     []stockAlertLine `json:"low"`
	Shop    string           `json:"shop"`
	Missing int64            `json:"missing"`
}

// stockReport rassemble ce qui manque et ce qui va manquer.
//
// « Va manquer » n'a de sens que si un seuil a ete pose sur la declinaison :
// sans seuil, on ne peut pas savoir si trois pieces sont confortables ou
// critiques, et alerter sur tout reviendrait a n'alerter sur rien.
func (s *Server) stockReport() stockAlertReport {
	report := stockAlertReport{At: time.Now(), Shop: s.readBranding().SiteName}
	query := `select coalesce(nullif(p.name,''), v.sku, 'Article') product, v.sku,
	                 coalesce(c.name,'Sans catégorie') category,
	                 v.stock, v.alert_at, v.price
	    from product_variants v
	    left join products p on p.id = v.product_id
	    left join categories c on c.id = p.category_id
	   where v.active and %s
	   order by product asc`
	s.DB.Raw(fmt.Sprintf(query, "v.stock <= 0")).Scan(&report.Out)
	s.DB.Raw(fmt.Sprintf(query, "v.stock > 0 and v.alert_at > 0 and v.stock <= v.alert_at")).Scan(&report.Low)
	// Ce qu'il faudrait racheter pour repasser au-dessus des seuils : c'est le
	// seul chiffre qui repond a « combien je commande ? ».
	for _, line := range report.Low {
		report.Missing += line.AlertAt - line.Stock
	}
	return report
}

// stockAlertMessage ecrit le texte du message.
//
// Trois lignes, lisibles sur l'ecran de verrouillage d'un telephone : le
// destinataire doit savoir s'il doit ouvrir la piece jointe avant de l'ouvrir.
func stockAlertMessage(report stockAlertReport) string {
	if len(report.Out) == 0 && len(report.Low) == 0 {
		return fmt.Sprintf("%s — stock du %s : rien en rupture, rien sous le seuil d’alerte.",
			report.Shop, frenchDate(report.At))
	}
	lines := []string{fmt.Sprintf("*%s — alerte stock du %s*", report.Shop, frenchDate(report.At))}
	if n := len(report.Out); n > 0 {
		lines = append(lines, plural(int64(n), "• 1 produit est en rupture : il ne peut plus être vendu.",
			"• %d produits sont en rupture : ils ne peuvent plus être vendus."))
	}
	if n := len(report.Low); n > 0 {
		lines = append(lines, plural(int64(n), "• 1 produit passe sous son seuil d’alerte.",
			"• %d produits passent sous leur seuil d’alerte."))
	}
	// Les trois premiers noms suffisent a decider s'il faut ouvrir le
	// document : au-dela, la liste devient un mur de texte sur un telephone.
	names := []string{}
	for _, line := range append(append([]stockAlertLine{}, report.Out...), report.Low...) {
		if len(names) == 3 {
			break
		}
		names = append(names, line.Product)
	}
	if len(names) > 0 {
		suffix := ""
		if len(report.Out)+len(report.Low) > len(names) {
			suffix = "…"
		}
		lines = append(lines, "Concernés : "+strings.Join(names, ", ")+suffix)
	}
	lines = append(lines, "Le détail complet est en pièce jointe.")
	return strings.Join(lines, "\n")
}

// plural rend la phrase au singulier ou au pluriel. Les deux formes sont
// ecrites en toutes lettres plutot que bricolees avec un « (s) » : le message
// est lu sur un telephone par quelqu'un qui n'aime pas les ordinateurs, et
// « 1 produit(s) » est exactement ce qui donne l'impression d'une machine.
func plural(count int64, one, many string) string {
	if count == 1 {
		return one
	}
	return strings.Replace(many, "%d", strconv.FormatInt(count, 10), 1)
}

// stockAlertPDF compose le document joint au message.
//
// Il reprend le papier a en-tete des factures : c'est la meme maison, et un
// document de gestion qui ne ressemblerait a rien serait le premier a etre
// jete. Deux tableaux, celui des ruptures d'abord — ce sont les ventes deja
// perdues.
func (s *Server) stockAlertPDF(report stockAlertReport) ([]byte, error) {
	pdf := fpdf.New("P", "mm", "A4", "")
	font, tr := setupFont(pdf)
	latin := pdf.UnicodeTranslatorFromDescriptor("")
	pdf.SetTitle("Alerte stock "+frenchDate(report.At), true)
	pdf.SetAutoPageBreak(true, 26)
	const left, right = 15.0, 195.0
	width := right - left

	company := s.readCheckoutSettings().InvoiceDefaults
	logoFormat, logo := s.brandingLogoFile()

	pdf.SetFooterFunc(func() {
		const top, bottom = 280.0, 297.0
		setFill(pdf, brandBlue)
		pdf.Polygon([]fpdf.PointType{{X: 0, Y: top}, {X: 151, Y: top}, {X: 145, Y: bottom}, {X: 0, Y: bottom}}, "F")
		setFill(pdf, brandYellow)
		pdf.Polygon([]fpdf.PointType{{X: 151, Y: top}, {X: 210, Y: top}, {X: 210, Y: bottom}, {X: 145, Y: bottom}}, "F")
		pdf.SetTextColor(255, 255, 255)
		pdf.SetXY(left, top+5.5)
		pdf.SetFont("Times", "I", 12)
		pdf.CellFormat(pdf.GetStringWidth(latin(company.CompanyName+","))+1.5, 6, latin(company.CompanyName+","), "", 0, "L", false, 0, "")
		pdf.SetFont(font, "", 8)
		pdf.CellFormat(70, 6, tr("votre compagnon de voyage !"), "", 0, "L", false, 0, "")
		pdf.SetFont(font, "B", 8)
		pdf.SetXY(right-30, top+5.5)
		pdf.CellFormat(30, 6, fmt.Sprintf("%d / {np}", pdf.PageNo()), "", 0, "R", false, 0, "")
	})
	pdf.AliasNbPages("{np}")
	pdf.AddPage()

	// En-tete.
	textLeft := left
	if logoFormat != "" && len(logo) > 0 {
		pdf.RegisterImageOptionsReader("logo", fpdf.ImageOptions{ImageType: logoFormat}, bytes.NewReader(logo))
		if info := pdf.GetImageInfo("logo"); info != nil && info.Height() > 0 {
			box := 26.0
			w, h := box, box
			if info.Width() > info.Height() {
				h = box * info.Height() / info.Width()
			} else {
				w = box * info.Width() / info.Height()
			}
			pdf.ImageOptions("logo", left, 14+(box-h)/2, w, h, false, fpdf.ImageOptions{ImageType: logoFormat}, 0, "")
			textLeft = left + box + 6
		}
	}
	setInk(pdf, brandBlue)
	pdf.SetFont(font, "B", 20)
	pdf.SetXY(textLeft, 16)
	pdf.CellFormat(120, 9, tr("ÉTAT DU STOCK"), "", 2, "L", false, 0, "")
	setInk(pdf, brandInk)
	pdf.SetFont(font, "", 9.5)
	pdf.CellFormat(120, 5, tr(strings.ToUpper(company.CompanyName)+" · "+frenchDate(report.At)), "", 0, "L", false, 0, "")
	setFill(pdf, brandBlue)
	pdf.Rect(left, 42, width*2/3, 1.6, "F")
	setFill(pdf, brandYellow)
	pdf.Rect(left+width*2/3, 42, width/3, 1.6, "F")
	pdf.SetY(50)

	// Trois chiffres en tete : ce que le lecteur retient s'il ne lit rien
	// d'autre.
	figures := [][2]string{
		{"EN RUPTURE", strconv.Itoa(len(report.Out))},
		{"SOUS LE SEUIL", strconv.Itoa(len(report.Low))},
		{"PIÈCES À RACHETER", strconv.FormatInt(report.Missing, 10)},
	}
	for index, figure := range figures {
		x := left + float64(index)*(width/3)
		pdf.SetFillColor(246, 248, 251)
		pdf.RoundedRect(x, pdf.GetY(), width/3-4, 18, 2.5, "1234", "F")
		setInk(pdf, brandMuted)
		pdf.SetFont(font, "B", 7)
		pdf.SetXY(x+4, pdf.GetY()+3)
		pdf.CellFormat(width/3-12, 4, tr(figure[0]), "", 2, "L", false, 0, "")
		setInk(pdf, brandInk)
		pdf.SetFont(font, "B", 15)
		pdf.CellFormat(width/3-12, 8, figure[1], "", 0, "L", false, 0, "")
		pdf.SetY(pdf.GetY() - 7)
	}
	pdf.SetY(pdf.GetY() + 18)

	table := func(title string, lines []stockAlertLine, tone [3]int, empty string) {
		pdf.Ln(8)
		setInk(pdf, tone)
		pdf.SetFont(font, "B", 11)
		pdf.SetX(left)
		pdf.CellFormat(width, 7, tr(title), "", 1, "L", false, 0, "")
		if len(lines) == 0 {
			setInk(pdf, brandMuted)
			pdf.SetFont(font, "", 9)
			pdf.SetX(left)
			pdf.CellFormat(width, 6, tr(empty), "", 1, "L", false, 0, "")
			return
		}
		columns := []struct {
			label string
			w     float64
			align string
		}{{"PRODUIT", 0, "L"}, {"RÉFÉRENCE", 40, "L"}, {"CATÉGORIE", 36, "L"}, {"STOCK", 18, "C"}, {"SEUIL", 18, "C"}}
		fixed := 0.0
		for _, c := range columns {
			fixed += c.w
		}
		columns[0].w = width - fixed
		setFill(pdf, tone)
		pdf.SetTextColor(255, 255, 255)
		pdf.SetFont(font, "B", 7.2)
		pdf.SetX(left)
		for _, c := range columns {
			pdf.CellFormat(c.w, 7, tr(c.label), "", 0, c.align, true, 0, "")
		}
		pdf.Ln(-1)
		for index, line := range lines {
			if pdf.GetY() > 258 {
				pdf.AddPage()
			}
			if index%2 == 1 {
				pdf.SetFillColor(246, 248, 251)
				pdf.Rect(left, pdf.GetY(), width, 7, "F")
			}
			setInk(pdf, brandInk)
			pdf.SetFont(font, "B", 8.5)
			pdf.SetX(left)
			pdf.CellFormat(columns[0].w, 7, tr(line.Product), "", 0, "L", false, 0, "")
			pdf.SetFont(font, "", 8)
			setInk(pdf, brandMuted)
			pdf.CellFormat(columns[1].w, 7, tr(line.SKU), "", 0, "L", false, 0, "")
			pdf.CellFormat(columns[2].w, 7, tr(line.Category), "", 0, "L", false, 0, "")
			setInk(pdf, tone)
			pdf.SetFont(font, "B", 8.5)
			pdf.CellFormat(columns[3].w, 7, strconv.FormatInt(line.Stock, 10), "", 0, "C", false, 0, "")
			setInk(pdf, brandMuted)
			pdf.SetFont(font, "", 8)
			seuil := "—"
			if line.AlertAt > 0 {
				seuil = strconv.FormatInt(line.AlertAt, 10)
			}
			pdf.CellFormat(columns[4].w, 7, seuil, "", 1, "C", false, 0, "")
			setStroke(pdf, brandLine)
			pdf.Line(left, pdf.GetY(), right, pdf.GetY())
		}
	}
	table("EN RUPTURE — ces produits ne peuvent plus être vendus", report.Out,
		[3]int{192, 38, 38}, "Aucun produit en rupture.")
	table("SOUS LE SEUIL D’ALERTE — à racheter bientôt", report.Low,
		brandBlue, "Aucun produit sous son seuil.")

	var out bytes.Buffer
	if err := pdf.Output(&out); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// stockAlertDocKind marque les messages qui portent l'etat du stock. Il n'est
// rattache a aucune table : le document est compose a l'envoi.
const stockAlertDocKind = "stock"

const stockAlertRunKey = "messaging_last_stock_alert"

// queueStockAlert met l'alerte en file. Elle rend ce qui a ete decide, pour
// que l'envoi manuel puisse le dire a l'ecran.
func (s *Server) queueStockAlert(config messaging.Config, force bool) (string, error) {
	phone := strings.TrimSpace(config.StockAlert.Phone)
	if phone == "" {
		return "", fmt.Errorf("aucun numéro d’alerte n’est renseigné")
	}
	report := s.stockReport()
	if config.StockAlert.OnlyWhenNeeded && !force && len(report.Out) == 0 && len(report.Low) == 0 {
		return "rien à signaler : aucun message envoyé", nil
	}
	message := models.Message{
		Channel: config.StockAlert.Channel, Type: "stock-alert", Status: "queued",
		Recipient: phone, Subject: "État du stock", Body: stockAlertMessage(report),
	}
	// Le SMS ne porte pas de piece jointe : le message se suffit alors a
	// lui-meme, et joindre un document invisible ne ferait qu'echouer.
	if config.StockAlert.Channel == "whatsapp" {
		message.DocKind = stockAlertDocKind
	}
	if err := s.DB.Create(&message).Error; err != nil {
		return "", err
	}
	return fmt.Sprintf("alerte mise en file pour %s — %d en rupture, %d sous le seuil",
		phone, len(report.Out), len(report.Low)), nil
}

// runStockAlert passe une fois par jour, a l'heure choisie.
//
// Le temoin en base porte la date du dernier envoi : un redemarrage du serveur
// ne doit pas declencher une seconde alerte, et deux processus ne doivent pas
// en envoyer deux.
func (s *Server) runStockAlert() {
	config := s.readMessagingConfig()
	if !config.StockAlert.Enabled || strings.TrimSpace(config.StockAlert.Phone) == "" {
		return
	}
	now := time.Now()
	if now.Hour() < config.StockAlert.Hour {
		return
	}
	today := now.Format("2006-01-02")
	var row models.Setting
	if s.DB.Where("key = ?", stockAlertRunKey).First(&row).Error == nil {
		if row.Value == today {
			return
		}
		s.DB.Model(&row).Update("value", today)
	} else if s.DB.Create(&models.Setting{Key: stockAlertRunKey, Value: today}).Error != nil {
		return
	}
	_, _ = s.queueStockAlert(config, false)
}

// sendStockAlertNow declenche l'alerte a la demande, sans attendre l'heure.
// Elle part meme si rien ne manque : c'est le seul moyen de verifier que le
// numero est le bon.
func (s *Server) sendStockAlertNow(c *fiber.Ctx) error {
	note, err := s.queueStockAlert(s.readMessagingConfig(), true)
	if err != nil {
		return fiber.NewError(422, err.Error())
	}
	s.log(c, "stock-alert", "messages", 0, note)
	return c.JSON(fiber.Map{"note": note})
}

// stockAlertPreview rend le document sans rien envoyer : on veut pouvoir le
// lire avant de le faire partir, et l'imprimer pour aller en magasin.
func (s *Server) stockAlertPreview(c *fiber.Ctx) error {
	raw, err := s.stockAlertPDF(s.stockReport())
	if err != nil {
		return err
	}
	c.Set("Content-Type", "application/pdf")
	c.Set("Content-Disposition", `inline; filename="Etat-du-stock.pdf"`)
	return c.Send(raw)
}

// stockAlertSummary alimente l'ecran : les memes chiffres que le document.
func (s *Server) stockAlertSummary(c *fiber.Ctx) error {
	report := s.stockReport()
	return c.JSON(fiber.Map{
		"out": report.Out, "low": report.Low, "missing": report.Missing,
		"outCount": len(report.Out), "lowCount": len(report.Low),
	})
}
