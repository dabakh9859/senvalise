package api

import (
	"bytes"
	"fmt"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"

	"senvalise/internal/messaging"
	"senvalise/internal/models"
)

// Rendu PDF des pieces commerciales.
//
// L'ecran imprime deja le document via le navigateur, mais un envoi WhatsApp
// part du serveur : il n'y a aucun navigateur dans la boucle. Le PDF est donc
// compose ici, en Go, sans dependance externe ni processus enfant — sur un
// serveur qui heberge aussi PostgreSQL et un Chromium pilote par WAHA, faire
// tourner un second navigateur pour imprimer une facture serait le meilleur
// moyen de tomber a court de memoire au pire moment.
//
// Le document est reconstruit a chaque envoi plutot que stocke : un client qui
// redemande sa facture apres un acompte doit recevoir le solde a jour.

// Police : les fontes de base de fpdf sont encodees en cp1252, qui couvre tout
// le francais. Cela evite d'embarquer un fichier TTF dans le binaire.
const pdfFont = "Helvetica"

type pdfLine struct {
	Description string
	Reference   string
	Quantity    int64
	UnitPrice   int64
	Discount    int64
	Total       int64
}

type pdfMeta struct{ Label, Value string }

type pdfDocument struct {
	Kind        string
	Title       string
	Reference   string
	IssuedAt    time.Time
	Company     invoiceDefaults
	CustomerRow []string
	Meta        []pdfMeta
	Lines       []pdfLine
	ShowAmounts bool
	Subtotal    int64
	Discount    int64
	Tax         int64
	Total       int64
	Paid        int64
	Remaining   int64
	Notes       string
	Seller      string
	// Logo de l'entreprise, lu sur disque au moment du rendu. fpdf ne sait pas
	// dessiner de SVG : un logo vectoriel reste absent du PDF, le bandeau de
	// couleur tient alors lieu de marque.
	LogoFormat string
	Logo       []byte
}

var documentTitles = map[string]string{"invoice": "Facture", "quote": "Devis", "delivery": "Bon de livraison"}

// documentFileName donne un nom lisible dans la conversation WhatsApp du
// client : « Facture-FAC-2026-00042.pdf ».
func documentFileName(kind, reference string) string {
	title := documentTitles[kind]
	if title == "" {
		title = "Document"
	}
	safe := strings.Map(func(r rune) rune {
		if strings.ContainsRune(`\/:*?"<>|`, r) {
			return '-'
		}
		return r
	}, reference)
	return fmt.Sprintf("%s-%s.pdf", strings.ReplaceAll(title, " ", "-"), safe)
}

