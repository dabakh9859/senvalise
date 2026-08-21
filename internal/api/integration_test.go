package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"
	"testing"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"senvalise/internal/auth"
	"senvalise/internal/database"
	"senvalise/internal/models"
)

// Tests d'integration des regles qui protegent le stock et la caisse.
//
// Le README annonce ces regles comme non negociables — interdiction de la
// survente, retour plafonne a ce qui a ete encaisse, coffre sans decouvert,
// especes qui alimentent le tiroir. Aucune n'etait verifiee : elles vivent
// dans des transactions PostgreSQL, donc hors de portee d'un test de fonction
// pure, et personne n'avait branche de base de test.
//
// Ces tests passent par l'API reelle, avec un vrai PostgreSQL. Ils ne
// s'executent que si TEST_DATABASE_URL designe une base jetable :
//
//	createdb senvalise_test
//	TEST_DATABASE_URL="postgres://senvalise:…@127.0.0.1:5432/senvalise_test?sslmode=disable" go test ./internal/api/
//
// Sans cette variable ils sont ignores, pour qu'un « go test ./... » reste
// possible sur une machine sans base.

type harness struct {
	t     *testing.T
	app   *fiber.App
	db    *gorm.DB
	token string
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL absent : test d'intégration ignoré")
	}
	t.Setenv("DATABASE_URL", dsn)
	t.Setenv("JWT_SECRET", "secret-de-test-uniquement-pour-les-tests")
	t.Setenv("SEED_DEMO", "false")

	db, err := database.Open()
	if err != nil {
		t.Fatalf("ouverture de la base de test : %v", err)
	}
	// Chaque test repart d'une base vide de toute activite commerciale. Le
	// catalogue seme par Open() reste : le recreer a chaque test couterait plus
	// cher que de le laisser.
	tables := []string{
		"return_items", "sale_returns", "sale_payments", "sale_items", "sales",
		"quote_items", "quotes", "delivery_note_items", "delivery_notes",
		"order_items", "orders", "vault_deposits", "vaults",
		"cash_movements", "cash_sessions", "stock_movements", "messages",
		"campaigns", "activity_logs", "customer_addresses",
	}
	if err := db.Exec("TRUNCATE " + joinTables(tables) + " RESTART IDENTITY CASCADE").Error; err != nil {
		t.Fatalf("nettoyage de la base de test : %v", err)
	}

	app := fiber.New(fiber.Config{ErrorHandler: func(c *fiber.Ctx, e error) error {
		code := 500
		if x, ok := e.(*fiber.Error); ok {
			code = x.Code
		}
		return c.Status(code).JSON(fiber.Map{"error": e.Error()})
	}})
	server := &Server{DB: db}
	server.Register(app)

	var user models.User
	if db.Where("role = ?", "manager").First(&user).Error != nil {
		user = models.User{Name: "Gérant de test", Email: "test@senvalise.local", Role: "manager", Active: true}
		db.Create(&user)
	}
	token, _ := auth.Sign(user.ID, "manager")
	return &harness{t: t, app: app, db: db, token: token}
}

func joinTables(tables []string) string {
	out := ""
	for i, table := range tables {
		if i > 0 {
			out += ", "
		}
		out += table
	}
	return out
}

// call joue une requete authentifiee et rend le code et le corps decode.
func (h *harness) call(method, path string, body any) (int, map[string]any) {
	h.t.Helper()
	var reader *bytes.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}
	request, _ := http.NewRequest(method, path, reader)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+h.token)
	response, err := h.app.Test(request, 10000)
	if err != nil {
		h.t.Fatalf("%s %s : %v", method, path, err)
	}
	defer response.Body.Close()
	out := map[string]any{}
	_ = json.NewDecoder(response.Body).Decode(&out)
	return response.StatusCode, out
}

// variantWithStock prepare une declinaison vendable au stock voulu.
func (h *harness) variantWithStock(stock int64, price int64) models.ProductVariant {
	h.t.Helper()
	var variant models.ProductVariant
	if h.db.Order("id asc").First(&variant).Error != nil {
		h.t.Fatal("aucune déclinaison au catalogue : la base de test n'est pas semée")
	}
	h.db.Model(&variant).Updates(map[string]any{"stock": stock, "price": price, "active": true})
	h.db.First(&variant, variant.ID)
	return variant
}

