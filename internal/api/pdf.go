package api

import (
	"bytes"
	_ "embed"
	"fmt"
	"sort"
	"strconv"
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

// Police des documents.
//
// Inter est embarquee dans le binaire, en deux graisses : c'est la police du
// site et de l'espace de gestion, et une facture ne doit pas arriver chez le
// client dans une autre typographie que la boutique qui l'emet. Les deux
// fichiers sont des instances statiques tirees de la fonte variable — fpdf ne
// sait pas manipuler d'axe de variation, et une seule fonte variable aurait
// donne un document sans aucun gras, alors que la facture s'appuie dessus pour
// les totaux.
//
// Le repli sur Helvetica n'est pas decoratif : si la police manquait, il vaut
// mieux une facture dans la fonte de base qu'une erreur au moment de l'envoi.
//
//go:embed fonts/Inter-Regular.ttf
var interRegular []byte

//go:embed fonts/Inter-Bold.ttf
var interBold []byte

// fallbackFont sert quand l'enregistrement d'Inter echoue.
const fallbackFont = "Helvetica"

// setupFont installe Inter et rend le nom de famille a utiliser, ainsi que la
// fonction de transcodage du texte. Une fonte UTF-8 recoit les chaines telles
// quelles ; les fontes de base, elles, attendent du cp1252.
func setupFont(pdf *fpdf.Fpdf) (string, func(string) string) {
	pdf.AddUTF8FontFromBytes("Inter", "", interRegular)
	pdf.AddUTF8FontFromBytes("Inter", "B", interBold)
	if pdf.Err() {
		// On repart d'une erreur effacee : le document doit pouvoir se composer
		// malgre l'echec de la police.
		pdf.ClearError()
		return fallbackFont, pdf.UnicodeTranslatorFromDescriptor("")
	}
	return "Inter", func(value string) string { return value }
}

type pdfLine struct {
	Description string
	Reference   string
	Quantity    int64
	UnitPrice   int64
	Discount    int64
	Total       int64
}

type pdfMeta struct{ Label, Value string }

// pdfPayment est un versement tel qu'il s'affiche sur la facture : la date, le
// moyen, le montant. Une cliente qui paie en trois fois doit retrouver ses
// trois versements sur le papier — sans cela elle ne peut pas verifier ce
// qu'on a encaisse, ni prouver ce qu'elle a verse.
type pdfPayment struct {
	At     time.Time
	Method string
	Amount int64
}

type pdfDocument struct {
	Kind        string
	Title       string
	Reference   string
	IssuedAt    time.Time
	Company     invoiceDefaults
	CustomerRow []string
	// DeliverTo porte une adresse de livraison differente de celle de
	// facturation, quand la piece en connait une.
	DeliverTo   string
	Meta        []pdfMeta
	Lines       []pdfLine
	ShowAmounts bool
	Subtotal    int64
	Discount    int64
	Tax         int64
	Total       int64
	Paid        int64
	Remaining   int64
	Payments    []pdfPayment
	Notes       string
	Seller      string
	// Logo de l'entreprise, lu sur disque au moment du rendu. fpdf ne sait pas
	// dessiner de SVG : un logo vectoriel reste absent du PDF, le bandeau de
	// couleur tient alors lieu de marque.
	LogoFormat string
	Logo       []byte
	// Signature de l'entreprise, quand la piece a ete signee. L'ecran la montrait
	// deja a l'impression du navigateur, mais le PDF du serveur — celui qui part
	// par WhatsApp — dessinait un cadre vide : le client recevait une facture non
	// signee alors que la gestion l'affichait signee.
	SignatureURL    string
	SignatureFormat string
	Signature       []byte
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
		if s.DB.Preload("Items.Variant.Product").Preload("Customer").Preload("User").Preload("Payments").First(&sale, id).Error != nil {
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
		doc.Meta = []pdfMeta{{"RÈGLEMENT", status}, {"MODE", paymentSummary(sale)}}
		doc.Payments = documentPayments(sale)
		for _, item := range sale.Items {
			doc.Lines = append(doc.Lines, pdfLine{
				Description: lineLabel("", item.Variant), Reference: variantSKU(item.Variant),
				Quantity: item.Quantity, UnitPrice: item.UnitPrice, Discount: item.Discount, Total: item.Total,
			})
		}
		doc.SignatureURL = sale.CompanySignatureURL
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
		doc.SignatureURL = quote.CompanySignatureURL
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
		doc.SignatureURL = note.CompanySignatureURL
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

// paymentSummary decrit le reglement en haut de la facture. « Paiement mixte »
// ne dit rien au client qui a paye moitie especes moitie Wave : les moyens
// employes sont nommes.
//
// Les montants, eux, ne sont plus repris ici : ils figurent au detail des
// reglements, sous les totaux. Les ecrire deux fois faisait passer ce bloc
// d'en-tete sur trois lignes et decalait les colonnes voisines.
func paymentSummary(sale models.Sale) string {
	// Les moyens se lisent dans les reglements, pas dans la colonne de la
	// vente : celle-ci retient le moyen choisi a l'encaissement initial et ne
	// bouge plus. Une facture soldee plus tard par Wave affichait « Espèces ».
	seen := map[string]bool{}
	parts := []string{}
	for _, payment := range sale.Payments {
		if payment.Status != "active" || payment.Amount <= 0 || seen[payment.Method] {
			continue
		}
		seen[payment.Method] = true
		parts = append(parts, paymentLabel(payment.Method))
	}
	if len(parts) == 0 {
		return paymentLabel(sale.PaymentMethod)
	}
	return strings.Join(parts, " · ")
}

func paymentLabel(method string) string {
	labels := map[string]string{"cash": "Espèces", "wave": "Wave", "orange_money": "Orange Money",
		"card": "Carte bancaire", "credit": "Crédit", "bank_transfer": "Virement", "vault": "Coffre",
		"mixte": "Paiement mixte"}
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
// Couleurs de la marque, telles qu'elles sont posees sur le papier a en-tete.
// Elles vivent ici et dans styles.css : le PDF et l'ecran doivent rendre le
// meme document, et une teinte qui derive d'un cote se voit immediatement.
var (
	brandBlue   = [3]int{11, 66, 197}
	brandYellow = [3]int{255, 183, 0}
	brandInk    = [3]int{21, 26, 36}
	brandMuted  = [3]int{104, 115, 133}
	brandLine   = [3]int{220, 227, 236}
)

func setInk(pdf *fpdf.Fpdf, c [3]int)    { pdf.SetTextColor(c[0], c[1], c[2]) }
func setFill(pdf *fpdf.Fpdf, c [3]int)   { pdf.SetFillColor(c[0], c[1], c[2]) }
func setStroke(pdf *fpdf.Fpdf, c [3]int) { pdf.SetDrawColor(c[0], c[1], c[2]) }

func renderPDF(doc pdfDocument) ([]byte, error) {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdfFont, tr := setupFont(pdf)
	// Times porte l'italique, qu'Inter n'a pas ici : la devise du pied de page
	// et le remerciement sont en serif penché dans le modèle, et ce sont les
	// deux seuls endroits où le document quitte sa police.
	latin := pdf.UnicodeTranslatorFromDescriptor("")
	pdf.SetTitle(doc.Title+" "+doc.Reference, true)
	// La marge basse laisse la place au bandeau de pied : sans elle, la
	// derniere ligne du tableau passerait sous le bleu.
	pdf.SetAutoPageBreak(true, 26)
	const left, right = 15.0, 195.0
	width := right - left

	// Bandeau de pied, repete sur chaque page.
	//
	// C'est la signature du papier a en-tete : deux aplats separes par une
	// diagonale, la devise en italique a gauche, le numero de page a droite.
	// Il est dessine en polygone plutot qu'en deux rectangles, sinon la coupe
	// serait verticale et le dessin perdrait ce qui le distingue.
	pdf.SetFooterFunc(func() {
		const bandTop, bandBottom = 280.0, 297.0
		setFill(pdf, brandBlue)
		pdf.Polygon([]fpdf.PointType{{X: 0, Y: bandTop}, {X: 151, Y: bandTop},
			{X: 145, Y: bandBottom}, {X: 0, Y: bandBottom}}, "F")
		setFill(pdf, brandYellow)
		pdf.Polygon([]fpdf.PointType{{X: 151, Y: bandTop}, {X: 210, Y: bandTop},
			{X: 210, Y: bandBottom}, {X: 145, Y: bandBottom}}, "F")

		pdf.SetTextColor(255, 255, 255)
		pdf.SetXY(left, bandTop+5.5)
		pdf.SetFont("Times", "I", 12)
		name := doc.Company.CompanyName
		pdf.CellFormat(pdf.GetStringWidth(latin(name+","))+1.5, 6, latin(name+","), "", 0, "L", false, 0, "")
		pdf.SetFont(pdfFont, "", 8)
		pdf.CellFormat(70, 6, tr("votre compagnon de voyage !"), "", 0, "L", false, 0, "")
		pdf.SetFont(pdfFont, "B", 8)
		pdf.SetXY(right-30, bandTop+5.5)
		pdf.CellFormat(30, 6, fmt.Sprintf("%d / {np}", pdf.PageNo()), "", 0, "R", false, 0, "")
	})
	pdf.AliasNbPages("{np}")

	// En-tete complet sur la premiere page, en-tete compact sur les suivantes :
	// une facture de trois pages ne doit pas repeter le logo en grand, mais on
	// doit pouvoir dire d'un coup d'oeil de quelle piece vient une feuille
	// isolee.
	first := true
	pdf.SetHeaderFunc(func() {
		if first {
			first = false
			return
		}
		pdf.SetY(12)
		setInk(pdf, brandBlue)
		pdf.SetFont(pdfFont, "B", 10)
		pdf.SetX(left)
		pdf.CellFormat(90, 5, tr(strings.ToUpper(doc.Company.CompanyName)), "", 0, "L", false, 0, "")
		setInk(pdf, brandInk)
		pdf.SetFont(pdfFont, "", 8.5)
		pdf.CellFormat(width-90, 5, tr(strings.ToUpper(doc.Title)+" "+doc.Reference), "", 1, "R", false, 0, "")
		setStroke(pdf, brandLine)
		pdf.Line(left, 19, right, 19)
		pdf.SetY(24)
	})
	pdf.AddPage()

	drawFullHeader(pdf, pdfFont, tr, doc, left, right)
	drawParties(pdf, pdfFont, tr, doc, left, right)
	drawItems(pdf, pdfFont, tr, doc, left, right)
	drawSummary(pdf, pdfFont, tr, latin, doc, left, right)

	var out bytes.Buffer
	if err := pdf.Output(&out); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// drawFullHeader pose le logo, le bloc entreprise et le cartouche du document.
func drawFullHeader(pdf *fpdf.Fpdf, font string, tr func(string) string, doc pdfDocument, left, right float64) {
	const top = 14.0
	textLeft := left

	if doc.LogoFormat != "" && len(doc.Logo) > 0 {
		pdf.RegisterImageOptionsReader("logo", fpdf.ImageOptions{ImageType: doc.LogoFormat}, bytes.NewReader(doc.Logo))
		if info := pdf.GetImageInfo("logo"); info != nil && info.Height() > 0 {
			// Le logo tient dans un carre de 38 mm, quelle que soit sa forme :
			// un logo large ne doit pas pousser le bloc entreprise hors de la
			// page, un logo haut ne doit pas depasser sur les destinataires.
			box := 38.0
			w, h := box, box
			if info.Width() > info.Height() {
				h = box * info.Height() / info.Width()
			} else {
				w = box * info.Width() / info.Height()
			}
			pdf.ImageOptions("logo", left, top+(box-h)/2, w, h, false,
				fpdf.ImageOptions{ImageType: doc.LogoFormat}, 0, "")
			textLeft = left + box + 6
		}
	}

	// Filet vertical bleu entre le logo et l'adresse : c'est lui qui tient la
	// colonne, sans encadrer.
	if textLeft > left {
		setStroke(pdf, brandBlue)
		pdf.SetLineWidth(0.6)
		pdf.Line(textLeft-4, top+2, textLeft-4, top+34)
		pdf.SetLineWidth(0.2)
	}

	pdf.SetXY(textLeft, top+3)
	setInk(pdf, brandBlue)
	pdf.SetFont(font, "B", 13)
	pdf.CellFormat(70, 6, tr(strings.ToUpper(doc.Company.CompanyName)), "", 2, "L", false, 0, "")

	// Coordonnees, une puce par ligne. Les champs vides sautent : une ligne
	// « ● » suivie de rien fait douter de tout le reste.
	rows := []string{doc.Company.Address, doc.Company.Phone, doc.Company.Email, doc.Company.Website}
	pdf.SetFont(font, "", 8.5)
	y := top + 11
	for _, row := range rows {
		if strings.TrimSpace(row) == "" {
			continue
		}
		setInk(pdf, brandBlue)
		pdf.SetXY(textLeft, y)
		pdf.CellFormat(3.4, 4.6, "•", "", 0, "L", false, 0, "")
		setInk(pdf, brandInk)
		pdf.MultiCell(58, 4.6, tr(row), "", "L", false)
		y = pdf.GetY() + 0.6
	}

	// Cartouche du document, cale a droite.
	const boxWidth = 66.0
	x := right - boxWidth
	setInk(pdf, brandBlue)
	pdf.SetFont(font, "B", 24)
	pdf.SetXY(x, top+1)
	pdf.CellFormat(boxWidth, 12, tr(strings.ToUpper(doc.Title)), "", 0, "R", false, 0, "")

	// Pastille du numero : etiquette bleue collee a un champ blanc borde de
	// jaune. C'est le seul endroit du document ou les deux couleurs se
	// touchent, et c'est ce qui attire l'oeil sur la reference.
	numberTop := top + 15
	setFill(pdf, brandYellow)
	pdf.RoundedRect(x, numberTop, boxWidth, 9, 4.5, "1234", "F")
	pdf.SetFillColor(255, 255, 255)
	pdf.RoundedRect(x+0.7, numberTop+0.7, boxWidth-1.4, 7.6, 3.8, "1234", "F")
	setFill(pdf, brandBlue)
	pdf.RoundedRect(x+0.7, numberTop+0.7, 17, 7.6, 3.8, "1234", "F")
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont(font, "B", 8)
	pdf.SetXY(x+0.7, numberTop+0.7)
	pdf.CellFormat(17, 7.6, tr("N°"), "", 0, "C", false, 0, "")
	setInk(pdf, brandInk)
	pdf.SetFont(font, "B", 9.5)
	pdf.SetXY(x+19, numberTop+0.7)
	pdf.CellFormat(boxWidth-20, 7.6, tr(doc.Reference), "", 0, "C", false, 0, "")

	// Date, puis ce que la piece a de particulier : reglement pour une
	// facture, validite pour un devis, etat pour un bon de livraison.
	lines := [][2]string{{"Date :", frenchDate(doc.IssuedAt)}}
	for _, meta := range doc.Meta {
		lines = append(lines, [2]string{strings.Title(strings.ToLower(meta.Label)) + " :", meta.Value})
	}
	y = numberTop + 13
	for _, line := range lines {
		setInk(pdf, brandBlue)
		pdf.SetFont(font, "B", 8.5)
		pdf.SetXY(x, y)
		pdf.CellFormat(24, 4.8, tr(line[0]), "", 0, "L", false, 0, "")
		setInk(pdf, brandInk)
		pdf.SetFont(font, "", 8.5)
		pdf.MultiCell(boxWidth-24, 4.8, tr(line[1]), "", "L", false)
		y = pdf.GetY() + 0.4
	}

	pdf.SetY(maxFloat(y, top+40))
}

// pill dessine une etiquette arrondie : fond plein, texte contraste.
func pill(pdf *fpdf.Fpdf, font string, tr func(string) string, x, y, w float64, label string, fill, ink [3]int) {
	setFill(pdf, fill)
	pdf.RoundedRect(x, y, w, 7, 3.5, "1234", "F")
	setInk(pdf, ink)
	pdf.SetFont(font, "B", 7.5)
	pdf.SetXY(x, y)
	pdf.CellFormat(w, 7, tr(label), "", 0, "C", false, 0, "")
}

// drawParties pose les blocs « facture a » et « livrer a ».
//
// Le second n'apparait que si l'on connait une adresse de livraison : un bloc
// vide sous une etiquette jaune ferait croire a une information perdue.
func drawParties(pdf *fpdf.Fpdf, font string, tr func(string) string, doc pdfDocument, left, right float64) {
	top := pdf.GetY() + 4
	width := right - left
	column := width/2 - 4

	recipient := "FACTURÉ À :"
	switch doc.Kind {
	case "quote":
		recipient = "DEVIS POUR :"
	case "delivery":
		recipient = "LIVRER À :"
	}

	block := func(x float64, label string, fill, ink [3]int, lines []string) float64 {
		pill(pdf, font, tr, x, top, 34, label, fill, ink)
		setStroke(pdf, brandLine)
		pdf.Line(x+36, top+3.5, x+column, top+3.5)
		y := top + 10
		for index, line := range lines {
			if strings.TrimSpace(line) == "" {
				continue
			}
			pdf.SetXY(x, y)
			if index == 0 {
				pdf.SetFont(font, "B", 9.5)
			} else {
				pdf.SetFont(font, "", 8.5)
			}
			setInk(pdf, brandInk)
			pdf.MultiCell(column, 4.7, tr(line), "", "L", false)
			y = pdf.GetY()
		}
		return y
	}

	bottom := block(left, recipient, brandBlue, [3]int{255, 255, 255}, doc.CustomerRow)
	// Le modele prevoit un second bloc « livrer a ». Il n'est pose que si une
	// adresse de livraison distincte existe : l'application n'en tient pas de
	// separee, et recopier l'adresse de facturation sous une autre etiquette
	// ferait croire a deux lieux differents.
	if extra := strings.TrimSpace(doc.DeliverTo); extra != "" {
		delivery := block(left+column+8, "LIVRER À :", brandYellow, brandInk,
			[]string{doc.CustomerRow[0], extra})
		bottom = maxFloat(bottom, delivery)
	}
	pdf.SetY(bottom + 6)
}

// drawItems rend le tableau des lignes.
func drawItems(pdf *fpdf.Fpdf, font string, tr func(string) string, doc pdfDocument, left, right float64) {
	width := right - left
	type column struct {
		label string
		w     float64
		align string
	}
	columns := []column{{"#", 9, "C"}, {"DÉSIGNATION", 0, "L"}, {"QTÉ", 16, "C"}}
	if doc.ShowAmounts {
		columns = append(columns,
			column{"PRIX UNIT. (FCFA)", 32, "R"},
			column{"REMISE", 22, "R"},
			column{"MONTANT (FCFA)", 34, "R"})
	}
	fixed := 0.0
	for _, c := range columns {
		fixed += c.w
	}
	columns[1].w = width - fixed

	header := func() {
		setFill(pdf, brandBlue)
		pdf.SetTextColor(255, 255, 255)
		pdf.SetFont(font, "B", 7.2)
		pdf.SetX(left)
		for _, c := range columns {
			pdf.CellFormat(c.w, 8, tr(c.label), "", 0, c.align, true, 0, "")
		}
		pdf.Ln(-1)
	}
	header()

	for index, line := range doc.Lines {
		pdf.SetFont(font, "", 8.7)
		label := line.Description
		if line.Reference != "" {
			label += "\n" + line.Reference
		}
		height := 4.8*float64(len(pdf.SplitLines([]byte(tr(line.Description)), columns[1].w-4))) + 3
		if line.Reference != "" {
			height += 3.6
		}
		if height < 9 {
			height = 9
		}
		// Une ligne coupee en deux par un saut de page est illisible : on
		// pousse la ligne entiere sur la page suivante, et on y redessine
		// l'en-tete du tableau.
		if pdf.GetY()+height > 268 {
			pdf.AddPage()
			header()
		}
		y := pdf.GetY()
		// Une ligne sur deux est teintee : sur une facture de vingt articles,
		// c'est ce qui empeche de lire le prix de la ligne d'a cote.
		if index%2 == 1 {
			pdf.SetFillColor(246, 248, 251)
			pdf.Rect(left, y, width, height, "F")
		}

		setInk(pdf, brandMuted)
		pdf.SetXY(left, y)
		pdf.SetFont(font, "", 8)
		pdf.CellFormat(columns[0].w, height, strconv.Itoa(index+1), "", 0, "C", false, 0, "")

		setInk(pdf, brandInk)
		pdf.SetXY(left+columns[0].w+2, y+1.6)
		pdf.SetFont(font, "B", 8.7)
		pdf.MultiCell(columns[1].w-4, 4.6, tr(line.Description), "", "L", false)
		if line.Reference != "" {
			pdf.SetX(left + columns[0].w + 2)
			pdf.SetFont(font, "", 7.2)
			setInk(pdf, brandMuted)
			pdf.MultiCell(columns[1].w-4, 3.6, tr(line.Reference), "", "L", false)
		}

		setInk(pdf, brandInk)
		pdf.SetFont(font, "", 8.7)
		pdf.SetXY(left+columns[0].w+columns[1].w, y)
		pdf.CellFormat(columns[2].w, height, strconv.FormatInt(line.Quantity, 10), "", 0, "C", false, 0, "")
		if doc.ShowAmounts {
			discount := "—"
			if line.Discount > 0 {
				discount = "- " + messaging.Money(line.Discount)
			}
			pdf.CellFormat(columns[3].w, height, tr(plainMoney(line.UnitPrice)), "", 0, "R", false, 0, "")
			pdf.CellFormat(columns[4].w, height, tr(discount), "", 0, "R", false, 0, "")
			pdf.SetFont(font, "B", 8.7)
			pdf.CellFormat(columns[5].w, height, tr(plainMoney(line.Total)), "", 0, "R", false, 0, "")
		}

		setStroke(pdf, brandLine)
		pdf.Line(left, y+height, right, y+height)
		pdf.SetXY(left, y+height)
	}
}

// plainMoney rend le montant sans son unite : la colonne la porte deja dans
// son titre, et la repeter vingt fois alourdit le tableau.
func plainMoney(amount int64) string {
	return strings.TrimSuffix(messaging.Money(amount), " F")
}

// drawSummary pose le bas du document : notes a gauche, totaux et cachet a
// droite.
func drawSummary(pdf *fpdf.Fpdf, font string, tr, latin func(string) string, doc pdfDocument, left, right float64) {
	width := right - left
	// Le bas de page occupe une hauteur connue : s'il ne tient pas sous la
	// derniere ligne, il part entier sur une page neuve plutot que d'etre
	// coupe en deux.
	needed := 90.0
	if doc.Kind == "invoice" && len(doc.Payments) > 1 {
		needed += 11
	}
	if pdf.GetY()+needed > 272 {
		pdf.AddPage()
	}
	// Le bas de page se dessine d'un bloc, saut automatique desactive : les
	// deux dernieres lignes — reglements, mentions legales — ne doivent jamais
	// ouvrir une page pour elles seules, et la place a ete reservee au-dessus.
	pdf.SetAutoPageBreak(false, 0)
	defer pdf.SetAutoPageBreak(true, 26)
	top := pdf.GetY() + 5
	columnWidth := width/2 - 6
	rightX := left + columnWidth + 12

	// ---- Colonne de droite : totaux, cachet.
	y := top
	if doc.ShowAmounts {
		rows := []struct {
			label string
			value int64
		}{{"Sous-total", doc.Subtotal}}
		if doc.Discount > 0 {
			rows = append(rows, struct {
				label string
				value int64
			}{"Remise", -doc.Discount})
		}
		if doc.Tax > 0 {
			rows = append(rows, struct {
				label string
				value int64
			}{"TVA", doc.Tax})
		}
		for _, row := range rows {
			pdf.SetXY(rightX, y)
			setInk(pdf, brandMuted)
			pdf.SetFont(font, "", 9)
			pdf.CellFormat(columnWidth-38, 6, tr(row.label), "", 0, "L", false, 0, "")
			setInk(pdf, brandInk)
			pdf.SetFont(font, "B", 9)
			pdf.CellFormat(38, 6, tr(messaging.Money(row.value)), "", 1, "R", false, 0, "")
			y = pdf.GetY() + 1
		}
		setStroke(pdf, brandInk)
		pdf.Line(rightX, y+1, right, y+1)
		y += 4

		// Le total dans une pastille jaune : c'est le chiffre que le client
		// cherche, et il doit se trouver sans lire le reste.
		setInk(pdf, brandBlue)
		pdf.SetFont(font, "B", 11)
		pdf.SetXY(rightX, y)
		pdf.CellFormat(columnWidth-44, 10, tr("TOTAL TTC"), "", 0, "L", false, 0, "")
		setFill(pdf, brandYellow)
		pdf.RoundedRect(right-44, y, 44, 10, 3, "1234", "F")
		setInk(pdf, brandInk)
		pdf.SetFont(font, "B", 11)
		pdf.SetXY(right-44, y)
		pdf.CellFormat(44, 10, tr(messaging.Money(doc.Total)), "", 0, "C", false, 0, "")
		y += 13

		if doc.Kind == "invoice" {
			for _, row := range [][2]string{{"Montant payé", messaging.Money(doc.Paid)},
				{"Reste à payer", messaging.Money(doc.Remaining)}} {
				pdf.SetXY(rightX, y)
				setInk(pdf, brandMuted)
				pdf.SetFont(font, "", 8.5)
				pdf.CellFormat(columnWidth-38, 5, tr(row[0]), "", 0, "L", false, 0, "")
				setInk(pdf, brandInk)
				pdf.SetFont(font, "B", 8.5)
				pdf.CellFormat(38, 5, tr(row[1]), "", 1, "R", false, 0, "")
				y = pdf.GetY()
			}
			y += 3
		}
	}

	// Cachet et signature. Le cadre est dessine meme sans image : une facture
	// se signe aussi a la main, sur le papier.
	stampTop := y + 2
	stampHeight := 34.0
	setStroke(pdf, brandBlue)
	pdf.RoundedRect(rightX, stampTop, columnWidth, stampHeight, 2.5, "1234", "D")
	setInk(pdf, brandBlue)
	pdf.SetFont(font, "B", 7.5)
	pdf.SetXY(rightX+3, stampTop+1.5)
	pdf.CellFormat(columnWidth-6, 5, tr("CACHET & SIGNATURE"), "", 0, "L", false, 0, "")
	if doc.SignatureFormat != "" && len(doc.Signature) > 0 {
		pdf.RegisterImageOptionsReader("signature", fpdf.ImageOptions{ImageType: doc.SignatureFormat}, bytes.NewReader(doc.Signature))
		if info := pdf.GetImageInfo("signature"); info != nil && info.Height() > 0 {
			// Le cachet remplit la hauteur du cadre, et n'est ramene que s'il
			// deborde en largeur : rond, il est aussi haut que large, et le
			// borner par la largeur le rendrait illisible.
			h := stampHeight - 7
			w := h * info.Width() / info.Height()
			if w > columnWidth-8 {
				w = columnWidth - 8
				h = w * info.Height() / info.Width()
			}
			pdf.ImageOptions("signature", rightX+(columnWidth-w)/2, stampTop+6.5+(stampHeight-6.5-h)/2, w, h,
				false, fpdf.ImageOptions{ImageType: doc.SignatureFormat}, 0, "")
		}
	}
	rightBottom := stampTop + stampHeight

	// ---- Colonne de gauche : conditions, banque, remerciement.
	y = top
	note := func(title, body string) {
		if strings.TrimSpace(body) == "" {
			return
		}
		setFill(pdf, brandBlue)
		pdf.RoundedRect(left, y, 7, 7, 2, "1234", "F")
		setInk(pdf, brandBlue)
		pdf.SetFont(font, "B", 8.5)
		pdf.SetXY(left+10, y)
		pdf.CellFormat(columnWidth-10, 7, tr(strings.ToUpper(title)), "", 1, "L", false, 0, "")
		setInk(pdf, brandInk)
		pdf.SetFont(font, "", 8.2)
		pdf.SetX(left + 10)
		pdf.MultiCell(columnWidth-10, 4.4, tr(body), "", "L", false)
		y = pdf.GetY() + 5
	}
	note("Conditions de paiement", doc.Company.PaymentTerms)
	note("Informations bancaires", doc.Company.BankDetails)

	if title := strings.TrimSpace(doc.Company.ThankYouTitle); title != "" {
		setInk(pdf, brandBlue)
		pdf.SetFont("Times", "BI", 15)
		pdf.SetXY(left, y)
		pdf.CellFormat(columnWidth, 7, latin(title), "", 1, "L", false, 0, "")
		// Le trait jaune sous le remerciement, legerement en biais : c'est le
		// seul geste manuscrit du document.
		setStroke(pdf, brandYellow)
		pdf.SetLineWidth(1.1)
		pdf.Line(left+2, y+8.6, left+2+pdf.GetStringWidth(latin(title))*0.92, y+7.4)
		pdf.SetLineWidth(0.2)
		y += 11
	}
	if note := strings.TrimSpace(doc.Company.FooterNote); note != "" {
		setInk(pdf, brandMuted)
		pdf.SetFont(font, "", 7.6)
		pdf.SetXY(left, y)
		pdf.MultiCell(columnWidth, 3.9, tr(note), "", "L", false)
		y = pdf.GetY() + 2
	}
	if strings.TrimSpace(doc.Notes) != "" {
		setInk(pdf, brandInk)
		pdf.SetFont(font, "", 8)
		pdf.SetX(left)
		pdf.MultiCell(columnWidth, 4.2, tr(doc.Notes), "", "L", false)
		y = pdf.GetY() + 2
	}

	bottom := maxFloat(y, rightBottom)

	// Detail des reglements, sur toute la largeur : une cliente qui a paye en
	// trois fois doit retrouver ses trois versements.
	if doc.Kind == "invoice" && len(doc.Payments) > 1 {
		pdf.SetXY(left, bottom+3)
		setInk(pdf, brandMuted)
		pdf.SetFont(font, "B", 7)
		pdf.CellFormat(width, 4, tr("RÈGLEMENTS REÇUS"), "", 1, "L", false, 0, "")
		parts := make([]string, 0, len(doc.Payments))
		for _, payment := range doc.Payments {
			label := paymentLabel(payment.Method)
			if payment.Amount < 0 {
				label = "Remboursement " + strings.ToLower(label)
			}
			parts = append(parts, fmt.Sprintf("%s · %s %s", shortFrenchDate(payment.At), label,
				messaging.Money(abs64(payment.Amount))))
		}
		pdf.SetX(left)
		setInk(pdf, brandInk)
		pdf.SetFont(font, "", 7.8)
		pdf.MultiCell(width, 4.2, tr(strings.Join(parts, "   |   ")), "", "L", false)
		bottom = pdf.GetY()
	}

	// Mentions legales : NINEA, registre de commerce. C'est ce que le
	// comptable du client et l'administration viennent chercher.
	if legal := doc.Company.legalLine(); legal != "" {
		// Si le calcul de place a ete pris de court — une note longue, un
		// remerciement sur deux lignes — la mention se cale juste au-dessus du
		// bandeau plutot que d'ouvrir une page pour elle seule.
		if bottom+7 > 272 {
			bottom = 265
		}
		pdf.SetXY(left, bottom+3)
		setStroke(pdf, brandLine)
		pdf.Line(left, bottom+2, right, bottom+2)
		setInk(pdf, brandMuted)
		pdf.SetFont(font, "B", 7.2)
		pdf.CellFormat(width, 4, tr(legal), "", 1, "C", false, 0, "")
	}
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
	doc.SignatureFormat, doc.Signature = uploadedImage(doc.SignatureURL)
	raw, err := renderPDF(doc)
	if err != nil {
		return nil, "", doc, err
	}
	return raw, documentFileName(kind, doc.Reference), doc, nil
}

// documentPayments rend les versements d'une facture, du plus ancien au plus
// recent, remboursements compris.
//
// La facture n'affichait que « Montant paye » : une cliente qui avait regle en
// trois fois — un acompte, un versement Wave, le solde en especes — ne
// retrouvait aucune trace de ses versements. Elle n'avait alors aucun moyen de
// verifier ce qui avait ete encaisse, et la boutique aucun moyen de le prouver.
//
// Les reglements annules sont ecartes : ils ne representent pas de l'argent
// recu. Les remboursements, eux, sont montres — ce sont des mouvements reels
// sur la facture, et les taire ferait mentir le total.
func documentPayments(sale models.Sale) []pdfPayment {
	rows := []pdfPayment{}
	for _, payment := range sale.Payments {
		if payment.Status != "active" || payment.Amount == 0 {
			continue
		}
		rows = append(rows, pdfPayment{At: payment.CreatedAt, Method: payment.Method, Amount: payment.Amount})
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].At.Before(rows[j].At) })
	return rows
}

// shortFrenchDate donne « 23 août » : sur une ligne de reglements, l'annee est
// celle de la facture et n'apporte rien.
func shortFrenchDate(at time.Time) string {
	months := []string{"janv.", "févr.", "mars", "avril", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."}
	return fmt.Sprintf("%d %s", at.Day(), months[int(at.Month())-1])
}

func abs64(value int64) int64 {
	if value < 0 {
		return -value
	}
	return value
}