// loadDocument rassemble une piece commerciale, quel que soit son genre, dans
// la forme neutre attendue par le rendu. Les trois tables ont des colonnes
// differentes mais le meme papier : la conversion se fait une fois, ici.
func (s *Server) loadDocument(kind string, id uint) (pdfDocument, error) {
	settings := s.readCheckoutSettings().InvoiceDefaults
	doc := pdfDocument{Kind: kind, Title: documentTitles[kind], Company: settings, ShowAmounts: kind != "delivery"}
	if doc.Title == "" {
		return doc, fmt.Errorf("type de document inconnu")
	}

	customer := func(row *models.Customer) {
		if row == nil {
			doc.CustomerRow = []string{"Client comptoir", "", ""}
			return
		}
		doc.CustomerRow = []string{row.Name, row.Phone, row.Address}
	}

	switch kind {
	case "invoice":
		var sale models.Sale
		if s.DB.Preload("Items.Variant.Product").Preload("Customer").Preload("User").First(&sale, id).Error != nil {
			return doc, fmt.Errorf("facture introuvable")
		}
		doc.Reference, doc.IssuedAt = sale.Reference, sale.CreatedAt
		doc.Subtotal, doc.Discount, doc.Tax, doc.Total = sale.Subtotal, sale.Discount, sale.Tax, sale.Total
		doc.Paid = min64(sale.Paid, sale.Total)
		doc.Remaining = max64(sale.Total-sale.Paid, 0)
		customer(sale.Customer)
		// Une facture porte son propre en-tete : il a pu etre personnalise a
		// l'emission, et le document doit rester fidele a ce qui a ete signe.
		overrideCompany(&doc.Company, sale.InvoiceCompanyName, sale.InvoiceTagline, sale.InvoicePhone, sale.InvoiceAddress, sale.InvoiceThankYouTitle, sale.InvoiceFooterNote)
		status := "Soldée"
		if doc.Remaining > 0 {
			status = "Reste " + messaging.Money(doc.Remaining)
		}
		doc.Meta = []pdfMeta{{"RÈGLEMENT", status}, {"MODE", paymentLabel(sale.PaymentMethod)}}
		for _, item := range sale.Items {
			doc.Lines = append(doc.Lines, pdfLine{
				Description: lineLabel("", item.Variant), Reference: variantSKU(item.Variant),
				Quantity: item.Quantity, UnitPrice: item.UnitPrice, Discount: item.Discount, Total: item.Total,
			})
		}
		if sale.User != nil {
			doc.Seller = sale.User.Name
		}
	case "quote":
		var quote models.Quote
		if s.DB.Preload("Items.Variant.Product").Preload("Customer").Preload("User").First(&quote, id).Error != nil {
			return doc, fmt.Errorf("devis introuvable")
		}
		doc.Reference, doc.IssuedAt = quote.Reference, quote.CreatedAt
		doc.Subtotal, doc.Discount, doc.Tax, doc.Total = quote.Subtotal, quote.Discount, quote.Tax, quote.Total
		doc.Notes = quote.Notes
		customer(quote.Customer)
		validity := "Sans échéance"
		if quote.ValidUntil != nil {
			validity = "Valable jusqu'au " + frenchDate(*quote.ValidUntil)
		}
		doc.Meta = []pdfMeta{{"VALIDITÉ", validity}, {"ÉTAT", quoteStatusLabel(quote.Status)}}
		for _, item := range quote.Items {
			doc.Lines = append(doc.Lines, pdfLine{
				Description: lineLabel(item.Description, item.Variant), Reference: variantSKU(item.Variant),
				Quantity: item.Quantity, UnitPrice: item.UnitPrice, Discount: item.Discount, Total: item.Total,
			})
		}
		if quote.User != nil {
			doc.Seller = quote.User.Name
		}
	case "delivery":
		var note models.DeliveryNote
		if s.DB.Preload("Items.Variant.Product").Preload("Customer").Preload("User").Preload("Sale").First(&note, id).Error != nil {
			return doc, fmt.Errorf("bon de livraison introuvable")
		}
		doc.Reference, doc.IssuedAt = note.Reference, note.CreatedAt
		doc.Notes = note.Notes
		customer(note.Customer)
		invoice := "—"
		if note.Sale != nil {
			invoice = note.Sale.Reference
		}
		doc.Meta = []pdfMeta{{"LIVRAISON", deliveryStatusLabel(note.Status)}, {"FACTURE", invoice}}
		for _, item := range note.Items {
			doc.Lines = append(doc.Lines, pdfLine{
				Description: lineLabel(item.Description, item.Variant), Reference: variantSKU(item.Variant),
				Quantity: item.Quantity,
			})
		}
		if note.User != nil {
			doc.Seller = note.User.Name
		}
	}
	if doc.Reference == "" {
		return doc, fmt.Errorf("document introuvable")
	}
	return doc, nil
}

func overrideCompany(target *invoiceDefaults, name, tagline, phone, address, thanks, footer string) {
	for _, pair := range []struct {
		value string
		field *string
	}{{name, &target.CompanyName}, {tagline, &target.Tagline}, {phone, &target.Phone},
		{address, &target.Address}, {thanks, &target.ThankYouTitle}, {footer, &target.FooterNote}} {
		if strings.TrimSpace(pair.value) != "" {
			*pair.field = pair.value
		}
	}
}

