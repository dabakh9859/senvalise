package api

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"testing"
	"time"

	"senvalise/internal/models"
)

func TestFallbackRefPrefix(t *testing.T) {
	r := fallbackRef("VTE")
	if len(r) < 4 || r[:3] != "VTE" {
		t.Fatalf("référence invalide: %s", r)
	}
}

// Le repli horodaté descend à la microseconde : deux appels consécutifs ne
// doivent plus produire la même chaîne, ce qui était la cause des ventes
// perdues sur violation d'index unique.
func TestFallbackRefDoesNotRepeat(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		r := fallbackRef("VTE")
		if seen[r] {
			t.Fatalf("référence dupliquée après %d appels: %s", i, r)
		}
		seen[r] = true
	}
}

func TestDashboardPeriods(t *testing.T) {
	now := time.Date(2026, time.August, 18, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		period string
		points int
		bucket string
	}{{"7d", 7, "day"}, {"30d", 30, "day"}, {"90d", 90, "day"}, {"12m", 12, "month"}}
	for _, test := range tests {
		start, bucket := dashboardPeriod(test.period, now)
		if bucket != test.bucket {
			t.Fatalf("%s: bucket %s", test.period, bucket)
		}
		points := fillTrend(nil, start, now, bucket)
		if len(points) != test.points {
			t.Fatalf("%s: %d points, attendu %d", test.period, len(points), test.points)
		}
	}
}

func TestReturnInputDecodesQuantityAndAmount(t *testing.T) {
	body := []byte(`{
		"saleId": 42,
		"reason": "Article défectueux",
		"refundMethod": "cash",
		"restock": true,
		"items": [
			{"variantId": 7, "quantity": 2, "amount": 30000},
			{"variantId": 9, "quantity": 1, "amount": 12500}
		]
	}`)
	var in returnInput
	if e := json.Unmarshal(body, &in); e != nil {
		t.Fatalf("décodage impossible: %v", e)
	}
	if in.SaleID != 42 || !in.Restock {
		t.Fatalf("en-tête du retour mal décodé: %+v", in)
	}
	if len(in.Items) != 2 {
		t.Fatalf("%d lignes décodées, attendu 2", len(in.Items))
	}
	expected := []returnLineInput{{VariantID: 7, Quantity: 2, Amount: 30000}, {VariantID: 9, Quantity: 1, Amount: 12500}}
	var total int64
	for i, line := range in.Items {
		if line != expected[i] {
			t.Fatalf("ligne %d décodée %+v, attendu %+v", i, line, expected[i])
		}
		total += line.Amount
	}
	if total != 42500 {
		t.Fatalf("montant remboursé %d, attendu 42500", total)
	}
}

func TestPaymentStatus(t *testing.T) {
	cases := []struct {
		paid, total int64
		current     string
		want        string
	}{
		{0, 45000, "", "pending"},
		{20000, 45000, "pending", "partial"},
		{45000, 45000, "partial", "paid"},
		{50000, 45000, "partial", "paid"},
		{0, 45000, "cancelled", "cancelled"},
		{45000, 45000, "cancelled", "cancelled"},
		{0, 0, "", "pending"},
	}
	for _, c := range cases {
		if got := paymentStatus(c.paid, c.total, c.current); got != c.want {
			t.Fatalf("paymentStatus(%d, %d, %q) = %q, attendu %q", c.paid, c.total, c.current, got, c.want)
		}
	}
}

// Les frais d'importation doivent se retrouver dans le coût de revient, et le
// prix d'achat doit être converti. Avant correction, le coût de la déclinaison
// reprenait le prix brut et un montant en yuans était compté en francs.
func TestLandedCostsAppliesRateAndOverhead(t *testing.T) {
	arrival := models.Arrival{
		ExchangeRate: 80,
		Shipping:     300000,
		Customs:      150000,
		OtherFees:    50000,
		Items: []models.ArrivalItem{
			{Base: models.Base{ID: 1}, VariantID: 10, Quantity: 10, UnitCost: 100}, // 8 000 F l'unité
			{Base: models.Base{ID: 2}, VariantID: 11, Quantity: 10, UnitCost: 300}, // 24 000 F l'unité
		},
	}
	got := landedCosts(arrival)
	// Valeur d'achat convertie : 80 000 + 240 000 = 320 000 F.
	// Frais : 500 000 F, répartis à 25 % / 75 % — soit 12 500 et 37 500 par unité.
	if got[1] != 8000+12500 {
		t.Fatalf("ligne 1 : coût rendu %d, attendu %d", got[1], 8000+12500)
	}
	if got[2] != 24000+37500 {
		t.Fatalf("ligne 2 : coût rendu %d, attendu %d", got[2], 24000+37500)
	}
	// La somme ventilée doit rendre l'intégralité des frais, sans en créer.
	var total int64
	for _, item := range arrival.Items {
		total += got[item.ID] * item.Quantity
	}
	if want := int64(320000 + 500000); total != want {
		t.Fatalf("valeur totale rendue %d, attendu %d", total, want)
	}
}

