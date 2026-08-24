package api

import (
	"bytes"
	_ "embed"
	"fmt"
	"sort"
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

// Caveat porte la phrase de remerciement, et elle seule. Le gabarit de la
// boutique l'ecrit d'une main manuscrite : ecrite en Inter, elle perdait ce
// qui la distingue du reste du document — c'est un mot, pas une mention. La
// fonte est sous licence ouverte (OFL, voir fonts/OFL-Caveat.txt), comme
// Inter, et embarquee de la meme facon.
//
//go:embed fonts/Caveat-SemiBold.ttf
var caveatSemiBold []byte

// fallbackFont sert quand l'enregistrement d'Inter echoue.
const fallbackFont = "Helvetica"

// setupFont installe Inter et rend le nom de famille a utiliser, ainsi que la
// fonction de transcodage du texte. Une fonte UTF-8 recoit les chaines telles
// quelles ; les fontes de base, elles, attendent du cp1252.
func setupFont(pdf *fpdf.Fpdf) (string, func(string) string) {
	pdf.AddUTF8FontFromBytes("Inter", "", interRegular)
	pdf.AddUTF8FontFromBytes("Inter", "B", interBold)
	pdf.AddUTF8FontFromBytes("Caveat", "", caveatSemiBold)
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
	Meta        []pdfMeta
	Lines       []pdfLine
	ShowAmounts bool
	Subtotal    int64
	Discount    int64
	Tax         int64
	Total       int64
	Paid        int64
	Remaining   int64
	Delivery    int64
	Payments    []pdfPayment
	// Adresse de livraison, quand elle differe de celle de facturation. Le
	// gabarit de la boutique porte deux blocs cote a cote : « facturé à » et
	// « livrer à ».
	ShipTo []string
	// Echeance de reglement, vide quand la piece est soldee ou n'en porte pas.
	DueAt  string
	Notes  string
	Seller string
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
	// Fond decoratif du gabarit — les croquis d'avions, de valises et de
	// passeports. Il est televerse par la boutique : ces dessins sont son
	// papier a en-tete, pas quelque chose que le rendu sait inventer.
	BackgroundFormat string
	Background       []byte
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

	// Le bloc du destinataire suit l'ordre d'une adresse postale : le nom, ou
	// l'on va, puis comment joindre. Il n'affichait que nom, telephone,
	// adresse — dans cet ordre, l'adresse arrivait apres le telephone et se
	// lisait mal.
	customer := func(row *models.Customer) {
		if row == nil {
			doc.CustomerRow = []string{"Client comptoir"}
			return
		}
		doc.CustomerRow = []string{row.Name, row.Address, row.Zone}
		if strings.TrimSpace(row.Phone) != "" {
			doc.CustomerRow = append(doc.CustomerRow, "Téléphone : "+row.Phone)
		}
		if strings.TrimSpace(row.Email) != "" {
			doc.CustomerRow = append(doc.CustomerRow, "Email : "+row.Email)
		}
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
		if sale.DueAt != nil {
			doc.DueAt = frenchDate(*sale.DueAt)
		}
		// « Livrer à » : l'adresse de la commande du site quand la facture en
		// vient, celle du client sinon. Une vente au comptoir sans client n'a
		// pas d'adresse de livraison — le bloc disparait plutot que d'afficher
		// un cadre vide.
		var order models.Order
		if s.DB.Where("sale_id = ?", sale.ID).First(&order).Error == nil {
			doc.Delivery = order.DeliveryFee
			if strings.TrimSpace(order.Address) != "" {
				name := "Client"
				if sale.Customer != nil {
					name = sale.Customer.Name
				}
				doc.ShipTo = []string{name, order.Address, order.DeliveryZone}
			}
		}
		if len(doc.ShipTo) == 0 && sale.Customer != nil && strings.TrimSpace(sale.Customer.Address) != "" {
			doc.ShipTo = []string{sale.Customer.Name, sale.Customer.Address, sale.Customer.Zone}
		}
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

// Palette du gabarit. Le bleu et le jaune sont ceux du logo : ils portent la
// marque partout ou ils ne passent derriere aucune image.
var (
	brandBlue   = [3]int{21, 41, 214}
	brandYellow = [3]int{247, 178, 20}
	inkColor    = [3]int{32, 36, 44}
	mutedColor  = [3]int{110, 116, 126}
	ruleColor   = [3]int{222, 226, 234}
)

func setInk(pdf *fpdf.Fpdf, c [3]int)    { pdf.SetTextColor(c[0], c[1], c[2]) }
func setFill(pdf *fpdf.Fpdf, c [3]int)   { pdf.SetFillColor(c[0], c[1], c[2]) }
func setStroke(pdf *fpdf.Fpdf, c [3]int) { pdf.SetDrawColor(c[0], c[1], c[2]) }

// pill dessine une etiquette arrondie pleine — « FACTURÉ À : », « LIVRER À : »
// — suivie d'un filet de la meme couleur jusqu'au bord de sa colonne. C'est le
// motif que le gabarit repete pour ouvrir chaque bloc.
func pill(pdf *fpdf.Fpdf, font, text string, x, y, lineEnd float64, color [3]int, textColor [3]int) {
	pdf.SetFont(font, "B", 8.5)
	labelWidth := pdf.GetStringWidth(text) + 12
	setFill(pdf, color)
	pdf.RoundedRect(x, y, labelWidth, 7, 3.5, "1234", "F")
	setInk(pdf, textColor)
	pdf.SetXY(x, y)
	pdf.CellFormat(labelWidth, 7, text, "", 0, "C", false, 0, "")
	if lineEnd > x+labelWidth+2 {
		setStroke(pdf, color)
		pdf.SetLineWidth(0.5)
		pdf.Line(x+labelWidth+2, y+5.4, lineEnd, y+5.4)
		pdf.SetLineWidth(0.2)
	}
}

// glyph dessine les petits pictogrammes de l'en-tete. fpdf n'a pas de fonte
// d'icones : ils sont traces au trait, assez simplement pour rester lisibles a
// trois millimetres et assez reconnaissables pour se passer d'etiquette.
func glyph(pdf *fpdf.Fpdf, kind string, x, y float64) {
	setStroke(pdf, brandBlue)
	setFill(pdf, brandBlue)
	pdf.SetLineWidth(0.35)
	switch kind {
	case "pin":
		pdf.Circle(x+1.6, y+1.5, 1.5, "F")
		pdf.Polygon([]fpdf.PointType{{X: x + 0.5, Y: y + 2.4}, {X: x + 2.7, Y: y + 2.4}, {X: x + 1.6, Y: y + 4.2}}, "F")
	case "phone":
		pdf.RoundedRect(x+0.5, y, 2.4, 4.2, 0.6, "1234", "F")
		pdf.SetFillColor(255, 255, 255)
		pdf.Rect(x+0.9, y+0.7, 1.6, 2.4, "F")
	case "mail":
		pdf.Rect(x, y+0.6, 3.6, 2.8, "F")
		pdf.SetDrawColor(255, 255, 255)
		pdf.Line(x, y+0.6, x+1.8, y+2.2)
		pdf.Line(x+3.6, y+0.6, x+1.8, y+2.2)
	case "web":
		pdf.Circle(x+1.8, y+2, 1.8, "D")
		pdf.Line(x, y+2, x+3.6, y+2)
		pdf.Ellipse(x+1.8, y+2, 0.8, 1.8, 0, "D")
	}
	pdf.SetLineWidth(0.2)
}

// blueIcon est le carre arrondi bleu des rubriques du bas — moyens de
// paiement, coordonnees bancaires.
func blueIcon(pdf *fpdf.Fpdf, kind string, x, y float64) {
	setFill(pdf, brandBlue)
	pdf.RoundedRect(x, y, 11, 11, 2.5, "1234", "F")
	pdf.SetDrawColor(255, 255, 255)
	pdf.SetFillColor(255, 255, 255)
	pdf.SetLineWidth(0.5)
	switch kind {
	case "card":
		pdf.Rect(x+2.2, y+3.4, 6.6, 4.4, "D")
		pdf.Rect(x+2.2, y+4.4, 6.6, 1, "F")
	case "bank":
		pdf.Polygon([]fpdf.PointType{{X: x + 1.8, Y: y + 4.4}, {X: x + 5.5, Y: y + 2.4}, {X: x + 9.2, Y: y + 4.4}}, "F")
		for _, offset := range []float64{2.6, 4.7, 6.8} {
			pdf.Rect(x+offset, y+5, 1, 3, "F")
		}
		pdf.Rect(x+1.8, y+8.2, 7.4, 0.9, "F")
	}
	pdf.SetLineWidth(0.2)
}

// renderPDF compose le document sur le gabarit de la boutique.
//
// Le rendu precedent etait celui d'un logiciel de gestion : bandeau plein,
// trois colonnes, un tableau gris. La boutique a un papier a en-tete dessine —
// logo a gauche, coordonnees derriere leurs pictogrammes, etiquettes
// arrondies, tableau bleu, bandeau de pied de page — et c'est celui-la que le
// client reconnait. Le document le reproduit, avec les memes couleurs et le
// meme ordre de lecture.
//
// Tout ce qui suit est pose en coordonnees absolues plutot qu'au fil du
// curseur : un gabarit se decrit par des positions, et les blocs du bas
// doivent tomber au meme endroit qu'il y ait deux lignes de vente ou dix.
func renderPDF(doc pdfDocument) ([]byte, error) {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdfFont, tr := setupFont(pdf)
	pdf.SetTitle(doc.Title+" "+doc.Reference, true)
	const left, right = 14.0, 196.0
	const bandTop = 279.0
	width := right - left
	pdf.SetAutoPageBreak(true, 297-bandTop+6)

	// Fond decoratif et bandeau de pied de page, sur chaque page. Le bandeau
	// ferme la feuille : sans lui, une deuxieme page n'aurait plus rien de la
	// marque.
	pdf.SetHeaderFunc(func() {
		if doc.BackgroundFormat != "" && len(doc.Background) > 0 {
			pdf.RegisterImageOptionsReader("fond", fpdf.ImageOptions{ImageType: doc.BackgroundFormat}, bytes.NewReader(doc.Background))
			pdf.ImageOptions("fond", 0, 0, 210, 297, false, fpdf.ImageOptions{ImageType: doc.BackgroundFormat}, 0, "")
		}
	})
	pdf.SetFooterFunc(func() {
		// Deux polygones : le bleu occupe la feuille, le jaune coupe son
		// angle a droite. C'est le seul aplat de couleur pleine du document.
		setFill(pdf, brandBlue)
		pdf.Polygon([]fpdf.PointType{{X: 0, Y: bandTop}, {X: 150, Y: bandTop}, {X: 136, Y: 297}, {X: 0, Y: 297}}, "F")
		setFill(pdf, brandYellow)
		pdf.Polygon([]fpdf.PointType{{X: 150, Y: bandTop}, {X: 210, Y: bandTop}, {X: 210, Y: 297}, {X: 136, Y: 297}}, "F")
		pdf.SetTextColor(255, 255, 255)
		if banner := strings.TrimSpace(doc.Company.FooterBanner); banner != "" {
			pdf.SetFont("Caveat", "", 16)
			pdf.SetXY(left, bandTop+4)
			pdf.CellFormat(120, 8, tr(banner), "", 0, "L", false, 0, "")
		}
		pdf.SetFont(pdfFont, "", 7)
		pdf.SetXY(left, bandTop+11)
		pdf.CellFormat(120, 4, tr(doc.Title+" "+doc.Reference), "", 0, "L", false, 0, "")
		pdf.SetXY(right-30, bandTop+11)
		pdf.CellFormat(30, 4, fmt.Sprintf("%d/{np}", pdf.PageNo()), "", 0, "R", false, 0, "")
	})
	pdf.AliasNbPages("{np}")
	pdf.AddPage()

	// ---- En-tete : logo, coordonnees, titre, numero, dates ----------------
	textLeft := left
	if doc.LogoFormat != "" && len(doc.Logo) > 0 {
		pdf.RegisterImageOptionsReader("logo", fpdf.ImageOptions{ImageType: doc.LogoFormat}, bytes.NewReader(doc.Logo))
		if info := pdf.GetImageInfo("logo"); info != nil && info.Height() > 0 {
			height, logoWidth := 30.0, 30.0*info.Width()/info.Height()
			if logoWidth > 42 {
				logoWidth = 42
				height = logoWidth * info.Height() / info.Width()
			}
			pdf.ImageOptions("logo", left, 14, logoWidth, height, false, fpdf.ImageOptions{ImageType: doc.LogoFormat}, 0, "")
			textLeft = left + logoWidth + 9
			// Filet vertical de separation, comme sur le papier a en-tete.
			setStroke(pdf, brandBlue)
			pdf.SetLineWidth(0.6)
			pdf.Line(textLeft-5, 16, textLeft-5, 16+height-2)
			pdf.SetLineWidth(0.2)
		}
	}

	setInk(pdf, brandBlue)
	pdf.SetFont(pdfFont, "B", 12)
	pdf.SetXY(textLeft, 15)
	pdf.CellFormat(80, 6, tr(strings.ToUpper(doc.Company.CompanyName)), "", 0, "L", false, 0, "")

	// Coordonnees, chacune derriere son pictogramme.
	contacts := []struct{ kind, value string }{
		{"pin", doc.Company.Address}, {"phone", doc.Company.Phone},
		{"mail", doc.Company.Email}, {"web", doc.Company.Website},
	}
	y := 23.0
	for _, contact := range contacts {
		if strings.TrimSpace(contact.value) == "" {
			continue
		}
		glyph(pdf, contact.kind, textLeft, y)
		setInk(pdf, inkColor)
		pdf.SetFont(pdfFont, "", 8.5)
		pdf.SetXY(textLeft+6, y-1)
		pdf.MultiCell(62, 4.4, tr(contact.value), "", "L", false)
		y = pdf.GetY() + 1.4
	}

	// Titre, numero encadre, dates — colonne de droite.
	setInk(pdf, brandBlue)
	pdf.SetFont(pdfFont, "B", 27)
	pdf.SetXY(right-80, 14)
	pdf.CellFormat(80, 12, tr(strings.ToUpper(doc.Title)), "", 0, "R", false, 0, "")

	// Le numero vit dans une gelule : segment bleu porteur du « N° », puis le
	// champ cerne de jaune. C'est la premiere chose qu'un client cherche.
	numberTop, numberWidth := 29.0, 74.0
	numberLeft := right - numberWidth
	setStroke(pdf, brandYellow)
	pdf.SetLineWidth(0.8)
	pdf.SetFillColor(255, 255, 255)
	pdf.RoundedRect(numberLeft, numberTop, numberWidth, 9, 4.5, "1234", "FD")
	setFill(pdf, brandBlue)
	pdf.RoundedRect(numberLeft, numberTop, 22, 9, 4.5, "1234", "F")
	pdf.SetLineWidth(0.2)
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont(pdfFont, "B", 9)
	pdf.SetXY(numberLeft, numberTop)
	pdf.CellFormat(22, 9, tr("N°"), "", 0, "C", false, 0, "")
	setInk(pdf, inkColor)
	pdf.SetXY(numberLeft+22, numberTop)
	pdf.CellFormat(numberWidth-22, 9, tr(doc.Reference), "", 0, "C", false, 0, "")

	dates := []struct{ label, value string }{{"Date :", frenchDate(doc.IssuedAt)}}
	if doc.DueAt != "" {
		dates = append(dates, struct{ label, value string }{"Échéance :", doc.DueAt})
	}
	dateY := numberTop + 13
	for _, row := range dates {
		setInk(pdf, brandBlue)
		pdf.SetFont(pdfFont, "B", 9)
		pdf.SetXY(numberLeft, dateY)
		pdf.CellFormat(28, 5, tr(row.label), "", 0, "R", false, 0, "")
		setInk(pdf, inkColor)
		pdf.SetFont(pdfFont, "", 9)
		pdf.CellFormat(numberWidth-30, 5, tr(row.value), "", 0, "L", false, 0, "")
		dateY += 6
	}

	// ---- Destinataires ----------------------------------------------------
	partiesTop := maxFloat(maxFloat(y, dateY)+6, 52)
	column := width/2 - 4
	recipientTitle := "FACTURÉ À :"
	if doc.Kind == "delivery" {
		recipientTitle = "DESTINATAIRE :"
	}
	pill(pdf, pdfFont, tr(recipientTitle), left, partiesTop, left+column, brandBlue, [3]int{255, 255, 255})
	shipTo := doc.ShipTo
	if len(shipTo) > 0 {
		pill(pdf, pdfFont, tr("LIVRER À :"), left+column+8, partiesTop, right, brandYellow, [3]int{255, 255, 255})
	}
	block := func(x float64, lines []string) float64 {
		rowY := partiesTop + 11
		pdf.SetFont(pdfFont, "", 9)
		setInk(pdf, inkColor)
		for _, line := range lines {
			if strings.TrimSpace(line) == "" {
				continue
			}
			pdf.SetXY(x, rowY)
			pdf.MultiCell(column, 4.8, tr(line), "", "L", false)
			rowY = pdf.GetY()
		}
		return rowY
	}
	partiesEnd := block(left, doc.CustomerRow)
	if len(shipTo) > 0 {
		partiesEnd = maxFloat(partiesEnd, block(left+column+8, shipTo))
	}

	// ---- Tableau des lignes ------------------------------------------------
	type headerCell struct {
		label string
		width float64
		align string
	}
	headers := []headerCell{{"#", 10, "C"}, {tr("DÉSIGNATION"), 0, "L"}, {tr("QTÉ"), 18, "C"}}
	if doc.ShowAmounts {
		headers = append(headers,
			headerCell{tr("PRIX UNIT. (FCFA)"), 36, "C"},
			headerCell{tr("MONTANT (FCFA)"), 36, "C"})
	}
	fixed := 0.0
	for _, header := range headers {
		fixed += header.width
	}
	headers[1].width = width - fixed

	pdf.SetY(partiesEnd + 6)
	drawTableHead := func() {
		pdf.SetX(left)
		setFill(pdf, brandBlue)
		pdf.SetTextColor(255, 255, 255)
		pdf.SetFont(pdfFont, "B", 8)
		for _, header := range headers {
			pdf.CellFormat(header.width, 9, header.label, "", 0, header.align, true, 0, "")
		}
		pdf.Ln(-1)
	}
	drawTableHead()

	setInk(pdf, inkColor)
	setStroke(pdf, ruleColor)
	for index, line := range doc.Lines {
		pdf.SetFont(pdfFont, "", 9)
		label := line.Description
		if line.Reference != "" {
			label += "\n" + line.Reference
		}
		height := maxFloat(9, 4.6*float64(len(pdf.SplitLines([]byte(tr(label)), headers[1].width-6)))+4)
		if pdf.GetY()+height > bandTop-70 && index > 0 {
			pdf.AddPage()
			pdf.SetY(28)
			drawTableHead()
		}
		rowY := pdf.GetY()
		// Le filet du bas de ligne remplace la bordure de cellule : une
		// bordure complete aurait redessine la grille du tableau, que le
		// gabarit ne montre qu'en trait clair.
		pdf.Rect(left, rowY, width, height, "D")
		divider := left
		for _, header := range headers[:len(headers)-1] {
			divider += header.width
			pdf.Line(divider, rowY, divider, rowY+height)
		}
		pdf.SetXY(left, rowY)
		pdf.CellFormat(headers[0].width, height, fmt.Sprintf("%d", index+1), "", 0, "C", false, 0, "")
		pdf.SetXY(left+headers[0].width+3, rowY+2)
		pdf.SetFont(pdfFont, "", 9)
		pdf.MultiCell(headers[1].width-6, 4.6, tr(line.Description), "", "L", false)
		if line.Reference != "" {
			pdf.SetX(left + headers[0].width + 3)
			pdf.SetFont(pdfFont, "", 7.5)
			setInk(pdf, mutedColor)
			pdf.MultiCell(headers[1].width-6, 4, tr(line.Reference), "", "L", false)
			setInk(pdf, inkColor)
		}
		pdf.SetXY(left+headers[0].width+headers[1].width, rowY)
		pdf.SetFont(pdfFont, "", 9)
		pdf.CellFormat(headers[2].width, height, fmt.Sprintf("%d", line.Quantity), "", 0, "C", false, 0, "")
		if doc.ShowAmounts {
			pdf.CellFormat(headers[3].width, height, tr(amount(line.UnitPrice)), "", 0, "C", false, 0, "")
			pdf.SetFont(pdfFont, "B", 9)
			pdf.CellFormat(headers[4].width, height, tr(amount(line.Total)), "", 0, "C", false, 0, "")
		}
		pdf.SetY(rowY + height)
	}

	// ---- Bas de page : conditions a gauche, totaux et cachet a droite ------
	// ---- Bas de page : sa hauteur d'abord, sa position ensuite -------------
	//
	// Sur le papier a en-tete, les conditions, les totaux et le cachet sont
	// imprimes en bas de la feuille : ils tombent au meme endroit qu'il y ait
	// deux lignes de vente ou dix. Le rendu fait pareil — il mesure le bloc,
	// puis le cale contre le bandeau. Pose au fil du tableau, il remontait ou
	// descendait d'une facture a l'autre et la piece n'avait plus de forme
	// reconnaissable.
	tableEnd := pdf.GetY()
	columnRight := left + width/2 + 6

	type rubricBlock struct {
		icon, title string
		lines       []string
	}
	rubrics := []rubricBlock{}
	if doc.ShowAmounts {
		if terms := strings.TrimSpace(doc.Company.PaymentTerms); terms != "" {
			rubrics = append(rubrics, rubricBlock{"card", "CONDITIONS DE PAIEMENT", []string{terms}})
		}
		bank := []string{}
		for _, row := range []struct{ label, value string }{
			{"Banque : ", doc.Company.BankName}, {"Compte : ", doc.Company.BankAccount}, {"IBAN : ", doc.Company.BankIban},
		} {
			if strings.TrimSpace(row.value) != "" {
				bank = append(bank, row.label+row.value)
			}
		}
		if len(bank) > 0 {
			rubrics = append(rubrics, rubricBlock{"bank", "INFORMATIONS BANCAIRES", bank})
		}
		if doc.Kind == "invoice" && len(doc.Payments) > 1 {
			parts := make([]string, 0, len(doc.Payments))
			for _, payment := range doc.Payments {
				label := paymentLabel(payment.Method)
				if payment.Amount < 0 {
					label = "Remboursement " + strings.ToLower(label)
				}
				parts = append(parts, fmt.Sprintf("%s · %s %s", shortFrenchDate(payment.At), label, messaging.Money(abs64(payment.Amount))))
			}
			rubrics = append(rubrics, rubricBlock{"card", "RÈGLEMENTS REÇUS", parts})
		}
	}

	// Mesure : le nombre de lignes une fois le texte replie compte, pas le
	// nombre de chaines fournies.
	pdf.SetFont(pdfFont, "", 8.5)
	wrapped := func(text string, boxWidth float64) int {
		return len(pdf.SplitLines([]byte(tr(text)), boxWidth))
	}
	leftHeight := 0.0
	for _, rubric := range rubrics {
		rows := 0
		for _, line := range rubric.lines {
			rows += wrapped(line, 78)
		}
		leftHeight += maxFloat(6+float64(rows)*4.6, 13) + 4
	}
	if doc.ShowAmounts && strings.TrimSpace(doc.Company.ThankYouTitle) != "" {
		leftHeight += 14
	}
	for _, extra := range []string{doc.Company.FooterNote, doc.Notes} {
		if strings.TrimSpace(extra) != "" {
			leftHeight += float64(wrapped(extra, 88))*4.6 + 1
		}
	}

	rightHeight := 0.0
	if doc.ShowAmounts {
		rows := 1
		for _, present := range []bool{doc.Discount > 0, doc.Delivery > 0, doc.Tax > 0} {
			if present {
				rows++
			}
		}
		rightHeight = float64(rows)*6.4 + 14
		if doc.Kind == "invoice" {
			rightHeight += 2*5.4 + 2
		}
	}
	rightHeight += 40

	bottomTop := bandTop - 16 - maxFloat(leftHeight, rightHeight)
	if tableEnd+6 > bottomTop {
		pdf.AddPage()
		bottomTop = maxFloat(28, bandTop-16-maxFloat(leftHeight, rightHeight))
	}
	bottomTop = maxFloat(bottomTop, 28)
	// A partir d'ici, tout est pose en coordonnees absolues. La coupure
	// automatique est levee : declenchee au milieu du bloc, elle deplacait la
	// page courante et les colonnes suivantes se dessinaient sur une feuille
	// blanche que personne n'avait demandee.
	pdf.SetAutoPageBreak(false, 0)

	// Colonne de gauche.
	leftY := bottomTop
	rubric := func(icon, title string, lines []string) {
		if len(lines) == 0 {
			return
		}
		blueIcon(pdf, icon, left, leftY)
		setInk(pdf, brandBlue)
		pdf.SetFont(pdfFont, "B", 9)
		pdf.SetXY(left+15, leftY)
		pdf.CellFormat(70, 5, tr(title), "", 0, "L", false, 0, "")
		setInk(pdf, inkColor)
		pdf.SetFont(pdfFont, "", 8.5)
		rowY := leftY + 6
		for _, line := range lines {
			pdf.SetXY(left+15, rowY)
			pdf.MultiCell(78, 4.6, tr(line), "", "L", false)
			rowY = pdf.GetY()
		}
		leftY = maxFloat(rowY, leftY+13) + 4
	}
	for _, block := range rubrics {
		rubric(block.icon, block.title, block.lines)
	}

	// Mot de remerciement, de la main du gabarit.
	if doc.ShowAmounts && strings.TrimSpace(doc.Company.ThankYouTitle) != "" {
		setInk(pdf, brandBlue)
		pdf.SetFont("Caveat", "", 22)
		pdf.SetXY(left+4, leftY)
		pdf.CellFormat(90, 10, tr(doc.Company.ThankYouTitle), "", 0, "L", false, 0, "")
		// Le trait jaune sous la phrase : deux segments d'epaisseur decroissante
		// suffisent a suggerer le coup de pinceau du gabarit.
		setStroke(pdf, brandYellow)
		pdf.SetLineWidth(1.6)
		pdf.Line(left+6, leftY+11, left+58, leftY+10.2)
		pdf.SetLineWidth(1)
		pdf.Line(left+58, leftY+10.2, left+76, leftY+11.4)
		pdf.SetLineWidth(0.2)
		leftY += 14
	}
	for _, extra := range []struct {
		text  string
		color [3]int
	}{{doc.Company.FooterNote, mutedColor}, {doc.Notes, inkColor}} {
		if strings.TrimSpace(extra.text) == "" || leftY > bandTop-26 {
			continue
		}
		setInk(pdf, extra.color)
		pdf.SetFont(pdfFont, "", 8.5)
		pdf.SetXY(left+4, leftY)
		pdf.MultiCell(88, 4.6, tr(extra.text), "", "L", false)
		leftY = pdf.GetY() + 1
	}

	// Colonne de droite : totaux puis cachet.
	rightY := bottomTop
	if doc.ShowAmounts {
		totals := []struct {
			label string
			value int64
		}{{"Sous-total", doc.Subtotal}}
		if doc.Discount > 0 {
			totals = append(totals, struct {
				label string
				value int64
			}{"Remise", -doc.Discount})
		}
		if doc.Delivery > 0 {
			totals = append(totals, struct {
				label string
				value int64
			}{"Livraison", doc.Delivery})
		}
		if doc.Tax > 0 {
			totals = append(totals, struct {
				label string
				value int64
			}{"TVA", doc.Tax})
		}
		pdf.SetFont(pdfFont, "", 9.5)
		for _, row := range totals {
			setInk(pdf, inkColor)
			pdf.SetXY(columnRight, rightY)
			pdf.CellFormat(46, 6, tr(row.label), "", 0, "L", false, 0, "")
			pdf.CellFormat(right-columnRight-46, 6, tr(amount(row.value)+" FCFA"), "", 0, "R", false, 0, "")
			rightY += 6.4
		}
		setStroke(pdf, brandBlue)
		pdf.SetLineWidth(0.6)
		pdf.Line(columnRight, rightY+1, right, rightY+1)
		pdf.SetLineWidth(0.2)
		rightY += 4
		setInk(pdf, brandBlue)
		pdf.SetFont(pdfFont, "B", 13)
		pdf.SetXY(columnRight, rightY)
		pdf.CellFormat(40, 8, "TOTAL", "", 0, "L", false, 0, "")
		pdf.CellFormat(right-columnRight-40, 8, tr(amount(doc.Total)+" FCFA"), "", 0, "R", false, 0, "")
		rightY += 10

		if doc.Kind == "invoice" {
			pdf.SetFont(pdfFont, "", 9)
			for _, row := range []struct {
				label string
				value int64
			}{{"Montant payé", doc.Paid}, {"Reste à payer", doc.Remaining}} {
				setInk(pdf, mutedColor)
				if row.label == "Reste à payer" && row.value > 0 {
					setInk(pdf, [3]int{176, 32, 32})
					pdf.SetFont(pdfFont, "B", 9)
				}
				pdf.SetXY(columnRight, rightY)
				pdf.CellFormat(46, 5, tr(row.label), "", 0, "L", false, 0, "")
				pdf.CellFormat(right-columnRight-46, 5, tr(amount(row.value)+" FCFA"), "", 0, "R", false, 0, "")
				rightY += 5.4
			}
			rightY += 2
		}
	}

	// Cachet et signature : le cadre bleu arrondi du gabarit.
	stampTop := maxFloat(rightY+2, bottomTop)
	stampWidth := right - columnRight
	setStroke(pdf, brandBlue)
	pdf.SetLineWidth(0.5)
	pdf.RoundedRect(columnRight, stampTop, stampWidth, 38, 3, "1234", "D")
	pdf.SetLineWidth(0.2)
	setInk(pdf, brandBlue)
	pdf.SetFont(pdfFont, "B", 8)
	pdf.SetXY(columnRight, stampTop+2.5)
	pdf.CellFormat(stampWidth, 5, tr("CACHET & SIGNATURE"), "", 0, "C", false, 0, "")
	if doc.SignatureFormat != "" && len(doc.Signature) > 0 {
		pdf.RegisterImageOptionsReader("signature", fpdf.ImageOptions{ImageType: doc.SignatureFormat}, bytes.NewReader(doc.Signature))
		if info := pdf.GetImageInfo("signature"); info != nil && info.Height() > 0 {
			height := 27.0
			imageWidth := height * info.Width() / info.Height()
			if imageWidth > stampWidth-10 {
				imageWidth = stampWidth - 10
				height = imageWidth * info.Height() / info.Width()
			}
			pdf.ImageOptions("signature", columnRight+(stampWidth-imageWidth)/2, stampTop+8+(28-height)/2,
				imageWidth, height, false, fpdf.ImageOptions{ImageType: doc.SignatureFormat}, 0, "")
		}
	}

	// Mentions legales, juste au-dessus du bandeau : c'est ce que le comptable
	// du client et l'administration viennent chercher.
	bottomEnd := maxFloat(leftY, stampTop+38)
	// La coupure automatique est levee pour ces deux lignes : posees au fil du
	// curseur, elles depassaient la marge de bas de page et ouvraient une
	// deuxieme feuille entierement vide.
	seller := doc.Seller
	if seller == "" {
		seller = doc.Company.CompanyName
	}
	legalY := maxFloat(bottomEnd+5, bandTop-13)
	if legalY > bandTop-13 {
		legalY = bandTop - 13
	}
	if legal := doc.Company.legalLine(); legal != "" {
		setInk(pdf, mutedColor)
		pdf.SetFont(pdfFont, "B", 7.5)
		pdf.SetXY(left, legalY)
		pdf.CellFormat(width, 4, tr(legal), "", 0, "C", false, 0, "")
	}
	setInk(pdf, mutedColor)
	pdf.SetFont(pdfFont, "", 7)
	pdf.SetXY(left, bandTop-8)
	pdf.CellFormat(width, 4, tr("Document généré le "+frenchDate(time.Now())+" · Vendeur : "+seller), "", 0, "C", false, 0, "")

	var out bytes.Buffer
	if err := pdf.Output(&out); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// amount rend « 25 000 » sans unite : le gabarit la porte dans l'en-tete de
// colonne et dans les totaux, jamais sur chaque ligne.
func amount(value int64) string {
	return strings.TrimSuffix(messaging.Money(value), " F")
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
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
	doc.BackgroundFormat, doc.Background = uploadedImage(s.readCheckoutSettings().InvoiceDefaults.Background)
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