func lineLabel(description string, variant *models.ProductVariant) string {
	if strings.TrimSpace(description) != "" {
		return description
	}
	if variant != nil && variant.Product != nil {
		return variant.Product.Name
	}
	return "Article"
}

func variantSKU(variant *models.ProductVariant) string {
	if variant == nil {
		return ""
	}
	return variant.SKU
}

func paymentLabel(method string) string {
	labels := map[string]string{"cash": "Espèces", "wave": "Wave", "orange_money": "Orange Money",
		"card": "Carte bancaire", "credit": "Crédit", "bank_transfer": "Virement", "vault": "Coffre"}
	if label, ok := labels[method]; ok {
		return label
	}
	if method == "" {
		return "—"
	}
	return method
}

func quoteStatusLabel(status string) string {
	labels := map[string]string{"draft": "Brouillon", "sent": "Envoyé", "accepted": "Accepté", "refused": "Refusé", "expired": "Expiré"}
	if label, ok := labels[status]; ok {
		return label
	}
	return status
}

func deliveryStatusLabel(status string) string {
	labels := map[string]string{"pending": "À livrer", "delivered": "Livré", "cancelled": "Annulé"}
	if label, ok := labels[status]; ok {
		return label
	}
	return status
}

var frenchMonths = []string{"janvier", "février", "mars", "avril", "mai", "juin",
	"juillet", "août", "septembre", "octobre", "novembre", "décembre"}

func frenchDate(at time.Time) string {
	local := at.Local()
	return fmt.Sprintf("%d %s %d", local.Day(), frenchMonths[int(local.Month())-1], local.Year())
}

func min64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