func TestLandedCostsWithoutRateOrOverhead(t *testing.T) {
	arrival := models.Arrival{
		Items: []models.ArrivalItem{{Base: models.Base{ID: 1}, VariantID: 10, Quantity: 5, UnitCost: 12000}},
	}
	// Taux absent : le montant est déjà en francs et ne doit pas être écrasé.
	if got := landedCosts(arrival); got[1] != 12000 {
		t.Fatalf("coût rendu %d, attendu 12000", got[1])
	}
}

// Chaque ressource listable doit savoir sur quoi porte sa recherche, sans quoi
// la barre de recherche retombe sur le seul identifiant.
func TestSearchColumnsCoverListedResources(t *testing.T) {
	for _, resource := range []string{
		"categories", "brands", "suppliers", "customers", "products", "variants",
		"arrivals", "sales", "returns", "quotes", "delivery-notes", "orders",
		"vaults", "cash-sessions", "cash-movements", "messages", "message-templates",
		"home-blocks", "activity-logs", "delivery-zones", "contact-messages",
		"expenses", "users", "stock-movements",
	} {
		if len(searchColumns[resource]) == 0 {
			t.Errorf("aucune colonne de recherche pour %q", resource)
		}
	}
}

// Les règles de suppression ne doivent viser que des ressources connues :
// une faute de frappe rendrait la règle inopérante sans rien signaler.
func TestDeleteRulesTargetKnownResources(t *testing.T) {
	for name := range deleteChildren {
		if modelFor(name) == nil {
			t.Errorf("deleteChildren cible une ressource inconnue : %q", name)
		}
	}
	for name := range deleteBlockers {
		if modelFor(name) == nil {
			t.Errorf("deleteBlockers cible une ressource inconnue : %q", name)
		}
	}
}

func TestUniqueHintNamesTheField(t *testing.T) {
	cases := map[string]string{
		"idx_users_email":     "adresse e-mail",
		"idx_sales_reference": "référence",
		"idx_products_slug":   "identifiant d’URL",
		"idx_variants_sku":    "SKU",
	}
	for constraint, fragment := range cases {
		if got := uniqueHint(constraint); !contains(got, fragment) {
			t.Errorf("uniqueHint(%q) = %q, devrait mentionner %q", constraint, got, fragment)
		}
	}
}

// Le format est déduit des octets, pas du nom : un script renommé .png doit
// être refusé.
func TestImageExtensionReadsMagicBytes(t *testing.T) {
	cases := []struct {
		name    string
		content []byte
		want    string
		ok      bool
	}{
		{"photo.png", []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0}, ".png", true},
		{"photo.jpg", []byte{0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0, 0, 0}, ".jpg", true},
		{"photo.webp", append([]byte("RIFF0000WEBP"), 0), ".webp", true},
		{"exploit.png", []byte("<?php system($_GET[0]); ?>"), "", false},
		{"document.png", []byte("%PDF-1.7\n%????"), "", false},
		{"vide.png", []byte{}, "", false},
	}
	for _, c := range cases {
		header := multipartHeader(t, c.name, c.content)
		got, err := imageExtension(header)
		if c.ok {
			if err != nil {
				t.Errorf("%s: refusé alors qu'il est valide (%v)", c.name, err)
			} else if got != c.want {
				t.Errorf("%s: format %q, attendu %q", c.name, got, c.want)
			}
			continue
		}
		if err == nil {
			t.Errorf("%s: accepté alors que le contenu n'est pas une image (format %q)", c.name, got)
		}
	}
}

// multipartHeader fabrique un en-tête de fichier lisible, comme le ferait un
// vrai envoi de formulaire.
func multipartHeader(t *testing.T, name string, content []byte) *multipart.FileHeader {
	t.Helper()
	var buffer bytes.Buffer
	writer := multipart.NewWriter(&buffer)
	part, err := writer.CreateFormFile("image", name)
	if err != nil {
		t.Fatalf("création du formulaire: %v", err)
	}
	if _, err = part.Write(content); err != nil {
		t.Fatalf("écriture du contenu: %v", err)
	}
	if err = writer.Close(); err != nil {
		t.Fatalf("fermeture du formulaire: %v", err)
	}
	reader := multipart.NewReader(&buffer, writer.Boundary())
	form, err := reader.ReadForm(1 << 20)
	if err != nil {
		t.Fatalf("lecture du formulaire: %v", err)
	}
	return form.File["image"][0]
}