func (h *harness) stockOf(id uint) int64 {
	var variant models.ProductVariant
	h.db.First(&variant, id)
	return variant.Stock
}

// La survente est le defaut le plus couteux d'une gestion de stock : elle se
// solde par un client a qui l'on a pris de l'argent pour une marchandise qui
// n'existe pas.
func TestCheckoutRefusesOversell(t *testing.T) {
	h := newHarness(t)
	variant := h.variantWithStock(2, 50000)

	status, body := h.call(http.MethodPost, "/api/sales/checkout", fiber.Map{
		"paymentMethod": "cash", "paid": 150000,
		"items": []fiber.Map{{"variantId": variant.ID, "quantity": 3, "unitPrice": 50000}},
	})
	if status < 400 {
		t.Fatalf("vente de 3 pièces sur un stock de 2 acceptée (%d) : %v", status, body)
	}
	if got := h.stockOf(variant.ID); got != 2 {
		t.Fatalf("le stock a bougé malgré le refus : %d au lieu de 2", got)
	}
}

// Deux caisses qui vendent la derniere piece au meme instant : le verrou de
// ligne doit en laisser passer exactement une. Sans lui, les deux lisent
// « stock = 1 » puis ecrivent « stock = 0 », et la boutique a vendu deux fois
// le meme article.
func TestConcurrentCheckoutSellsTheLastItemOnce(t *testing.T) {
	h := newHarness(t)
	variant := h.variantWithStock(1, 40000)

	const attempts = 4
	var wait sync.WaitGroup
	results := make([]int, attempts)
	// Barriere de depart. Sans elle, la premiere requete a le temps de finir
	// avant que la derniere ne commence : le test passait alors meme avec le
	// verrou retire, ce qui en faisait un temoin muet. Verifie par mutation —
	// verrou retire, ce test doit echouer.
	start := make(chan struct{})
	for i := 0; i < attempts; i++ {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			<-start
			status, _ := h.call(http.MethodPost, "/api/sales/checkout", fiber.Map{
				"paymentMethod": "cash", "paid": 40000,
				"items": []fiber.Map{{"variantId": variant.ID, "quantity": 1, "unitPrice": 40000}},
			})
			results[index] = status
		}(i)
	}
	close(start)
	wait.Wait()

	success := 0
	for _, status := range results {
		if status < 400 {
			success++
		}
	}
	if success != 1 {
		t.Fatalf("%d ventes acceptées sur un stock de 1 (codes %v)", success, results)
	}
	if got := h.stockOf(variant.ID); got != 0 {
		t.Fatalf("stock final %d au lieu de 0", got)
	}
	// Le stock final ne distingue pas les deux cas : sans verrou, chaque
	// transaction ecrit « 1 - 1 = 0 » a partir d'une lecture perimee, et le
	// stock finit a 0 malgre quatre ventes. Ce sont les lignes enregistrees
	// qui trahissent la survente.
	var sales int64
	h.db.Model(&models.Sale{}).Count(&sales)
	if sales != 1 {
		t.Fatalf("%d ventes enregistrées pour un stock de 1", sales)
	}
}

// Un retour ne peut pas rendre plus d'articles qu'il n'en a ete vendu : sinon
// le stock se remplit d'unites qui ne sont jamais entrees, et le
// remboursement sort de la caisse sans contrepartie.
func TestReturnCannotExceedInvoicedQuantity(t *testing.T) {
	h := newHarness(t)
	variant := h.variantWithStock(5, 30000)

	status, sale := h.call(http.MethodPost, "/api/sales/checkout", fiber.Map{
		"paymentMethod": "cash", "paid": 30000,
		"items": []fiber.Map{{"variantId": variant.ID, "quantity": 1, "unitPrice": 30000}},
	})
	if status >= 400 {
		t.Fatalf("la vente de référence a échoué : %v", sale)
	}
	saleID := uint(sale["id"].(float64))

	status, body := h.call(http.MethodPost, "/api/returns/process", fiber.Map{
		"saleId": saleID, "reason": "Test de dépassement", "refundMethod": "cash", "restock": true,
		"items": []fiber.Map{{"variantId": variant.ID, "quantity": 2, "amount": 60000}},
	})
	if status < 400 {
		t.Fatalf("retour de 2 pièces sur 1 vendue accepté (%d) : %v", status, body)
	}
	// Le stock doit rester celui d'apres la vente : 5 - 1.
	if got := h.stockOf(variant.ID); got != 4 {
		t.Fatalf("stock %d au lieu de 4 : le retour refusé a quand même remis en stock", got)
	}
}

