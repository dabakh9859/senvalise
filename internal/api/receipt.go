package api

import (
	"bytes"
	"fmt"
	"strconv"
	"strings"

	"github.com/go-pdf/fpdf"
	"github.com/gofiber/fiber/v2"

	"senvalise/internal/messaging"
)

// Le recu de caisse, sur rouleau de 80 mm.
//
// Les pieces ne sortaient qu'en A4. Pour une vente de 15 000 F au comptoir,
// c'est une page entiere la ou l'on veut un ticket qui sort en trois secondes
// et tient dans la poche. La facture A4 reste pour ceux qui la demandent —
// une entreprise, un comptable — mais elle ne peut pas etre le seul format.
//
// La largeur est fixe et la hauteur libre : un rouleau n'a pas de page, il se
// coupe la ou le texte s'arrete. fpdf demande malgre tout une hauteur a la
// creation, on la calcule donc a partir du nombre de lignes.

const receiptWidth = 80.0

func receiptHeight(doc pdfDocument) float64 {
	// Un en-tete, un pied, et environ neuf millimetres par article. La marge
	// finale evite qu'une ligne longue, repliee sur deux, deborde du rouleau.
	height := 92.0 + float64(len(doc.Lines))*9
	if doc.Kind == "invoice" {
		height += float64(len(doc.Payments)) * 4.5
	}
	if strings.TrimSpace(doc.Company.legalLine()) != "" {
		height += 8
	}
	return height
}

func renderReceipt(doc pdfDocument) ([]byte, error) {
	height := receiptHeight(doc)
	pdf := fpdf.NewCustom(&fpdf.InitType{UnitStr: "mm", Size: fpdf.SizeType{Wd: receiptWidth, Ht: height}})
	font, tr := setupFont(pdf)
	pdf.SetTitle("Reçu "+doc.Reference, true)
	pdf.SetAutoPageBreak(false, 0)
	pdf.SetMargins(4, 5, 4)
	pdf.AddPage()
	const left = 4.0
	width := receiptWidth - 8

	center := func(text string, style string, size float64, gap float64) {
		pdf.SetFont(font, style, size)
		pdf.SetX(left)
		pdf.MultiCell(width, size*0.42+1.4, tr(text), "", "C", false)
		if gap > 0 {
			pdf.Ln(gap)
		}
	}
	rule := func() {
		setStroke(pdf, brandLine)
		pdf.SetX(left)
		pdf.Line(left, pdf.GetY(), receiptWidth-left, pdf.GetY())
		pdf.Ln(2)
	}

	// En-tete : le logo si on en a un, sinon le nom suffit. Sur un rouleau
	// thermique, une image trop grande coute du papier et sort baveuse.
	if doc.LogoFormat != "" && len(doc.Logo) > 0 {
		pdf.RegisterImageOptionsReader("logo", fpdf.ImageOptions{ImageType: doc.LogoFormat}, bytes.NewReader(doc.Logo))
		if info := pdf.GetImageInfo("logo"); info != nil && info.Height() > 0 {
			h := 14.0
			w := h * info.Width() / info.Height()
			if w > 30 {
				w = 30
				h = w * info.Height() / info.Width()
			}
			pdf.ImageOptions("logo", (receiptWidth-w)/2, 5, w, h, true, fpdf.ImageOptions{ImageType: doc.LogoFormat}, 0, "")
		}
	}
	setInk(pdf, brandInk)
	center(strings.ToUpper(doc.Company.CompanyName), "B", 12, 0)
	setInk(pdf, brandMuted)
	for _, line := range []string{doc.Company.Address, doc.Company.Phone} {
		if strings.TrimSpace(line) != "" {
			center(line, "", 7.5, 0)
		}
	}
	pdf.Ln(2)
	setInk(pdf, brandInk)
	center(strings.ToUpper(doc.Title)+" "+doc.Reference, "B", 8.5, 0)
	setInk(pdf, brandMuted)
	center(frenchDate(doc.IssuedAt), "", 7.5, 1)
	if len(doc.CustomerRow) > 0 && strings.TrimSpace(doc.CustomerRow[0]) != "" {
		center("Client : "+doc.CustomerRow[0], "", 7.5, 1)
	}
	rule()

	// Les articles : designation sur sa ligne, quantite et montant en dessous.
	// Sur 72 mm utiles, tout mettre sur une seule ligne tronquerait les noms.
	setInk(pdf, brandInk)
	for _, line := range doc.Lines {
		pdf.SetFont(font, "B", 8)
		pdf.SetX(left)
		pdf.MultiCell(width, 3.9, tr(line.Description), "", "L", false)
		pdf.SetFont(font, "", 7.8)
		pdf.SetX(left)
		detail := fmt.Sprintf("%s × %s", strconv.FormatInt(line.Quantity, 10), messaging.Money(line.UnitPrice))
		if line.Discount > 0 {
			detail += "  (− " + messaging.Money(line.Discount) + ")"
		}
		pdf.CellFormat(width*0.6, 4.2, tr(detail), "", 0, "L", false, 0, "")
		pdf.SetFont(font, "B", 8)
		pdf.CellFormat(width*0.4, 4.2, tr(messaging.Money(line.Total)), "", 1, "R", false, 0, "")
	}
	rule()

	total := func(label, value string, strong bool) {
		style, size := "", 8.0
		if strong {
			style, size = "B", 10.5
		}
		pdf.SetFont(font, style, size)
		pdf.SetX(left)
		pdf.CellFormat(width*0.55, size*0.5+1, tr(label), "", 0, "L", false, 0, "")
		pdf.CellFormat(width*0.45, size*0.5+1, tr(value), "", 1, "R", false, 0, "")
	}
	if doc.ShowAmounts {
		if doc.Discount > 0 {
			total("Sous-total", messaging.Money(doc.Subtotal), false)
			total("Remise", "− "+messaging.Money(doc.Discount), false)
		}
		if doc.Tax > 0 {
			total("TVA", messaging.Money(doc.Tax), false)
		}
		total("TOTAL", messaging.Money(doc.Total), true)
		if doc.Kind == "invoice" {
			for _, payment := range doc.Payments {
				label := paymentLabel(payment.Method)
				if payment.Amount < 0 {
					label = "Remboursement"
				}
				total(label, messaging.Money(abs64(payment.Amount)), false)
			}
			if doc.Remaining > 0 {
				total("Reste à payer", messaging.Money(doc.Remaining), true)
			}
		}
	}
	rule()

	setInk(pdf, brandMuted)
	if title := strings.TrimSpace(doc.Company.ThankYouTitle); title != "" {
		center(title, "B", 8.5, 0)
	}
	if legal := doc.Company.legalLine(); legal != "" {
		center(legal, "", 6.5, 0)
	}
	if doc.Seller != "" {
		center("Servi par "+doc.Seller, "", 6.5, 0)
	}

	var out bytes.Buffer
	if err := pdf.Output(&out); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// receiptHandler rend le recu d'une piece.
func (s *Server) receiptHandler(c *fiber.Ctx) error {
	kind := c.Params("kind")
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return fiber.ErrBadRequest
	}
	doc, err := s.loadDocument(kind, uint(id))
	if err != nil {
		return fiber.NewError(404, err.Error())
	}
	doc.LogoFormat, doc.Logo = s.brandingLogoFile()
	raw, err := renderReceipt(doc)
	if err != nil {
		return err
	}
	c.Set("Content-Type", "application/pdf")
	c.Set("Content-Disposition", fmt.Sprintf(`inline; filename="Recu-%s.pdf"`, doc.Reference))
	return c.Send(raw)
}