// renderPDF compose le document. La mise en page reprend celle de l'ecran :
// bandeau de marque, titre et reference, emetteur / client / etat, tableau des
// lignes, totaux, mot de remerciement et cartouche de signatures.
func renderPDF(doc pdfDocument) ([]byte, error) {
	pdf := fpdf.New("P", "mm", "A4", "")
	tr := pdf.UnicodeTranslatorFromDescriptor("") // cp1252 : les accents francais passent
	pdf.SetTitle(doc.Title+" "+doc.Reference, true)
	pdf.SetAutoPageBreak(true, 22)
	const left, right = 15.0, 195.0
	width := right - left

	// Pied de page repete : le lecteur d'une facture de plusieurs pages doit
	// savoir de quelle piece il s'agit sans revenir a la premiere.
	pdf.SetFooterFunc(func() {
		pdf.SetY(-16)
		pdf.SetFont(pdfFont, "", 7.5)
		pdf.SetTextColor(130, 130, 130)
		footer := fmt.Sprintf("%s %s · %s · %s · %s", doc.Title, doc.Reference,
			doc.Company.CompanyName, doc.Company.Address, doc.Company.Phone)
		pdf.CellFormat(width-20, 5, tr(footer), "", 0, "L", false, 0, "")
		pdf.CellFormat(20, 5, fmt.Sprintf("%d/{np}", pdf.PageNo()), "", 0, "R", false, 0, "")
	})
	pdf.AliasNbPages("{np}")
	pdf.AddPage()

	// Bandeau de marque. Le logo televerse y prend la place du nom quand il
	// existe : c'est la meme image que celle de la boutique et de l'onglet du
	// navigateur, un document ne doit pas porter une autre marque que le site.
	pdf.SetFillColor(21, 41, 214)
	pdf.Rect(left, 12, width, 18, "F")
	pdf.SetTextColor(255, 255, 255)
	textLeft := left + 5
	if doc.LogoFormat != "" && len(doc.Logo) > 0 {
		pdf.RegisterImageOptionsReader("logo", fpdf.ImageOptions{ImageType: doc.LogoFormat}, bytes.NewReader(doc.Logo))
		if info := pdf.GetImageInfo("logo"); info != nil && info.Height() > 0 {
			// Hauteur imposee, largeur deduite : un logo large ne doit pas
			// deborder sur le telephone affiche a droite du bandeau.
			height := 12.0
			logoWidth := height * info.Width() / info.Height()
			if logoWidth > 46 {
				logoWidth = 46
				height = logoWidth * info.Height() / info.Width()
			}
			pdf.ImageOptions("logo", left+5, 12+(18-height)/2, logoWidth, height, false, fpdf.ImageOptions{ImageType: doc.LogoFormat}, 0, "")
			textLeft = left + 5 + logoWidth + 5
		}
	}
	pdf.SetXY(textLeft, 15)
	pdf.SetFont(pdfFont, "B", 13)
	pdf.CellFormat(90, 6, tr(doc.Company.CompanyName), "", 0, "L", false, 0, "")
	pdf.SetFont(pdfFont, "", 8.5)
	pdf.CellFormat(80, 6, tr(doc.Company.Phone), "", 0, "R", false, 0, "")
	pdf.SetXY(textLeft, 21)
	pdf.SetFont(pdfFont, "", 8.5)
	pdf.CellFormat(90, 5, tr(doc.Company.Tagline), "", 0, "L", false, 0, "")
	pdf.CellFormat(80, 5, tr(doc.Company.Address), "", 0, "R", false, 0, "")

	// Titre et reference.
	pdf.SetTextColor(20, 20, 20)
	pdf.SetXY(left, 36)
	pdf.SetFont(pdfFont, "B", 20)
	pdf.CellFormat(110, 9, tr(strings.ToUpper(doc.Title)), "", 0, "L", false, 0, "")
	pdf.SetFont(pdfFont, "B", 12)
	pdf.CellFormat(width-110, 9, tr(doc.Reference), "", 1, "R", false, 0, "")
	pdf.SetX(left)
	pdf.SetFont(pdfFont, "", 9)
	pdf.SetTextColor(110, 110, 110)
	pdf.CellFormat(110, 5, "", "", 0, "L", false, 0, "")
	pdf.CellFormat(width-110, 5, tr("Émis le "+frenchDate(doc.IssuedAt)), "", 1, "R", false, 0, "")

	// Emetteur / destinataire / etat, en trois colonnes de meme largeur.
	pdf.Ln(4)
	top := pdf.GetY()
	column := width / 3
	recipientTitle := "CLIENT"
	if doc.Kind == "delivery" {
		recipientTitle = "DESTINATAIRE"
	}
	block := func(x float64, title string, lines []string) {
		pdf.SetXY(x, top)
		pdf.SetFont(pdfFont, "B", 7)
		pdf.SetTextColor(130, 130, 130)
		pdf.CellFormat(column-4, 4, tr(title), "", 2, "L", false, 0, "")
		pdf.SetTextColor(20, 20, 20)
		for index, line := range lines {
			if strings.TrimSpace(line) == "" {
				continue
			}
			style := ""
			size := 8.5
			if index == 0 {
				style, size = "B", 10
			}
			pdf.SetFont(pdfFont, style, size)
			pdf.MultiCell(column-4, 4.6, tr(line), "", "L", false)
			pdf.SetX(x)
		}
	}
	block(left, "ÉMETTEUR", []string{doc.Company.CompanyName, doc.Company.Address, doc.Company.Phone})
	block(left+column, recipientTitle, doc.CustomerRow)
	metaLines := make([]string, 0, 4)
	for index, meta := range doc.Meta {
		if index == 0 {
			metaLines = append(metaLines, meta.Value)
			continue
		}
		metaLines = append(metaLines, meta.Label+" : "+meta.Value)
	}
	metaTitle := "ÉTAT"
	if len(doc.Meta) > 0 {
		metaTitle = doc.Meta[0].Label
	}
	block(left+2*column, metaTitle, metaLines)

	// Tableau des lignes.
	pdf.SetY(maxFloat(pdf.GetY(), top+26))
	pdf.SetX(left)
	pdf.Ln(2)
	headers := []struct {
		label string
		width float64
		align string
	}{{"DÉSIGNATION", 0, "L"}, {"QTÉ", 16, "C"}}
	if doc.ShowAmounts {
		headers = append(headers,
			struct {
				label string
				width float64
				align string
			}{"PRIX UNITAIRE", 30, "R"},
			struct {
				label string
				width float64
				align string
			}{"REMISE", 24, "R"},
			struct {
				label string
				width float64
				align string
			}{"MONTANT", 30, "R"})
	}
	fixed := 0.0
	for _, header := range headers {
		fixed += header.width
	}
	headers[0].width = width - fixed

	pdf.SetFillColor(243, 244, 248)
	pdf.SetTextColor(90, 90, 90)
	pdf.SetFont(pdfFont, "B", 7.5)
	for _, header := range headers {
		pdf.CellFormat(header.width, 7, tr(header.label), "", 0, header.align, true, 0, "")
	}
	pdf.Ln(-1)

	pdf.SetTextColor(20, 20, 20)
	for _, line := range doc.Lines {
		// Hauteur de ligne calculee sur la designation : une intitule long ne
		// doit pas deborder sur la ligne suivante.
		pdf.SetFont(pdfFont, "", 9)
		label := line.Description
		if line.Reference != "" {
			label += "\n" + line.Reference
		}
		height := 5.0 * float64(len(pdf.SplitLines([]byte(tr(label)), headers[0].width-3)))
		if height < 8 {
			height = 8
		}
		if pdf.GetY()+height > 262 {
			pdf.AddPage()
		}
		x, y := left, pdf.GetY()
		pdf.SetXY(x, y+1)
		pdf.SetFont(pdfFont, "B", 9)
		pdf.MultiCell(headers[0].width-3, 4.6, tr(line.Description), "", "L", false)
		if line.Reference != "" {
			pdf.SetX(x)
			pdf.SetFont(pdfFont, "", 7.5)
			pdf.SetTextColor(130, 130, 130)
			pdf.MultiCell(headers[0].width-3, 4, tr(line.Reference), "", "L", false)
			pdf.SetTextColor(20, 20, 20)
		}
		bottom := pdf.GetY()
		pdf.SetXY(x+headers[0].width, y+1)
		pdf.SetFont(pdfFont, "", 9)
		pdf.CellFormat(headers[1].width, 6, fmt.Sprintf("%d", line.Quantity), "", 0, "C", false, 0, "")
		if doc.ShowAmounts {
			discount := "—"
			if line.Discount > 0 {
				discount = "- " + messaging.Money(line.Discount)
			}
			pdf.CellFormat(headers[2].width, 6, tr(messaging.Money(line.UnitPrice)), "", 0, "R", false, 0, "")
			pdf.CellFormat(headers[3].width, 6, tr(discount), "", 0, "R", false, 0, "")
			pdf.SetFont(pdfFont, "B", 9)
			pdf.CellFormat(headers[4].width, 6, tr(messaging.Money(line.Total)), "", 0, "R", false, 0, "")
		}
		pdf.SetY(maxFloat(bottom, y+8))
		pdf.SetDrawColor(232, 234, 240)
		pdf.Line(left, pdf.GetY(), right, pdf.GetY())
		pdf.SetX(left)
	}

	// Totaux et mot de remerciement.
	if doc.ShowAmounts {
		pdf.Ln(3)
		totalsTop := pdf.GetY()
		totals := []struct {
			label string
			value int64
			bold  bool
		}{{"Sous-total", doc.Subtotal, false}}
		if doc.Discount > 0 {
			totals = append(totals, struct {
				label string
				value int64
				bold  bool
			}{"Remise", -doc.Discount, false})
		}
		if doc.Tax > 0 {
			totals = append(totals, struct {
				label string
				value int64
				bold  bool
			}{"TVA", doc.Tax, false})
		}
		totals = append(totals, struct {
			label string
			value int64
			bold  bool
		}{"Total TTC", doc.Total, true})
		if doc.Kind == "invoice" {
			totals = append(totals,
				struct {
					label string
					value int64
					bold  bool
				}{"Montant payé", doc.Paid, false},
				struct {
					label string
					value int64
					bold  bool
				}{"Reste à payer", doc.Remaining, true})
		}
		for _, row := range totals {
			pdf.SetX(right - 75)
			style := ""
			if row.bold {
				style = "B"
			}
			pdf.SetFont(pdfFont, style, 9.5)
			pdf.CellFormat(40, 6, tr(row.label), "", 0, "L", false, 0, "")
			pdf.CellFormat(35, 6, tr(messaging.Money(row.value)), "", 1, "R", false, 0, "")
		}
		// Mot de remerciement, cale a gauche en face des totaux.
		pdf.SetXY(left, totalsTop)
		pdf.SetFont(pdfFont, "B", 9.5)
		pdf.MultiCell(width-85, 5, tr(doc.Company.ThankYouTitle), "", "L", false)
		pdf.SetX(left)
		pdf.SetFont(pdfFont, "", 8.5)
		pdf.SetTextColor(110, 110, 110)
		pdf.MultiCell(width-85, 4.4, tr(doc.Company.FooterNote), "", "L", false)
		pdf.SetTextColor(20, 20, 20)
	}

	if strings.TrimSpace(doc.Notes) != "" {
		pdf.Ln(4)
		pdf.SetX(left)
		pdf.SetFont(pdfFont, "B", 8)
		pdf.CellFormat(width, 5, tr("NOTE"), "", 1, "L", false, 0, "")
		pdf.SetX(left)
		pdf.SetFont(pdfFont, "", 8.5)
		pdf.MultiCell(width, 4.4, tr(doc.Notes), "", "L", false)
	}

	// Cartouche de signatures.
	pdf.Ln(8)
	signatureTop := pdf.GetY()
	if signatureTop > 235 {
		pdf.AddPage()
		signatureTop = pdf.GetY()
	}
	pdf.SetDrawColor(200, 202, 210)
	for index, label := range []string{"Signature client", "Pour " + doc.Company.CompanyName} {
		x := left + float64(index)*(width/2)
		pdf.SetXY(x, signatureTop)
		pdf.SetFont(pdfFont, "", 8)
		pdf.SetTextColor(110, 110, 110)
		pdf.CellFormat(width/2-8, 5, tr(label), "", 2, "L", false, 0, "")
		pdf.Rect(x, signatureTop+6, width/2-8, 18, "D")
	}
	pdf.SetXY(left, signatureTop+27)
	pdf.SetFont(pdfFont, "", 7.5)
	pdf.SetTextColor(130, 130, 130)
	seller := doc.Seller
	if seller == "" {
		seller = doc.Company.CompanyName
	}
	pdf.CellFormat(width, 4, tr("Document généré le "+frenchDate(time.Now())+" · Vendeur : "+seller), "", 0, "L", false, 0, "")

	var out bytes.Buffer
	if err := pdf.Output(&out); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

// documentPDF est le point d'entree unique : il charge la piece et rend le
// fichier avec son nom.
func (s *Server) documentPDF(kind string, id uint) ([]byte, string, pdfDocument, error) {
	doc, err := s.loadDocument(kind, id)
	if err != nil {
		return nil, "", doc, err
	}
	doc.LogoFormat, doc.Logo = s.brandingLogoFile()
	raw, err := renderPDF(doc)
	if err != nil {
		return nil, "", doc, err
	}
	return raw, documentFileName(kind, doc.Reference), doc, nil
}