// Le coffre est l'epargne du client : il ne peut pas passer a decouvert, sinon
// la boutique lui rend de l'argent qu'il n'a pas verse.
func TestVaultRefusesOverdraft(t *testing.T) {
	h := newHarness(t)
	customer := models.Customer{Name: "Client de test", Phone: "770000000", Active: true}
	h.db.Create(&customer)
	vault := models.Vault{CustomerID: customer.ID, Status: "open"}
	h.db.Create(&vault)

	if status, body := h.call(http.MethodPost, fmt.Sprintf("/api/vaults/%d/deposit", vault.ID),
		fiber.Map{"amount": 5000, "method": "cash"}); status >= 400 {
		t.Fatalf("versement refusé : %v", body)
	}
	status, body := h.call(http.MethodPost, fmt.Sprintf("/api/vaults/%d/withdraw", vault.ID),
		fiber.Map{"amount": 9000, "method": "cash"})
	if status < 400 {
		t.Fatalf("retrait de 9 000 F sur un solde de 5 000 F accepté (%d) : %v", status, body)
	}
	h.db.First(&vault, vault.ID)
	if vault.Balance != 5000 {
		t.Fatalf("solde %d au lieu de 5000 après un retrait refusé", vault.Balance)
	}
}

// Seules les especes passent par le tiroir. Un reglement Wave qui alimenterait
// la session de caisse ferait constater un ecart a la cloture, tous les soirs.
func TestOnlyCashFeedsTheDrawer(t *testing.T) {
	h := newHarness(t)
	variant := h.variantWithStock(10, 20000)

	if status, body := h.call(http.MethodPost, "/api/cash/open", fiber.Map{"openingAmount": 10000}); status >= 400 {
		t.Fatalf("ouverture de caisse : %v", body)
	}
	expected := func() int64 {
		var session models.CashSession
		h.db.Where("status = 'open'").First(&session)
		return session.ExpectedAmount
	}
	if got := expected(); got != 10000 {
		t.Fatalf("fond de caisse %d au lieu de 10000", got)
	}

	h.call(http.MethodPost, "/api/sales/checkout", fiber.Map{
		"paymentMethod": "cash", "paid": 20000,
		"items": []fiber.Map{{"variantId": variant.ID, "quantity": 1, "unitPrice": 20000}},
	})
	if got := expected(); got != 30000 {
		t.Fatalf("après une vente en espèces : %d au lieu de 30000", got)
	}

	h.call(http.MethodPost, "/api/sales/checkout", fiber.Map{
		"paymentMethod": "wave", "paid": 20000,
		"items": []fiber.Map{{"variantId": variant.ID, "quantity": 1, "unitPrice": 20000}},
	})
	if got := expected(); got != 30000 {
		t.Fatalf("un règlement Wave a bougé le tiroir : %d au lieu de 30000", got)
	}
}

// Les references viennent d'une sequence PostgreSQL. Deux ventes enregistrees
// dans la meme milliseconde recevaient autrefois la meme reference, et l'index
// unique en rejetait une — une vente perdue au comptoir.
func TestReferencesStayUniqueUnderLoad(t *testing.T) {
	h := newHarness(t)
	variant := h.variantWithStock(30, 1000)

	const sales = 12
	var wait sync.WaitGroup
	for i := 0; i < sales; i++ {
		wait.Add(1)
		go func() {
			defer wait.Done()
			h.call(http.MethodPost, "/api/sales/checkout", fiber.Map{
				"paymentMethod": "cash", "paid": 1000,
				"items": []fiber.Map{{"variantId": variant.ID, "quantity": 1, "unitPrice": 1000}},
			})
		}()
	}
	wait.Wait()

	var total, distinct int64
	h.db.Model(&models.Sale{}).Count(&total)
	h.db.Model(&models.Sale{}).Distinct("reference").Count(&distinct)
	if total != sales {
		t.Fatalf("%d ventes enregistrées sur %d tentées", total, sales)
	}
	if distinct != total {
		t.Fatalf("%d références distinctes pour %d ventes", distinct, total)
	}
}
