package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"mime/multipart"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"senvalise/internal/auth"
	"senvalise/internal/models"
)

type Server struct{ DB *gorm.DB }
type dashboardTrend struct {
	Date   time.Time `json:"date"`
	Billed int64     `json:"billed"`
	Paid   int64     `json:"paid"`
	Count  int64     `json:"count"`
}

// loginLimiter freine les tentatives de connexion.
//
// Rien ne les limitait : vingt-cinq mots de passe erronés passaient en 1,4
// seconde, soit environ dix-huit essais par seconde, sans ralentissement ni
// trace. La fenêtre est volontairement large pour ne pas gêner un vendeur qui
// se trompe deux fois de suite, mais elle rend la force brute inopérante.
func loginLimiter() fiber.Handler {
	return limiter.New(limiter.Config{
		Max:        15,
		Expiration: 5 * time.Minute,
		// Seuls les échecs comptent : un vendeur qui tape juste ne doit jamais
		// se retrouver enfermé dehors parce qu'un collègue s'est trompé.
		SkipSuccessfulRequests: true,
		KeyGenerator: func(c *fiber.Ctx) string {
			return "login:" + c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(429).JSON(fiber.Map{
				"error": "Trop de tentatives de connexion. Réessayez dans quelques minutes.",
			})
		},
	})
}

// publicLimiter freine ce qui est ouvert a tous : catalogue, fiches produit,
// formulaire de contact, plan du site. Seule la connexion etait protegee ; le
// reste acceptait n'importe quel volume, ce qui permettait a un seul client
// d'occuper la base et de rendre la boutique lente pour les autres.
//
// Le plafond est large — un visiteur qui parcourt le catalogue enchaine
// facilement trente requetes en une minute — mais il coupe court a
// l'aspiration systematique.
func publicLimiter() fiber.Handler {
	return limiter.New(limiter.Config{
		Max:        120,
		Expiration: time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			return "public:" + c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(429).JSON(fiber.Map{
				"error": "Trop de requêtes. Patientez quelques instants.",
			})
		},
	})
}

func (s *Server) Register(app *fiber.App) {
	app.Get("/health", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"status": "ok", "service": "senvalise-api"}) })
	app.Static("/uploads", "/uploads")
	app.Post("/api/auth/login", loginLimiter(), s.login)
	app.Get("/api/shop/products", publicLimiter(), s.shopProducts)
	app.Post("/api/shop/contact", publicLimiter(), s.createContact)
	// Lien signe d'un document, ouvert sans compte : il doit etre pose avant le
	// groupe authentifie ci-dessous, sinon le middleware du groupe s'applique a
	// tout ce qui commence par « /api » et le client recoit un 401.
	app.Get("/api/public/documents/:kind/:id/:token", s.publicDocument)
	// Identite visuelle : la vitrine, l'ecran de connexion et l'onglet du
	// navigateur ont besoin du logo avant toute authentification.
	app.Get("/api/public/branding", s.publicBranding)
	app.Get("/api/public/branding/:kind", s.brandingAsset)
	// Referencement : fiches produit a leur adresse propre, plan du site et
	// robots.txt. Hors du prefixe « /api », ce sont des pages de la vitrine.
	s.registerSEO(app)
	s.RegisterShop(app)
	a := app.Group("/api", auth.Required)
	a.Get("/me", s.me)
	// Le tableau de bord agrège chiffre d'affaires, créances et valeur du stock :
	// c'est du pilotage, pas du comptoir.
	a.Get("/dashboard", auth.Manager, s.dashboard)
	a.Get("/checkout-settings", s.checkoutSettings)
	a.Put("/checkout-settings", s.updateCheckoutSettings)
	a.Post("/invoice-assets", auth.Manager, s.uploadInvoiceAsset)
	// Les dépenses portent les salaires et le solde de la journée. Le module
	// entier relève du gérant.
	a.Get("/expenses", s.listExpenses)
	a.Get("/expenses/summary", s.expenseSummary)
	a.Get("/expenses/:id", func(c *fiber.Ctx) error { return s.show(c, "expenses") })
	a.Post("/expenses", s.createExpense)
	a.Put("/expenses/:id", s.updateExpense)
	a.Delete("/expenses/:id", auth.Manager, func(c *fiber.Ctx) error { return s.remove(c, "expenses") })
	managerOnly := map[string]bool{"brands": true, "suppliers": true, "products": true, "product-images": true, "variants": true, "arrivals": true, "orders": true, "vaults": true, "home-blocks": true, "settings": true, "delivery-zones": true, "users": true}
	for _, resource := range []string{"categories", "brands", "suppliers", "customers", "products", "product-images", "variants", "arrivals", "sales", "returns", "quotes", "delivery-notes", "orders", "vaults", "cash-sessions", "cash-movements", "messages", "message-templates", "campaigns", "home-blocks", "activity-logs", "settings", "delivery-zones", "contact-messages", "users"} {
		r := resource
		if managerRead[r] {
			a.Get("/"+r, auth.Manager, func(c *fiber.Ctx) error { return s.list(c, r) })
			a.Get("/"+r+"/:id", auth.Manager, func(c *fiber.Ctx) error { return s.show(c, r) })
		} else {
			a.Get("/"+r, func(c *fiber.Ctx) error { return s.list(c, r) })
			a.Get("/"+r+"/:id", func(c *fiber.Ctx) error { return s.show(c, r) })
		}
		if r == "activity-logs" {
			// Le journal est écrit par le serveur. Laisser un client y créer des
			// lignes reviendrait à autoriser la fabrication de traces d'audit.
			a.Delete("/"+r+"/:id", auth.Manager, func(c *fiber.Ctx) error { return s.remove(c, r) })
			continue
		}
		if managerOnly[r] {
			a.Post("/"+r, auth.Manager, func(c *fiber.Ctx) error { return s.create(c, r) })
			a.Put("/"+r+"/:id", auth.Manager, func(c *fiber.Ctx) error { return s.update(c, r) })
		} else {
			a.Post("/"+r, func(c *fiber.Ctx) error { return s.create(c, r) })
			a.Put("/"+r+"/:id", func(c *fiber.Ctx) error { return s.update(c, r) })
		}
		a.Delete("/"+r+"/:id", auth.Manager, func(c *fiber.Ctx) error { return s.remove(c, r) })
	}
	a.Get("/stock/movements", func(c *fiber.Ctx) error { return s.list(c, "stock-movements") })
	a.Get("/stock/movements/:id", func(c *fiber.Ctx) error { return s.show(c, "stock-movements") })
	a.Put("/stock/movements/:id", auth.Manager, func(c *fiber.Ctx) error { return s.update(c, "stock-movements") })
	a.Delete("/stock/movements/:id", auth.Manager, func(c *fiber.Ctx) error { return s.remove(c, "stock-movements") })
	a.Post("/stock/adjust", s.adjustStock)
	a.Post("/stock/inventory", s.inventory)
	a.Post("/sales/checkout", s.checkout)
	a.Post("/sales/:id/payments", s.addSalePayment)
	a.Post("/sales/:id/payments/cancel-all", auth.Manager, s.cancelAllSalePayments)
	a.Post("/sales/:id/payments/:paymentId/cancel", auth.Manager, s.cancelSalePayment)
	a.Put("/sales/:id/items/:itemId", auth.Manager, func(c *fiber.Ctx) error { return s.updateBusinessLine(c, "sales") })
	a.Post("/sales/:id/items", auth.Manager, func(c *fiber.Ctx) error { return s.addBusinessLine(c, "sales") })
	a.Put("/quotes/:id/items/:itemId", auth.Manager, func(c *fiber.Ctx) error { return s.updateBusinessLine(c, "quotes") })
	a.Post("/quotes/:id/items", auth.Manager, func(c *fiber.Ctx) error { return s.addBusinessLine(c, "quotes") })
	a.Put("/delivery-notes/:id/items/:itemId", auth.Manager, func(c *fiber.Ctx) error { return s.updateBusinessLine(c, "delivery-notes") })
	a.Post("/delivery-notes/:id/items", auth.Manager, func(c *fiber.Ctx) error { return s.addBusinessLine(c, "delivery-notes") })
	for _, signable := range []string{"sales", "quotes", "delivery-notes"} {
		r := signable
		a.Post("/"+r+"/:id/signatures/:kind", auth.Manager, func(c *fiber.Ctx) error { return s.uploadDocumentSignature(c, r) })
		a.Delete("/"+r+"/:id/items/:itemId", auth.Manager, func(c *fiber.Ctx) error { return s.removeBusinessLine(c, r) })
	}
	a.Post("/arrivals/:id/receive", auth.Manager, s.receiveArrival)
	a.Post("/returns/process", s.processReturn)
	a.Post("/cash/open", s.openCash)
	a.Post("/cash/:id/close", s.closeCash)
	a.Post("/vaults/:id/deposit", s.depositVault)
	a.Post("/products/:id/images", auth.Manager, s.uploadProductImage)
	a.Get("/duplicates/customers", auth.Manager, s.duplicates)
	a.Get("/labels/:variantId", s.label)
	a.Post("/quotes/:id/convert", auth.Manager, s.convertQuote)
	a.Post("/sales/:id/delivery-note", auth.Manager, s.createDeliveryNote)
	a.Get("/reports", auth.Manager, s.reports)
	// Préfixe volontairement distinct de /api/shop : le groupe de la vitrine y
	// pose auth.Customer sans préfixe, et Fiber applique ce middleware à tout
	// chemin commençant par la chaîne « /api/shop » — « /api/shop-admin » inclus.
	s.registerShopAdmin(a.Group("/boutique", auth.Manager))
	s.registerMessaging(a)
	s.registerVaults(a)
	s.registerBranding(a)
}

func (s *Server) login(c *fiber.Ctx) error {
	var in struct{ Email, Password string }
	if c.BodyParser(&in) != nil {
		return fiber.ErrBadRequest
	}
	var u models.User
	if s.DB.Where("lower(email)=?", strings.ToLower(in.Email)).First(&u).Error != nil || bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(in.Password)) != nil || !u.Active {
		return c.Status(401).JSON(fiber.Map{"error": "Identifiants invalides"})
	}
	token, _ := auth.Sign(u.ID, u.Role)
	return c.JSON(fiber.Map{"token": token, "user": u})
}
func (s *Server) me(c *fiber.Ctx) error {
	var u models.User
	if s.DB.First(&u, c.Locals("userID")).Error != nil {
		return fiber.ErrNotFound
	}
	return c.JSON(u)
}

func modelFor(name string) any {
	switch name {
	case "categories":
		return &models.Category{}
	case "brands":
		return &models.Brand{}
	case "suppliers":
		return &models.Supplier{}
	case "customers":
		return &models.Customer{}
	case "products":
		return &models.Product{}
	case "product-images":
		return &models.ProductImage{}
	case "variants":
		return &models.ProductVariant{}
	case "stock-movements":
		return &models.StockMovement{}
	case "arrivals":
		return &models.Arrival{}
	case "sales":
		return &models.Sale{}
	case "returns":
		return &models.SaleReturn{}
	case "quotes":
		return &models.Quote{}
	case "delivery-notes":
		return &models.DeliveryNote{}
	case "orders":
		return &models.Order{}
	case "vaults":
		return &models.Vault{}
	case "cash-sessions":
		return &models.CashSession{}
	case "cash-movements":
		return &models.CashMovement{}
	case "messages":
		return &models.Message{}
	case "message-templates":
		return &models.MessageTemplate{}
	case "home-blocks":
		return &models.HomeBlock{}
	case "campaigns":
		return &models.Campaign{}
	case "activity-logs":
		return &models.ActivityLog{}
	case "settings":
		return &models.Setting{}
	case "delivery-zones":
		return &models.DeliveryZone{}
	case "contact-messages":
		return &models.ContactMessage{}
	case "expenses":
		return &models.Expense{}
	case "users":
		return &models.User{}
	}
	return nil
}
func sliceFor(name string) any {
	switch name {
	case "categories":
		return &[]models.Category{}
	case "brands":
		return &[]models.Brand{}
	case "suppliers":
		return &[]models.Supplier{}
	case "customers":
		return &[]models.Customer{}
	case "products":
		return &[]models.Product{}
	case "product-images":
		return &[]models.ProductImage{}
	case "variants":
		return &[]models.ProductVariant{}
	case "stock-movements":
		return &[]models.StockMovement{}
	case "arrivals":
		return &[]models.Arrival{}
	case "sales":
		return &[]models.Sale{}
	case "returns":
		return &[]models.SaleReturn{}
	case "quotes":
		return &[]models.Quote{}
	case "delivery-notes":
		return &[]models.DeliveryNote{}
	case "orders":
		return &[]models.Order{}
	case "vaults":
		return &[]models.Vault{}
	case "cash-sessions":
		return &[]models.CashSession{}
	case "cash-movements":
		return &[]models.CashMovement{}
	case "messages":
		return &[]models.Message{}
	case "message-templates":
		return &[]models.MessageTemplate{}
	case "home-blocks":
		return &[]models.HomeBlock{}
	case "campaigns":
		return &[]models.Campaign{}
	case "activity-logs":
		return &[]models.ActivityLog{}
	case "settings":
		return &[]models.Setting{}
	case "delivery-zones":
		return &[]models.DeliveryZone{}
	case "contact-messages":
		return &[]models.ContactMessage{}
	case "expenses":
		return &[]models.Expense{}
	case "users":
		return &[]models.User{}
	}
	return nil
}
func preload(db *gorm.DB, name string) *gorm.DB {
	switch name {
	case "products":
		return db.Preload("Variants").Preload("Images")
	case "variants":
		return db.Preload("Product.Images")
	case "sales":
		return db.Preload("Customer").Preload("User").Preload("Quote").Preload("DeliveryNote").Preload("Payments", func(db *gorm.DB) *gorm.DB { return db.Order("id desc") }).Preload("Items.Variant.Product.Images")
	case "quotes":
		return db.Preload("Customer").Preload("User").Preload("ConvertedSale").Preload("Items.Variant.Product.Images")
	case "delivery-notes":
		return db.Preload("Customer").Preload("User").Preload("Sale.Quote").Preload("Items.Variant.Product.Images")
	case "expenses":
		return db.Preload("Supplier").Preload("User")
	case "arrivals", "returns", "orders", "vaults", "cash-sessions":
		return db.Preload(clause.Associations)
	}
	return db
}
func (s *Server) list(c *fiber.Ctx, name string) error {
	if name == "settings" {
		var rows []models.Setting
		if e := s.DB.Order("id desc").Find(&rows).Error; e != nil {
			return e
		}
		for i := range rows {
			if rows[i].Secret {
				if len(rows[i].Value) > 4 {
					rows[i].Value = "••••" + rows[i].Value[len(rows[i].Value)-4:]
				} else {
					rows[i].Value = "••••"
				}
			}
		}
		return c.JSON(rows)
	}
	out := sliceFor(name)
	if out == nil {
		return fiber.ErrNotFound
	}
	db := preload(s.DB, name).Order("id desc")
	if q := strings.TrimSpace(c.Query("q")); q != "" {
		// La recherche ne portait que sur l'identifiant : taper un nom de
		// client ne renvoyait rien. Elle couvre désormais les colonnes utiles
		// de chaque ressource, sans distinction de casse.
		db = applySearch(db, name, q)
	}
	limit, _ := strconv.Atoi(c.Query("limit", "100"))
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	offset, _ := strconv.Atoi(c.Query("offset", "0"))
	if offset < 0 {
		offset = 0
	}
	// Le total permet à l'écran de savoir qu'il reste des pages : sans lui,
	// tout ce qui dépassait la 500e ligne devenait inatteignable.
	var total int64
	countQuery := s.DB.Model(modelFor(name))
	if q := strings.TrimSpace(c.Query("q")); q != "" {
		countQuery = applySearch(countQuery, name, q)
	}
	if e := countQuery.Count(&total).Error; e != nil {
		return dbError(e, "comptage "+name)
	}
	if e := db.Limit(limit).Offset(offset).Find(out).Error; e != nil {
		return dbError(e, "lecture "+name)
	}
	c.Set("X-Total-Count", strconv.FormatInt(total, 10))
	return s.respond(c, out)
}
func (s *Server) show(c *fiber.Ctx, name string) error {
	if name == "settings" {
		return fiber.ErrForbidden
	}
	out := modelFor(name)
	if out == nil {
		return fiber.ErrNotFound
	}
	if e := preload(s.DB, name).First(out, c.Params("id")).Error; e != nil {
		return fiber.ErrNotFound
	}
	return s.respond(c, out)
}
func (s *Server) create(c *fiber.Ctx, name string) error {
	out := modelFor(name)
	if out == nil {
		return fiber.ErrNotFound
	}
	if e := c.BodyParser(out); e != nil {
		return fiber.ErrBadRequest
	}
	if u, ok := out.(*models.User); ok {
		var credentials struct {
			Password string `json:"password"`
		}
		_ = c.BodyParser(&credentials)
		if len(credentials.Password) < 8 {
			return fiber.NewError(422, "Le mot de passe doit contenir au moins 8 caractères")
		}
		hash, _ := bcrypt.GenerateFromPassword([]byte(credentials.Password), bcrypt.DefaultCost)
		u.PasswordHash = string(hash)
	}
	if e := s.DB.Create(out).Error; e != nil {
		return dbError(e, "création "+name)
	}
	return c.Status(201).JSON(out)
}
func (s *Server) update(c *fiber.Ctx, name string) error {
	out := modelFor(name)
	if out == nil {
		return fiber.ErrNotFound
	}
	if s.DB.First(out, c.Params("id")).Error != nil {
		return fiber.ErrNotFound
	}
	previousPaid := int64(0)
	if sale, ok := out.(*models.Sale); ok {
		previousPaid = sale.Paid
	}
	if e := c.BodyParser(out); e != nil {
		return fiber.ErrBadRequest
	}
	if sale, ok := out.(*models.Sale); ok {
		sale.Paid = previousPaid
		sale.Status = paymentStatus(sale.Paid, sale.Total, sale.Status)
	}
	if u, ok := out.(*models.User); ok {
		var credentials struct {
			Password string `json:"password"`
		}
		_ = c.BodyParser(&credentials)
		if credentials.Password != "" {
			if len(credentials.Password) < 8 {
				return fiber.NewError(422, "Le mot de passe doit contenir au moins 8 caractères")
			}
			hash, _ := bcrypt.GenerateFromPassword([]byte(credentials.Password), bcrypt.DefaultCost)
			u.PasswordHash = string(hash)
		}
	}
	if e := s.DB.Save(out).Error; e != nil {
		return dbError(e, "modification "+name)
	}
	return c.JSON(out)
}

// remove applique les règles de suppression de integrity.go.
//
// Le bouton corbeille échouait auparavant sur une violation de clé étrangère
// dès que la fiche avait des enfants — une erreur SQL en anglais s'affichait
// à la place d'une explication. Les lignes sans existence propre sont
// désormais supprimées avec leur parent, et ce qui porte de l'histoire
// comptable est refusé avec un motif compréhensible.
func (s *Server) remove(c *fiber.Ctx, name string) error {
	if modelFor(name) == nil {
		return fiber.ErrNotFound
	}
	userID, _ := c.Locals("userID").(uint)
	if e := s.deleteWithChildren(name, c.Params("id"), userID); e != nil {
		return e
	}
	removed, _ := strconv.ParseUint(c.Params("id"), 10, 64)
	s.log(c, "delete", name, uint(removed), name+" #"+c.Params("id"))
	return c.SendStatus(204)
}

func (s *Server) adjust(tx *gorm.DB, variantID uint, qty int64, userID uint, reason, reference string) error {
	var v models.ProductVariant
	if e := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&v, variantID).Error; e != nil {
		return e
	}
	before := v.Stock
	after := before + qty
	if after < 0 {
		return fmt.Errorf("stock insuffisant pour %s", v.SKU)
	}
	if e := tx.Model(&v).Update("stock", after).Error; e != nil {
		return e
	}
	return tx.Create(&models.StockMovement{VariantID: v.ID, UserID: userID, Type: map[bool]string{true: "in", false: "out"}[qty > 0], Reason: reason, Quantity: qty, StockBefore: before, StockAfter: after, Reference: reference}).Error
}
func (s *Server) adjustStock(c *fiber.Ctx) error {
	var in struct {
		VariantID uint   `json:"variantId"`
		Quantity  int64  `json:"quantity"`
		Reason    string `json:"reason"`
		Note      string `json:"note"`
	}
	if c.BodyParser(&in) != nil || in.Quantity == 0 {
		return fiber.ErrBadRequest
	}
	e := s.DB.Transaction(func(tx *gorm.DB) error {
		if _, e := lockVariants(tx, []uint{in.VariantID}); e != nil {
			return e
		}
		return s.adjust(tx, in.VariantID, in.Quantity, c.Locals("userID").(uint), in.Reason, s.ref("STK"))
	})
	if e != nil {
		return fiber.NewError(422, e.Error())
	}
	s.log(c, "stock-adjust", "variants", in.VariantID, fmt.Sprintf("%+d — %s", in.Quantity, in.Reason))
	return c.SendStatus(201)
}

type lineInput struct {
	VariantID uint  `json:"variantId"`
	Quantity  int64 `json:"quantity"`
	UnitPrice int64 `json:"unitPrice"`
	Discount  int64 `json:"discount"`
}

type paymentMethodSetting struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Active bool   `json:"active"`
}
type checkoutSettingsPayload struct {
	TaxRate             float64                `json:"taxRate"`
	TaxEnabledByDefault bool                   `json:"taxEnabledByDefault"`
	PaymentMethods      []paymentMethodSetting `json:"paymentMethods"`
	InvoiceDefaults     invoiceDefaults        `json:"invoiceDefaults"`
}

type invoiceDefaults struct {
	CompanyName      string `json:"companyName"`
	Tagline          string `json:"tagline"`
	Phone            string `json:"phone"`
	Address          string `json:"address"`
	ThankYouTitle    string `json:"thankYouTitle"`
	FooterNote       string `json:"footerNote"`
	CompanySignature string `json:"companySignatureUrl"`
}

func defaultCheckoutSettings() checkoutSettingsPayload {
	return checkoutSettingsPayload{TaxRate: 18, TaxEnabledByDefault: false, PaymentMethods: []paymentMethodSetting{{"cash", "Espèces", true}, {"wave", "Wave", true}, {"orange_money", "Orange Money", true}, {"card", "Carte bancaire", true}, {"credit", "Crédit", true}, {"bank_transfer", "Virement", false}}, InvoiceDefaults: invoiceDefaults{CompanyName: "SenValise", Tagline: "Solutions de voyage", Phone: "+221 77 888 53 74", Address: "Dakar, Sénégal", ThankYouTitle: "Merci pour votre confiance", FooterNote: "Conservez ce document pour vos besoins de garantie ou de comptabilité."}}
}
func (s *Server) readCheckoutSettings() checkoutSettingsPayload {
	settings := defaultCheckoutSettings()
	var row models.Setting
	if s.DB.Where("key = ?", "checkout_config").First(&row).Error == nil {
		_ = json.Unmarshal([]byte(row.Value), &settings)
	}
	return settings
}
func (s *Server) checkoutSettings(c *fiber.Ctx) error { return c.JSON(s.readCheckoutSettings()) }
func (s *Server) updateCheckoutSettings(c *fiber.Ctx) error {
	var in checkoutSettingsPayload
	if c.BodyParser(&in) != nil || in.TaxRate < 0 || in.TaxRate > 100 {
		return fiber.NewError(422, "Configuration de caisse invalide")
	}
	active := 0
	seen := map[string]bool{}
	for i := range in.PaymentMethods {
		in.PaymentMethods[i].ID = strings.TrimSpace(in.PaymentMethods[i].ID)
		in.PaymentMethods[i].Label = strings.TrimSpace(in.PaymentMethods[i].Label)
		if in.PaymentMethods[i].ID == "" || in.PaymentMethods[i].Label == "" || seen[in.PaymentMethods[i].ID] {
			return fiber.NewError(422, "Chaque moyen de paiement doit avoir un identifiant et un nom uniques")
		}
		seen[in.PaymentMethods[i].ID] = true
		if in.PaymentMethods[i].Active {
			active++
		}
	}
	if active == 0 {
		return fiber.NewError(422, "Activez au moins un moyen de paiement")
	}
	in.InvoiceDefaults.CompanyName = strings.TrimSpace(in.InvoiceDefaults.CompanyName)
	in.InvoiceDefaults.Tagline = strings.TrimSpace(in.InvoiceDefaults.Tagline)
	in.InvoiceDefaults.Phone = strings.TrimSpace(in.InvoiceDefaults.Phone)
	in.InvoiceDefaults.Address = strings.TrimSpace(in.InvoiceDefaults.Address)
	in.InvoiceDefaults.ThankYouTitle = strings.TrimSpace(in.InvoiceDefaults.ThankYouTitle)
	in.InvoiceDefaults.FooterNote = strings.TrimSpace(in.InvoiceDefaults.FooterNote)
	if in.InvoiceDefaults.CompanyName == "" || in.InvoiceDefaults.FooterNote == "" {
		return fiber.NewError(422, "Le nom de l’entreprise et le texte de pied de facture sont requis")
	}
	value, _ := json.Marshal(in)
	var row models.Setting
	if s.DB.Where("key = ?", "checkout_config").First(&row).Error == gorm.ErrRecordNotFound {
		row = models.Setting{Key: "checkout_config", Value: string(value)}
		if e := s.DB.Create(&row).Error; e != nil {
			return fiber.NewError(422, e.Error())
		}
	} else {
		if e := s.DB.Model(&row).Update("value", string(value)).Error; e != nil {
			return fiber.NewError(422, e.Error())
		}
	}
	return c.JSON(in)
}

func (s *Server) checkout(c *fiber.Ctx) error {
	var in struct {
		CustomerID    *uint       `json:"customerId"`
		PaymentMethod string      `json:"paymentMethod"`
		Paid          int64       `json:"paid"`
		Discount      int64       `json:"discount"`
		ApplyTax      bool        `json:"applyTax"`
		TaxRate       float64     `json:"taxRate"`
		Items         []lineInput `json:"items"`
	}
	if c.BodyParser(&in) != nil || len(in.Items) == 0 {
		return fiber.ErrBadRequest
	}
	config := s.readCheckoutSettings()
	allowed := false
	for _, method := range config.PaymentMethods {
		if method.Active && method.ID == in.PaymentMethod {
			allowed = true
			break
		}
	}
	if !allowed {
		return fiber.NewError(422, "Moyen de paiement non autorisé")
	}
	if in.Discount < 0 {
		return fiber.NewError(422, "La remise globale ne peut pas être négative")
	}
	taxRate := in.TaxRate
	if taxRate == 0 {
		taxRate = config.TaxRate
	}
	if taxRate < 0 || taxRate > 100 {
		return fiber.NewError(422, "Taux de TVA invalide")
	}
	defaults := config.InvoiceDefaults
	sale := models.Sale{Reference: s.ref("VTE"), CustomerID: in.CustomerID, UserID: c.Locals("userID").(uint), Channel: "pos", PaymentMethod: in.PaymentMethod, InvoiceCompanyName: defaults.CompanyName, InvoiceTagline: defaults.Tagline, InvoicePhone: defaults.Phone, InvoiceAddress: defaults.Address, InvoiceThankYouTitle: defaults.ThankYouTitle, InvoiceFooterNote: defaults.FooterNote, CompanySignatureURL: defaults.CompanySignature}
	e := s.DB.Transaction(func(tx *gorm.DB) error {
		// Le stock se verrouille avant toute écriture, et par identifiant
		// croissant. Insérer la ligne de vente d'abord posait un verrou
		// partagé sur la déclinaison via la clé étrangère, que le verrou
		// exclusif demandé ensuite devait faire monter en grade : deux caisses
		// simultanées s'interbloquaient et PostgreSQL en tuait une.
		ids := make([]uint, 0, len(in.Items))
		for _, l := range in.Items {
			ids = append(ids, l.VariantID)
		}
		locked, e := lockVariants(tx, ids)
		if e != nil {
			return e
		}
		if e := tx.Create(&sale).Error; e != nil {
			return e
		}
		var subtotal, lineDiscounts int64
		for _, l := range in.Items {
			if l.Quantity <= 0 || l.Discount < 0 {
				return fmt.Errorf("quantité ou remise invalide")
			}
			v := locked[l.VariantID]
			price := l.UnitPrice
			if price == 0 {
				price = v.Price
			}
			if price < 0 {
				return fmt.Errorf("prix invalide pour %s", v.SKU)
			}
			gross := price * l.Quantity
			if l.Discount > gross {
				return fmt.Errorf("la remise dépasse le montant de %s", v.SKU)
			}
			line := gross - l.Discount
			subtotal += gross
			lineDiscounts += l.Discount
			if e := tx.Create(&models.SaleItem{SaleID: sale.ID, VariantID: v.ID, Quantity: l.Quantity, UnitPrice: price, UnitCost: v.Cost, Discount: l.Discount, Total: line}).Error; e != nil {
				return e
			}
			if e := s.adjust(tx, v.ID, -l.Quantity, sale.UserID, "sale", sale.Reference); e != nil {
				return e
			}
		}
		net := subtotal - lineDiscounts
		if in.Discount > net {
			return fmt.Errorf("la remise globale dépasse le sous-total")
		}
		net -= in.Discount
		tax := int64(0)
		if in.ApplyTax {
			tax = int64(math.Round(float64(net) * taxRate / 100))
			sale.TaxRate = taxRate
		}
		total := net + tax
		sale.Subtotal = subtotal
		sale.Discount = lineDiscounts + in.Discount
		sale.Tax = tax
		sale.Total = total
		applied := in.Paid
		if applied > total {
			applied = total
		}
		if applied < 0 {
			return fmt.Errorf("le montant payé ne peut pas être négatif")
		}
		sale.Paid = applied
		sale.Status = paymentStatus(applied, total, sale.Status)
		if e := tx.Save(&sale).Error; e != nil {
			return e
		}
		if applied > 0 {
			if e := tx.Create(&models.SalePayment{SaleID: sale.ID, UserID: sale.UserID, Method: in.PaymentMethod, Amount: applied, Status: "active", Reference: s.ref("REG")}).Error; e != nil {
				return e
			}
			return s.trackCash(tx, sale.UserID, in.PaymentMethod, applied)
		}
		return nil
	})
	if e != nil {
		return fiber.NewError(422, e.Error())
	}
	s.log(c, "sale", "sales", sale.ID, fmt.Sprintf("%s — %d F, %s", sale.Reference, sale.Total, sale.PaymentMethod))
	preload(s.DB, "sales").First(&sale, sale.ID)
	return c.Status(201).JSON(sale)
}

func lockForUpdate() clause.Locking { return clause.Locking{Strength: "UPDATE"} }

func paymentStatus(paid, total int64, current string) string {
	if current == "cancelled" {
		return current
	}
	if total > 0 && paid >= total {
		return "paid"
	}
	if paid > 0 {
		return "partial"
	}
	return "pending"
}

func syncSalePayments(tx *gorm.DB, sale *models.Sale) error {
	var paid int64
	if e := tx.Model(&models.SalePayment{}).Where("sale_id = ? AND status = ?", sale.ID, "active").Select("COALESCE(SUM(amount),0)").Scan(&paid).Error; e != nil {
		return e
	}
	sale.Paid = paid
	sale.Status = paymentStatus(paid, sale.Total, sale.Status)
	return tx.Model(sale).Updates(map[string]any{"paid": sale.Paid, "status": sale.Status}).Error
}

func (s *Server) addSalePayment(c *fiber.Ctx) error {
	var in struct {
		Method string `json:"method"`
		Amount int64  `json:"amount"`
	}
	if c.BodyParser(&in) != nil || in.Amount <= 0 || in.Method == "" {
		return fiber.NewError(422, "Règlement invalide")
	}
	var sale models.Sale
	if s.DB.First(&sale, c.Params("id")).Error != nil {
		return fiber.ErrNotFound
	}
	if sale.Status == "cancelled" {
		return fiber.NewError(409, "Une facture annulée ne peut pas être réglée")
	}
	remaining := sale.Total - sale.Paid
	if in.Amount > remaining {
		return fiber.NewError(422, fmt.Sprintf("Le règlement dépasse le reste à payer de %d F", remaining))
	}
	payment := models.SalePayment{SaleID: sale.ID, UserID: c.Locals("userID").(uint), Method: in.Method, Amount: in.Amount, Status: "active", Reference: s.ref("REG")}
	if e := s.DB.Transaction(func(tx *gorm.DB) error {
		if e := tx.Create(&payment).Error; e != nil {
			return e
		}
		if e := syncSalePayments(tx, &sale); e != nil {
			return e
		}
		return s.trackCash(tx, payment.UserID, payment.Method, payment.Amount)
	}); e != nil {
		return fiber.NewError(422, e.Error())
	}
	s.log(c, "payment", "sales", sale.ID, fmt.Sprintf("règlement de %d F (%s)", payment.Amount, payment.Method))
	return c.Status(201).JSON(payment)
}

func (s *Server) cancelSalePayment(c *fiber.Ctx) error {
	var in struct {
		Reason string `json:"reason"`
	}
	_ = c.BodyParser(&in)
	var sale models.Sale
	if s.DB.First(&sale, c.Params("id")).Error != nil {
		return fiber.ErrNotFound
	}
	var payment models.SalePayment
	if s.DB.Where("id = ? AND sale_id = ?", c.Params("paymentId"), sale.ID).First(&payment).Error != nil {
		return fiber.ErrNotFound
	}
	if payment.Status == "cancelled" {
		return fiber.NewError(409, "Ce règlement est déjà annulé")
	}
	now := time.Now()
	if e := s.DB.Transaction(func(tx *gorm.DB) error {
		if e := tx.Model(&payment).Updates(map[string]any{"status": "cancelled", "cancel_reason": in.Reason, "cancelled_at": &now}).Error; e != nil {
			return e
		}
		if e := syncSalePayments(tx, &sale); e != nil {
			return e
		}
		// L'argent ressort du tiroir : la caisse doit le savoir.
		return s.trackCash(tx, payment.UserID, payment.Method, -payment.Amount)
	}); e != nil {
		return fiber.NewError(422, e.Error())
	}
	s.log(c, "payment-cancel", "sales", sale.ID, fmt.Sprintf("annulation du règlement %s (%d F)", payment.Reference, payment.Amount))
	return c.JSON(payment)
}

func (s *Server) cancelAllSalePayments(c *fiber.Ctx) error {
	var in struct {
		Reason string `json:"reason"`
	}
	_ = c.BodyParser(&in)
	var sale models.Sale
	if s.DB.First(&sale, c.Params("id")).Error != nil {
		return fiber.ErrNotFound
	}
	now := time.Now()
	if e := s.DB.Transaction(func(tx *gorm.DB) error {
		var active []models.SalePayment
		if e := tx.Where("sale_id = ? AND status = ?", sale.ID, "active").Find(&active).Error; e != nil {
			return e
		}
		if e := tx.Model(&models.SalePayment{}).Where("sale_id = ? AND status = ?", sale.ID, "active").Updates(map[string]any{"status": "cancelled", "cancel_reason": in.Reason, "cancelled_at": &now}).Error; e != nil {
			return e
		}
		if e := syncSalePayments(tx, &sale); e != nil {
			return e
		}
		for _, payment := range active {
			if e := s.trackCash(tx, payment.UserID, payment.Method, -payment.Amount); e != nil {
				return e
			}
		}
		return nil
	}); e != nil {
		return fiber.NewError(422, e.Error())
	}
	s.log(c, "payment-cancel-all", "sales", sale.ID, "annulation de tous les règlements de "+sale.Reference)
	return c.SendStatus(204)
}

func (s *Server) updateBusinessLine(c *fiber.Ctx, kind string) error {
	var in struct {
		Quantity  int64 `json:"quantity"`
		UnitPrice int64 `json:"unitPrice"`
		Discount  int64 `json:"discount"`
	}
	if c.BodyParser(&in) != nil || in.Quantity <= 0 {
		return fiber.NewError(422, "Ligne invalide")
	}
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		switch kind {
		case "sales":
			var sale models.Sale
			if e := tx.First(&sale, c.Params("id")).Error; e != nil {
				return e
			}
			var item models.SaleItem
			if e := tx.Where("id = ? AND sale_id = ?", c.Params("itemId"), sale.ID).First(&item).Error; e != nil {
				return e
			}
			if in.UnitPrice < 0 || in.Discount < 0 || in.Discount > in.UnitPrice*in.Quantity {
				return fmt.Errorf("prix ou remise invalide")
			}
			oldQty, oldDiscount := item.Quantity, item.Discount
			item.Quantity = in.Quantity
			item.UnitPrice = in.UnitPrice
			item.Discount = in.Discount
			item.Total = in.UnitPrice*in.Quantity - in.Discount
			if e := tx.Save(&item).Error; e != nil {
				return e
			}
			if delta := in.Quantity - oldQty; delta != 0 {
				if e := s.adjust(tx, item.VariantID, -delta, c.Locals("userID").(uint), "sale_edit", sale.Reference); e != nil {
					return e
				}
			}
			var rows []models.SaleItem
			if e := tx.Where("sale_id = ?", sale.ID).Find(&rows).Error; e != nil {
				return e
			}
			var subtotal, lineDiscount int64
			for _, row := range rows {
				subtotal += row.UnitPrice * row.Quantity
				lineDiscount += row.Discount
			}
			oldLineDiscount := lineDiscount - in.Discount + oldDiscount
			globalDiscount := sale.Discount - oldLineDiscount
			if globalDiscount < 0 {
				globalDiscount = 0
			}
			sale.Subtotal = subtotal
			sale.Discount = lineDiscount + globalDiscount
			net := subtotal - sale.Discount
			sale.Tax = int64(math.Round(float64(net) * sale.TaxRate / 100))
			sale.Total = net + sale.Tax
			sale.Status = paymentStatus(sale.Paid, sale.Total, sale.Status)
			return tx.Save(&sale).Error
		case "quotes":
			var quote models.Quote
			if e := tx.First(&quote, c.Params("id")).Error; e != nil {
				return e
			}
			var item models.QuoteItem
			if e := tx.Where("id = ? AND quote_id = ?", c.Params("itemId"), quote.ID).First(&item).Error; e != nil {
				return e
			}
			if in.UnitPrice < 0 || in.Discount < 0 || in.Discount > in.UnitPrice*in.Quantity {
				return fmt.Errorf("prix ou remise invalide")
			}
			item.Quantity = in.Quantity
			item.UnitPrice = in.UnitPrice
			item.Discount = in.Discount
			item.Total = in.UnitPrice*in.Quantity - in.Discount
			if e := tx.Save(&item).Error; e != nil {
				return e
			}
			var rows []models.QuoteItem
			tx.Where("quote_id = ?", quote.ID).Find(&rows)
			var subtotal, discount int64
			for _, row := range rows {
				subtotal += row.UnitPrice * row.Quantity
				discount += row.Discount
			}
			quote.Subtotal = subtotal
			quote.Discount = discount
			net := subtotal - discount
			quote.Tax = int64(math.Round(float64(net) * quote.TaxRate / 100))
			quote.Total = net + quote.Tax
			return tx.Save(&quote).Error
		default:
			var note models.DeliveryNote
			if e := tx.First(&note, c.Params("id")).Error; e != nil {
				return e
			}
			var item models.DeliveryNoteItem
			if e := tx.Where("id = ? AND delivery_note_id = ?", c.Params("itemId"), note.ID).First(&item).Error; e != nil {
				return e
			}
			item.Quantity = in.Quantity
			return tx.Save(&item).Error
		}
	})
	if err != nil {
		return fiber.NewError(422, err.Error())
	}
	return c.SendStatus(204)
}

// Supprimer une ligne. La facture rend le stock que la vente avait retiré ;
// le devis et le bon de livraison n'en ayant jamais pris, ils n'en rendent pas.
func (s *Server) removeBusinessLine(c *fiber.Ctx, kind string) error {
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		switch kind {
		case "sales":
			var sale models.Sale
			if e := tx.First(&sale, c.Params("id")).Error; e != nil {
				return e
			}
			if sale.Status == "cancelled" {
				return fmt.Errorf("une facture annulée ne peut pas être modifiée")
			}
			var item models.SaleItem
			if e := tx.Where("id = ? AND sale_id = ?", c.Params("itemId"), sale.ID).First(&item).Error; e != nil {
				return e
			}
			var count int64
			tx.Model(&models.SaleItem{}).Where("sale_id = ?", sale.ID).Count(&count)
			if count <= 1 {
				return fmt.Errorf("une facture doit garder au moins une ligne : supprimez la facture entière")
			}
			// La remise globale est ce qui dépasse la somme des remises de ligne.
			var lineDiscountBefore int64
			tx.Model(&models.SaleItem{}).Where("sale_id = ?", sale.ID).Select("COALESCE(SUM(discount),0)").Scan(&lineDiscountBefore)
			globalDiscount := sale.Discount - lineDiscountBefore
			if globalDiscount < 0 {
				globalDiscount = 0
			}
			if e := tx.Delete(&item).Error; e != nil {
				return e
			}
			if e := s.adjust(tx, item.VariantID, item.Quantity, c.Locals("userID").(uint), "sale_edit", sale.Reference); e != nil {
				return e
			}
			var rows []models.SaleItem
			if e := tx.Where("sale_id = ?", sale.ID).Find(&rows).Error; e != nil {
				return e
			}
			var subtotal, lineDiscount int64
			for _, row := range rows {
				subtotal += row.UnitPrice * row.Quantity
				lineDiscount += row.Discount
			}
			sale.Subtotal = subtotal
			sale.Discount = lineDiscount + globalDiscount
			net := subtotal - sale.Discount
			if net < 0 {
				return fmt.Errorf("la remise globale dépasse le nouveau sous-total")
			}
			sale.Tax = int64(math.Round(float64(net) * sale.TaxRate / 100))
			sale.Total = net + sale.Tax
			if sale.Total < sale.Paid {
				return fmt.Errorf("le total passerait sous les %d F déjà réglés : annulez d'abord les règlements", sale.Paid)
			}
			sale.Status = paymentStatus(sale.Paid, sale.Total, sale.Status)
			return tx.Save(&sale).Error
		case "quotes":
			var quote models.Quote
			if e := tx.First(&quote, c.Params("id")).Error; e != nil {
				return e
			}
			if quote.Status == "cancelled" {
				return fmt.Errorf("un devis annulé ne peut pas être modifié")
			}
			if quote.ConvertedSaleID != nil {
				return fmt.Errorf("ce devis est déjà converti en facture : modifiez la facture")
			}
			var item models.QuoteItem
			if e := tx.Where("id = ? AND quote_id = ?", c.Params("itemId"), quote.ID).First(&item).Error; e != nil {
				return e
			}
			var count int64
			tx.Model(&models.QuoteItem{}).Where("quote_id = ?", quote.ID).Count(&count)
			if count <= 1 {
				return fmt.Errorf("un devis doit garder au moins une ligne : supprimez le devis entier")
			}
			if e := tx.Delete(&item).Error; e != nil {
				return e
			}
			var rows []models.QuoteItem
			if e := tx.Where("quote_id = ?", quote.ID).Find(&rows).Error; e != nil {
				return e
			}
			var subtotal, discount int64
			for _, row := range rows {
				subtotal += row.UnitPrice * row.Quantity
				discount += row.Discount
			}
			quote.Subtotal = subtotal
			quote.Discount = discount
			net := subtotal - discount
			quote.Tax = int64(math.Round(float64(net) * quote.TaxRate / 100))
			quote.Total = net + quote.Tax
			return tx.Save(&quote).Error
		case "delivery-notes":
			var note models.DeliveryNote
			if e := tx.First(&note, c.Params("id")).Error; e != nil {
				return e
			}
			if note.Status == "cancelled" {
				return fmt.Errorf("un bon de livraison annulé ne peut pas être modifié")
			}
			if note.Status == "delivered" {
				return fmt.Errorf("un bon déjà livré ne peut plus être modifié")
			}
			var item models.DeliveryNoteItem
			if e := tx.Where("id = ? AND delivery_note_id = ?", c.Params("itemId"), note.ID).First(&item).Error; e != nil {
				return e
			}
			var count int64
			tx.Model(&models.DeliveryNoteItem{}).Where("delivery_note_id = ?", note.ID).Count(&count)
			if count <= 1 {
				return fmt.Errorf("un bon de livraison doit garder au moins une ligne : supprimez le bon entier")
			}
			return tx.Delete(&item).Error
		default:
			return fmt.Errorf("pièce inconnue")
		}
	})
	if err != nil {
		return fiber.NewError(422, err.Error())
	}
	return c.SendStatus(204)
}

// Un devis n'engage rien et un bon de livraison solde une vente qui a déjà
// décrémenté le stock : seule la facture déclenche un mouvement de stock.
func (s *Server) addQuoteLine(c *fiber.Ctx, in lineInput) error {
	var created models.QuoteItem
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		var quote models.Quote
		if e := tx.First(&quote, c.Params("id")).Error; e != nil {
			return e
		}
		if quote.Status == "cancelled" {
			return fmt.Errorf("un devis annulé ne peut pas être modifié")
		}
		if quote.ConvertedSaleID != nil {
			return fmt.Errorf("ce devis est déjà converti en facture : modifiez la facture")
		}
		var duplicate int64
		tx.Model(&models.QuoteItem{}).Where("quote_id = ? AND variant_id = ?", quote.ID, in.VariantID).Count(&duplicate)
		if duplicate > 0 {
			return fmt.Errorf("ce produit est déjà présent : modifiez sa ligne existante")
		}
		// Verrou exclusif avant d'écrire la ligne, pour la même raison qu'à
		// l'encaissement : la clé étrangère poserait sinon un verrou partagé
		// qu'il faudrait promouvoir ensuite.
		if _, e := lockVariants(tx, []uint{in.VariantID}); e != nil {
			return fmt.Errorf("produit introuvable")
		}
		var variant models.ProductVariant
		if e := tx.Preload("Product").First(&variant, in.VariantID).Error; e != nil {
			return fmt.Errorf("produit introuvable")
		}
		price := in.UnitPrice
		if price == 0 {
			price = variant.Price
		}
		gross := price * in.Quantity
		if price < 0 || in.Discount > gross {
			return fmt.Errorf("prix ou remise invalide")
		}
		created = models.QuoteItem{QuoteID: quote.ID, VariantID: variant.ID, Description: variant.Product.Name, Quantity: in.Quantity, UnitPrice: price, Discount: in.Discount, Total: gross - in.Discount}
		if e := tx.Create(&created).Error; e != nil {
			return e
		}
		var rows []models.QuoteItem
		if e := tx.Where("quote_id = ?", quote.ID).Find(&rows).Error; e != nil {
			return e
		}
		var subtotal, discount int64
		for _, row := range rows {
			subtotal += row.UnitPrice * row.Quantity
			discount += row.Discount
		}
		quote.Subtotal = subtotal
		quote.Discount = discount
		net := subtotal - discount
		quote.Tax = int64(math.Round(float64(net) * quote.TaxRate / 100))
		quote.Total = net + quote.Tax
		return tx.Save(&quote).Error
	})
	if err != nil {
		return fiber.NewError(422, err.Error())
	}
	return c.Status(201).JSON(created)
}

func (s *Server) addDeliveryNoteLine(c *fiber.Ctx, in lineInput) error {
	var created models.DeliveryNoteItem
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		var note models.DeliveryNote
		if e := tx.First(&note, c.Params("id")).Error; e != nil {
			return e
		}
		if note.Status == "cancelled" {
			return fmt.Errorf("un bon de livraison annulé ne peut pas être modifié")
		}
		if note.Status == "delivered" {
			return fmt.Errorf("un bon déjà livré ne peut plus être modifié")
		}
		var duplicate int64
		tx.Model(&models.DeliveryNoteItem{}).Where("delivery_note_id = ? AND variant_id = ?", note.ID, in.VariantID).Count(&duplicate)
		if duplicate > 0 {
			return fmt.Errorf("ce produit est déjà présent : modifiez sa ligne existante")
		}
		var variant models.ProductVariant
		if e := tx.Preload("Product").First(&variant, in.VariantID).Error; e != nil {
			return fmt.Errorf("produit introuvable")
		}
		created = models.DeliveryNoteItem{DeliveryNoteID: note.ID, VariantID: variant.ID, Description: variant.Product.Name, Quantity: in.Quantity}
		return tx.Create(&created).Error
	})
	if err != nil {
		return fiber.NewError(422, err.Error())
	}
	return c.Status(201).JSON(created)
}

func (s *Server) addBusinessLine(c *fiber.Ctx, kind string) error {
	var in lineInput
	if c.BodyParser(&in) != nil || in.VariantID == 0 || in.Quantity <= 0 || in.Discount < 0 {
		return fiber.NewError(422, "Produit, quantité ou remise invalide")
	}
	switch kind {
	case "quotes":
		return s.addQuoteLine(c, in)
	case "delivery-notes":
		return s.addDeliveryNoteLine(c, in)
	case "sales":
	default:
		return fiber.ErrNotFound
	}
	var created models.SaleItem
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		var sale models.Sale
		if e := tx.First(&sale, c.Params("id")).Error; e != nil {
			return e
		}
		if sale.Status == "cancelled" {
			return fmt.Errorf("une facture annulée ne peut pas être modifiée")
		}
		var duplicate int64
		tx.Model(&models.SaleItem{}).Where("sale_id = ? AND variant_id = ?", sale.ID, in.VariantID).Count(&duplicate)
		if duplicate > 0 {
			return fmt.Errorf("ce produit est déjà présent : modifiez sa ligne existante")
		}
		// Verrou exclusif avant d'écrire la ligne, pour la même raison qu'à
		// l'encaissement : la clé étrangère poserait sinon un verrou partagé
		// qu'il faudrait promouvoir ensuite.
		if _, e := lockVariants(tx, []uint{in.VariantID}); e != nil {
			return fmt.Errorf("produit introuvable")
		}
		var variant models.ProductVariant
		if e := tx.Preload("Product").First(&variant, in.VariantID).Error; e != nil {
			return fmt.Errorf("produit introuvable")
		}
		price := in.UnitPrice
		if price == 0 {
			price = variant.Price
		}
		gross := price * in.Quantity
		if price < 0 || in.Discount > gross {
			return fmt.Errorf("prix ou remise invalide")
		}
		var existingLineDiscount int64
		tx.Model(&models.SaleItem{}).Where("sale_id = ?", sale.ID).Select("COALESCE(SUM(discount),0)").Scan(&existingLineDiscount)
		globalDiscount := sale.Discount - existingLineDiscount
		if globalDiscount < 0 {
			globalDiscount = 0
		}
		created = models.SaleItem{SaleID: sale.ID, VariantID: variant.ID, Quantity: in.Quantity, UnitPrice: price, UnitCost: variant.Cost, Discount: in.Discount, Total: gross - in.Discount}
		if e := tx.Create(&created).Error; e != nil {
			return e
		}
		if e := s.adjust(tx, variant.ID, -in.Quantity, c.Locals("userID").(uint), "sale_edit", sale.Reference); e != nil {
			return e
		}
		var rows []models.SaleItem
		if e := tx.Where("sale_id = ?", sale.ID).Find(&rows).Error; e != nil {
			return e
		}
		var subtotal, lineDiscount int64
		for _, row := range rows {
			subtotal += row.UnitPrice * row.Quantity
			lineDiscount += row.Discount
		}
		sale.Subtotal = subtotal
		sale.Discount = lineDiscount + globalDiscount
		net := subtotal - sale.Discount
		if net < 0 {
			return fmt.Errorf("la remise globale dépasse le nouveau sous-total")
		}
		sale.Tax = int64(math.Round(float64(net) * sale.TaxRate / 100))
		sale.Total = net + sale.Tax
		sale.Status = paymentStatus(sale.Paid, sale.Total, sale.Status)
		return tx.Save(&sale).Error
	})
	if err != nil {
		return fiber.NewError(422, err.Error())
	}
	return c.Status(201).JSON(created)
}
func (s *Server) receiveArrival(c *fiber.Ctx) error {
	id := c.Params("id")
	var a models.Arrival
	if s.DB.Preload("Items").First(&a, id).Error != nil {
		return fiber.ErrNotFound
	}
	if a.Status == "received" {
		return fiber.NewError(409, "Arrivage déjà réceptionné")
	}
	if len(a.Items) == 0 {
		return fiber.NewError(422, "Cet arrivage ne contient aucune ligne : rien à réceptionner.")
	}
	landed := landedCosts(a)
	e := s.DB.Transaction(func(tx *gorm.DB) error {
		ids := make([]uint, 0, len(a.Items))
		for _, i := range a.Items {
			ids = append(ids, i.VariantID)
		}
		if _, e := lockVariants(tx, ids); e != nil {
			return e
		}
		for _, i := range a.Items {
			if e := s.adjust(tx, i.VariantID, i.Quantity, c.Locals("userID").(uint), "arrival", a.Reference); e != nil {
				return e
			}
			cost := landed[i.ID]
			if e := tx.Model(&models.ArrivalItem{}).Where("id = ?", i.ID).Update("landed_cost", cost).Error; e != nil {
				return e
			}
			if e := tx.Model(&models.ProductVariant{}).Where("id = ?", i.VariantID).Update("cost", cost).Error; e != nil {
				return e
			}
		}
		now := time.Now()
		return tx.Model(&a).Updates(map[string]any{"status": "received", "received_at": now}).Error
	})
	if e != nil {
		return fiber.NewError(422, e.Error())
	}
	s.log(c, "arrival-receive", "arrivals", a.ID, a.Reference)
	s.DB.Preload("Items").First(&a, a.ID)
	return c.JSON(a)
}

// landedCosts calcule le coût de revient unitaire réel de chaque ligne d'un
// arrivage : prix d'achat converti en francs, augmenté de sa part de transport,
// de douane et de frais divers.
//
// Ces montants étaient saisis sur l'arrivage puis purement ignorés. Le coût de
// la déclinaison reprenait le prix d'achat brut, et un prix saisi en yuans
// était traité comme des francs CFA. La marge affichée dans les rapports s'en
// trouvait surévaluée de la totalité des frais d'importation.
//
// La ventilation se fait au prorata de la valeur d'achat de chaque ligne : une
// ligne qui pèse 40 % de la valeur du conteneur en supporte 40 % des frais.
func landedCosts(a models.Arrival) map[uint]int64 {
	rate := a.ExchangeRate
	if rate <= 0 {
		rate = 1 // devise déjà en francs, ou taux non renseigné
	}
	converted := make(map[uint]int64, len(a.Items))
	var base int64
	for _, i := range a.Items {
		unit := int64(math.Round(float64(i.UnitCost) * rate))
		converted[i.ID] = unit
		base += unit * i.Quantity
	}
	overhead := a.Shipping + a.Customs + a.OtherFees
	out := make(map[uint]int64, len(a.Items))
	for _, i := range a.Items {
		unit := converted[i.ID]
		if overhead > 0 && base > 0 && i.Quantity > 0 {
			share := float64(overhead) * float64(unit*i.Quantity) / float64(base)
			unit += int64(math.Round(share / float64(i.Quantity)))
		}
		out[i.ID] = unit
	}
	return out
}

type returnLineInput struct {
	VariantID uint  `json:"variantId"`
	Quantity  int64 `json:"quantity"`
	Amount    int64 `json:"amount"`
}

type returnInput struct {
	SaleID               uint `json:"saleId"`
	Reason, RefundMethod string
	Restock              bool              `json:"restock"`
	Items                []returnLineInput `json:"items"`
}

// processReturn enregistre un retour client.
//
// La version précédente ne chargeait jamais la facture : elle acceptait un
// retour de 9 999 unités sur une vente de 2, un retour sur une facture
// inexistante, et n'inscrivait aucun remboursement au crédit du client — la
// facture restait affichée comme intégralement soldée. Tout se vérifie
// désormais contre la vente d'origine, retours antérieurs compris.
func (s *Server) processReturn(c *fiber.Ctx) error {
	var in returnInput
	if c.BodyParser(&in) != nil || len(in.Items) == 0 {
		return fiber.ErrBadRequest
	}
	if in.SaleID == 0 {
		return fiber.NewError(422, "Un retour doit être rattaché à une facture.")
	}
	if strings.TrimSpace(in.Reason) == "" {
		return fiber.NewError(422, "Indiquez le motif du retour.")
	}
	userID := c.Locals("userID").(uint)
	r := models.SaleReturn{Reference: s.ref("RET"), SaleID: in.SaleID, UserID: userID,
		Reason: in.Reason, RefundMethod: in.RefundMethod, Restock: in.Restock}
	e := s.DB.Transaction(func(tx *gorm.DB) error {
		var sale models.Sale
		if e := tx.Preload("Items").First(&sale, in.SaleID).Error; e != nil {
			return fmt.Errorf("facture introuvable")
		}
		if sale.Status == "cancelled" {
			return fmt.Errorf("cette facture est annulée : aucun retour n'est possible")
		}
		if in.RefundMethod == "" {
			in.RefundMethod = sale.PaymentMethod
			r.RefundMethod = in.RefundMethod
		}

		// Ce qui a été vendu, ligne par ligne, et ce qui en a déjà été rendu.
		sold := map[uint]models.SaleItem{}
		for _, item := range sale.Items {
			sold[item.VariantID] = item
		}
		type prior struct{ quantity, amount int64 }
		already := map[uint]prior{}
		var previousRefunds int64
		var earlier []models.ReturnItem
		tx.Table("return_items").
			Joins("JOIN sale_returns ON sale_returns.id = return_items.sale_return_id").
			Where("sale_returns.sale_id = ?", sale.ID).
			Select("return_items.*").Scan(&earlier)
		for _, item := range earlier {
			p := already[item.VariantID]
			already[item.VariantID] = prior{p.quantity + item.Quantity, p.amount + item.Amount}
			previousRefunds += item.Amount
		}

		ids := make([]uint, 0, len(in.Items))
		for _, line := range in.Items {
			ids = append(ids, line.VariantID)
		}
		if _, e := lockVariants(tx, ids); e != nil {
			return e
		}
		if e := tx.Create(&r).Error; e != nil {
			return e
		}

		seen := map[uint]bool{}
		for _, line := range in.Items {
			item, ok := sold[line.VariantID]
			if !ok {
				return fmt.Errorf("cet article ne figure pas sur la facture %s", sale.Reference)
			}
			if seen[line.VariantID] {
				return fmt.Errorf("le même article apparaît deux fois dans le retour")
			}
			seen[line.VariantID] = true
			if line.Quantity <= 0 {
				return fmt.Errorf("quantité de retour invalide")
			}
			if line.Amount < 0 {
				return fmt.Errorf("montant de remboursement invalide")
			}
			restant := item.Quantity - already[line.VariantID].quantity
			if line.Quantity > restant {
				if restant <= 0 {
					return fmt.Errorf("cet article a déjà été entièrement retourné")
				}
				return fmt.Errorf("quantité trop élevée : %d unité(s) retournable(s) au maximum", restant)
			}
			// Le remboursement ne peut pas dépasser ce que la ligne a
			// réellement rapporté, au prorata des unités rendues.
			maximum := item.Total*line.Quantity/item.Quantity - already[line.VariantID].amount
			if maximum < 0 {
				maximum = 0
			}
			if line.Amount > maximum {
				return fmt.Errorf("remboursement trop élevé : %d F au maximum pour cet article", maximum)
			}
			r.Amount += line.Amount
			if e := tx.Create(&models.ReturnItem{SaleReturnID: r.ID, VariantID: line.VariantID,
				Quantity: line.Quantity, Amount: line.Amount}).Error; e != nil {
				return e
			}
			if in.Restock {
				if e := s.adjust(tx, line.VariantID, line.Quantity, userID, "return", r.Reference); e != nil {
					return e
				}
			}
		}

		// On ne rembourse jamais plus que ce que le client a versé.
		if r.Amount+previousRefunds > sale.Paid {
			return fmt.Errorf("remboursement de %d F impossible : seuls %d F ont été encaissés sur cette facture",
				r.Amount, sale.Paid-previousRefunds)
		}
		if e := tx.Save(&r).Error; e != nil {
			return e
		}
		// Le remboursement s'inscrit en règlement négatif : sans cela la
		// facture restait « soldée » après avoir rendu l'argent.
		if r.Amount > 0 {
			if e := tx.Create(&models.SalePayment{SaleID: sale.ID, UserID: userID, Method: r.RefundMethod,
				Amount: -r.Amount, Status: "active", Reference: r.Reference}).Error; e != nil {
				return e
			}
			if e := syncSalePayments(tx, &sale); e != nil {
				return e
			}
			if e := s.trackCash(tx, userID, r.RefundMethod, -r.Amount); e != nil {
				return e
			}
		}
		return nil
	})
	if e != nil {
		return fiber.NewError(422, e.Error())
	}
	s.log(c, "return", "returns", r.ID, fmt.Sprintf("%s — %d F remboursés", r.Reference, r.Amount))
	s.DB.Preload("Items").First(&r, r.ID)
	return c.Status(201).JSON(r)
}

// trackCash répercute un encaissement ou un remboursement en espèces sur la
// session de caisse ouverte du vendeur.
//
// ExpectedAmount restait figé au fond d'ouverture : à la clôture, l'écart de
// caisse était impossible à constater, ce qui est pourtant la raison d'être
// d'une session. Seules les espèces comptent — un règlement Wave ou par carte
// ne passe pas par le tiroir.
func (s *Server) trackCash(tx *gorm.DB, userID uint, method string, amount int64) error {
	return s.trackCashAs(tx, userID, method, amount, "")
}

// trackCashAs permet de nommer l'origine du mouvement. Un versement au coffre
// entre bien dans le tiroir, mais l'inscrire en « vente » ferait lire au
// gerant un chiffre d'affaires qui n'existe pas : le journal de caisse doit
// dire d'ou vient chaque billet.
func (s *Server) trackCashAs(tx *gorm.DB, userID uint, method string, amount int64, category string) error {
	if amount == 0 || method != "cash" {
		return nil
	}
	var session models.CashSession
	if tx.Clauses(lockForUpdate()).Where("user_id = ? AND status = 'open'", userID).First(&session).Error != nil {
		// Encaisser sans session ouverte reste permis : il n'y a simplement
		// pas de tiroir à mouvementer. La vente ne doit pas échouer pour ça.
		return nil
	}
	direction, fallback := "in", "vente"
	if amount < 0 {
		direction, fallback = "out", "remboursement"
	}
	if category == "" {
		category = fallback
	}
	if e := tx.Create(&models.CashMovement{CashSessionID: session.ID, UserID: userID,
		Direction: direction, Category: category, Amount: amount}).Error; e != nil {
		return e
	}
	return tx.Model(&session).Update("expected_amount", session.ExpectedAmount+amount).Error
}

func (s *Server) openCash(c *fiber.Ctx) error {
	var in struct {
		OpeningAmount int64 `json:"openingAmount"`
	}
	c.BodyParser(&in)
	uid := c.Locals("userID").(uint)
	var count int64
	s.DB.Model(&models.CashSession{}).Where("user_id=? AND status='open'", uid).Count(&count)
	if count > 0 {
		return fiber.NewError(409, "Une caisse est déjà ouverte")
	}
	x := models.CashSession{UserID: uid, Status: "open", OpeningAmount: in.OpeningAmount, ExpectedAmount: in.OpeningAmount, OpenedAt: time.Now()}
	s.DB.Create(&x)
	return c.Status(201).JSON(x)
}
func (s *Server) closeCash(c *fiber.Ctx) error {
	var in struct {
		ClosingAmount int64 `json:"closingAmount"`
	}
	c.BodyParser(&in)
	now := time.Now()
	// Une mise à jour sans ligne touchée renvoyait 204, comme si la caisse
	// avait été clôturée. Le vendeur croyait son tiroir fermé.
	result := s.DB.Model(&models.CashSession{}).Where("id=? AND status='open'", c.Params("id")).Updates(map[string]any{"status": "closed", "closing_amount": in.ClosingAmount, "closed_at": now})
	if result.Error != nil {
		return dbError(result.Error, "clôture de caisse")
	}
	if result.RowsAffected == 0 {
		return fiber.NewError(404, "Aucune session de caisse ouverte sous cet identifiant.")
	}
	var session models.CashSession
	s.DB.First(&session, c.Params("id"))
	s.log(c, "cash-close", "cash-sessions", session.ID, fmt.Sprintf("attendu %d F, compté %d F, écart %d F",
		session.ExpectedAmount, session.ClosingAmount, session.ClosingAmount-session.ExpectedAmount))
	return c.SendStatus(204)
}

// depositVault enregistre un versement au comptoir. Le corps de l'operation
// vit dans vaults.go : versement et retrait partagent le meme verrou, la meme
// ecriture d'historique et la meme alimentation de la caisse.
func (s *Server) depositVault(c *fiber.Ctx) error { return s.vaultMove(c, 1) }

// Expenses are the day-to-day running costs of the shop. Amounts stay whole
// CFA francs, like every other amount in SenValise.
type expenseInput struct {
	SpentOn       string `json:"spentOn"`
	Category      string `json:"category"`
	Label         string `json:"label"`
	Amount        int64  `json:"amount"`
	PaymentMethod string `json:"paymentMethod"`
	SupplierID    *uint  `json:"supplierId"`
	Note          string `json:"note"`
}
type expensePoint struct {
	Date   time.Time `json:"date"`
	Amount int64     `json:"amount"`
	Count  int64     `json:"count"`
}
type expenseTotal struct {
	Amount int64 `json:"amount"`
	Count  int64 `json:"count"`
}
type expenseGroup struct {
	Name   string `json:"name"`
	Amount int64  `json:"amount"`
	Count  int64  `json:"count"`
}

// expenseDay reads a business day. It accepts the YYYY-MM-DD sent by the date
// input as well as a full timestamp, and falls back to today so the page always
// has a day to show.
func expenseDay(value string) time.Time {
	now := time.Now()
	day := func(t time.Time) time.Time {
		return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, now.Location())
	}
	if value == "" {
		return day(now)
	}
	for _, layout := range []string{"2006-01-02", "2006-01-02T15:04", time.RFC3339} {
		if parsed, e := time.ParseInLocation(layout, value, now.Location()); e == nil {
			return day(parsed)
		}
	}
	return day(now)
}
func expenseCategory(value string) string {
	if strings.TrimSpace(value) == "" {
		return "divers"
	}
	return strings.TrimSpace(value)
}
func (in expenseInput) validate() error {
	if in.Amount <= 0 {
		return fiber.NewError(422, "Le montant de la dépense doit être supérieur à zéro")
	}
	if strings.TrimSpace(in.Label) == "" {
		return fiber.NewError(422, "Indiquez à quoi correspond la dépense")
	}
	return nil
}
func (s *Server) listExpenses(c *fiber.Ctx) error {
	rows := []models.Expense{}
	db := preload(s.DB, "expenses").Order("spent_on desc, id desc")
	if date := c.Query("date"); date != "" {
		start := expenseDay(date)
		db = db.Where("spent_on >= ? AND spent_on < ?", start, start.AddDate(0, 0, 1))
	} else {
		if from := c.Query("from"); from != "" {
			db = db.Where("spent_on >= ?", expenseDay(from))
		}
		if to := c.Query("to"); to != "" {
			db = db.Where("spent_on < ?", expenseDay(to).AddDate(0, 0, 1))
		}
	}
	if category := c.Query("category"); category != "" {
		db = db.Where("category = ?", category)
	}
	limit, _ := strconv.Atoi(c.Query("limit", "200"))
	if limit <= 0 || limit > 500 {
		limit = 500
	}
	if e := db.Limit(limit).Find(&rows).Error; e != nil {
		return e
	}
	return c.JSON(rows)
}
func (s *Server) createExpense(c *fiber.Ctx) error {
	var in expenseInput
	if c.BodyParser(&in) != nil {
		return fiber.ErrBadRequest
	}
	if e := in.validate(); e != nil {
		return e
	}
	expense := models.Expense{
		Reference: s.ref("DPS"), SpentOn: expenseDay(in.SpentOn), Category: expenseCategory(in.Category),
		Label: strings.TrimSpace(in.Label), Amount: in.Amount, PaymentMethod: in.PaymentMethod,
		SupplierID: in.SupplierID, UserID: c.Locals("userID").(uint), Note: strings.TrimSpace(in.Note),
	}
	if e := s.DB.Create(&expense).Error; e != nil {
		return fiber.NewError(422, e.Error())
	}
	_ = preload(s.DB, "expenses").First(&expense, expense.ID).Error
	return c.Status(201).JSON(expense)
}
func (s *Server) updateExpense(c *fiber.Ctx) error {
	var expense models.Expense
	if s.DB.First(&expense, c.Params("id")).Error != nil {
		return fiber.ErrNotFound
	}
	var in expenseInput
	if c.BodyParser(&in) != nil {
		return fiber.ErrBadRequest
	}
	if e := in.validate(); e != nil {
		return e
	}
	if in.SpentOn != "" {
		expense.SpentOn = expenseDay(in.SpentOn)
	}
	expense.Category = expenseCategory(in.Category)
	expense.Label = strings.TrimSpace(in.Label)
	expense.Amount = in.Amount
	expense.PaymentMethod = in.PaymentMethod
	expense.SupplierID = in.SupplierID
	expense.Note = strings.TrimSpace(in.Note)
	if e := s.DB.Save(&expense).Error; e != nil {
		return fiber.NewError(422, e.Error())
	}
	_ = preload(s.DB, "expenses").First(&expense, expense.ID).Error
	return c.JSON(expense)
}

// expenseSummary reads one business day: what was spent, how it splits, how the
// month is going, and what the shop billed the same day.
func (s *Server) expenseSummary(c *fiber.Ctx) error {
	day := expenseDay(c.Query("date"))
	next := day.AddDate(0, 0, 1)
	monthStart := time.Date(day.Year(), day.Month(), 1, 0, 0, 0, 0, day.Location())
	monthEnd := monthStart.AddDate(0, 1, 0)
	trendStart := day.AddDate(0, 0, -29)

	var today, month expenseTotal
	s.DB.Model(&models.Expense{}).Where("spent_on >= ? AND spent_on < ?", day, next).
		Select("coalesce(sum(amount),0) amount, count(*) count").Scan(&today)
	s.DB.Model(&models.Expense{}).Where("spent_on >= ? AND spent_on < ?", monthStart, monthEnd).
		Select("coalesce(sum(amount),0) amount, count(*) count").Scan(&month)

	categories := make([]expenseGroup, 0)
	methods := make([]expenseGroup, 0)
	monthCategories := make([]expenseGroup, 0)
	group := "select coalesce(nullif(%s,''),'%s') name, coalesce(sum(amount),0) amount, count(*) count from expenses where spent_on >= ? and spent_on < ? group by 1 order by amount desc"
	s.DB.Raw(fmt.Sprintf(group, "category", "divers"), day, next).Scan(&categories)
	s.DB.Raw(fmt.Sprintf(group, "payment_method", "cash"), day, next).Scan(&methods)
	s.DB.Raw(fmt.Sprintf(group, "category", "divers"), monthStart, monthEnd).Scan(&monthCategories)

	raw := make([]expensePoint, 0)
	s.DB.Raw("select date_trunc('day', spent_on) date, coalesce(sum(amount),0) amount, count(*) count from expenses where spent_on >= ? and spent_on < ? group by 1 order by 1", trendStart, next).Scan(&raw)

	var billed, collected int64
	s.DB.Model(&models.Sale{}).Where("created_at >= ? AND created_at < ? AND status <> 'cancelled'", day, next).
		Select("coalesce(sum(total),0)").Scan(&billed)
	s.DB.Model(&models.Sale{}).Where("created_at >= ? AND created_at < ? AND status <> 'cancelled'", day, next).
		Select("coalesce(sum(least(paid,total)),0)").Scan(&collected)

	return c.JSON(fiber.Map{
		"date":       day,
		"day":        fiber.Map{"amount": today.Amount, "count": today.Count},
		"month":      fiber.Map{"amount": month.Amount, "count": month.Count, "from": monthStart, "categories": monthCategories},
		"categories": categories,
		"methods":    methods,
		"trend":      fillExpenseTrend(raw, trendStart, day),
		"sales":      fiber.Map{"billed": billed, "collected": collected, "net": collected - today.Amount},
	})
}

// fillExpenseTrend keeps one point per day so the chart never skips a quiet day.
func fillExpenseTrend(raw []expensePoint, start, end time.Time) []expensePoint {
	byDay := map[string]expensePoint{}
	for _, point := range raw {
		byDay[point.Date.Format("2006-01-02")] = point
	}
	points := make([]expensePoint, 0)
	for cursor := start; !cursor.After(end); cursor = cursor.AddDate(0, 0, 1) {
		if point, ok := byDay[cursor.Format("2006-01-02")]; ok {
			point.Date = cursor
			points = append(points, point)
			continue
		}
		points = append(points, expensePoint{Date: cursor})
	}
	return points
}

func (s *Server) dashboard(c *fiber.Ctx) error {
	period := c.Query("period", "30d")
	now := time.Now()
	start, bucket := dashboardPeriod(period, now)
	duration := now.Sub(start)
	previousStart, previousEnd := start.Add(-duration), start

	type totals struct {
		Revenue     int64 `json:"revenue"`
		Paid        int64 `json:"paid"`
		Receivables int64 `json:"receivables"`
		Invoices    int64 `json:"invoices"`
	}
	var summary totals
	s.DB.Model(&models.Sale{}).Where("created_at >= ? AND created_at <= ?", start, now).
		Select("coalesce(sum(total),0) revenue, coalesce(sum(least(paid,total)),0) paid, coalesce(sum(greatest(total-paid,0)),0) receivables, count(*) invoices").Scan(&summary)
	var previousRevenue int64
	s.DB.Model(&models.Sale{}).Where("created_at >= ? AND created_at < ?", previousStart, previousEnd).Select("coalesce(sum(total),0)").Scan(&previousRevenue)
	growth := float64(0)
	if previousRevenue > 0 {
		growth = (float64(summary.Revenue-previousRevenue) / float64(previousRevenue)) * 100
	}

	var products, variants, customers, orders, lowStock, outOfStock, stockUnits, stockValue int64
	s.DB.Model(&models.Product{}).Where("active = true").Count(&products)
	s.DB.Model(&models.ProductVariant{}).Where("active = true").Count(&variants)
	s.DB.Model(&models.Customer{}).Count(&customers)
	s.DB.Model(&models.Order{}).Where("created_at >= ? AND created_at <= ?", start, now).Count(&orders)
	s.DB.Model(&models.ProductVariant{}).Where("active = true AND stock > 0 AND stock <= alert_at").Count(&lowStock)
	s.DB.Model(&models.ProductVariant{}).Where("active = true AND stock <= 0").Count(&outOfStock)
	s.DB.Model(&models.ProductVariant{}).Select("coalesce(sum(greatest(stock,0)),0)").Scan(&stockUnits)
	s.DB.Model(&models.ProductVariant{}).Select("coalesce(sum(greatest(stock,0)*cost),0)").Scan(&stockValue)

	var rawTrend []dashboardTrend
	s.DB.Raw("select date_trunc(?, created_at) date, coalesce(sum(total),0) billed, coalesce(sum(least(paid,total)),0) paid, count(*) count from sales where created_at >= ? and created_at <= ? group by 1 order by 1", bucket, start, now).Scan(&rawTrend)
	trend := fillTrend(rawTrend, start, now, bucket)

	type namedValue struct {
		Name  string `json:"name"`
		Value int64  `json:"value"`
		Count int64  `json:"count"`
	}
	topProducts := make([]namedValue, 0)
	topCustomers := make([]namedValue, 0)
	categories := make([]namedValue, 0)
	s.DB.Raw("select coalesce(p.name,pv.sku) name, coalesce(sum(si.total),0) value, coalesce(sum(si.quantity),0) count from sale_items si join sales s on s.id=si.sale_id join product_variants pv on pv.id=si.variant_id left join products p on p.id=pv.product_id where s.created_at >= ? and s.created_at <= ? group by p.name,pv.sku order by value desc limit 7", start, now).Scan(&topProducts)
	s.DB.Raw("select coalesce(c.name,'Client comptoir') name, coalesce(sum(s.total),0) value, count(*) count from sales s left join customers c on c.id=s.customer_id where s.created_at >= ? and s.created_at <= ? group by c.name order by value desc limit 7", start, now).Scan(&topCustomers)
	s.DB.Raw("select coalesce(cat.name,'Sans catégorie') name, coalesce(sum(si.total),0) value, coalesce(sum(si.quantity),0) count from sale_items si join sales s on s.id=si.sale_id join product_variants pv on pv.id=si.variant_id left join products p on p.id=pv.product_id left join categories cat on cat.id=p.category_id where s.created_at >= ? and s.created_at <= ? group by cat.name order by value desc limit 7", start, now).Scan(&categories)

	type statusValue struct {
		Status string `json:"status"`
		Count  int64  `json:"count"`
		Value  int64  `json:"value"`
	}
	paymentStatus := make([]statusValue, 0)
	s.DB.Raw("select case when paid >= total then 'paid' when paid > 0 then 'partial' else 'pending' end status, count(*) count, coalesce(sum(total),0) value from sales where created_at >= ? and created_at <= ? group by 1 order by 1", start, now).Scan(&paymentStatus)

	type ageingValue struct {
		Label string `json:"label"`
		Value int64  `json:"value"`
		Count int64  `json:"count"`
	}
	ageing := make([]ageingValue, 0)
	s.DB.Raw("select case when current_date-created_at::date <= 30 then '1–30 j' when current_date-created_at::date <= 60 then '31–60 j' when current_date-created_at::date <= 90 then '61–90 j' else '+90 j' end label, coalesce(sum(greatest(total-paid,0)),0) value, count(*) count from sales where total > paid group by 1 order by min(current_date-created_at::date)").Scan(&ageing)

	type trafficPoint struct {
		Day   int   `json:"day"`
		Hour  int   `json:"hour"`
		Count int64 `json:"count"`
	}
	traffic := make([]trafficPoint, 0)
	s.DB.Raw("select extract(isodow from created_at)::int as \"day\", extract(hour from created_at)::int as \"hour\", count(*) count from sales where created_at >= ? and created_at <= ? group by 1,2 order by 1,2", start, now).Scan(&traffic)

	type stockItem struct {
		ID      uint   `json:"id"`
		SKU     string `json:"sku"`
		Product string `json:"product"`
		Stock   int64  `json:"stock"`
		AlertAt int64  `json:"alertAt"`
	}
	stockAlerts := make([]stockItem, 0)
	s.DB.Raw("select pv.id,pv.sku,coalesce(p.name,pv.sku) product,pv.stock,pv.alert_at from product_variants pv left join products p on p.id=pv.product_id where pv.active=true and pv.stock<=pv.alert_at order by pv.stock asc,pv.id desc limit 8").Scan(&stockAlerts)

	averageBasket := int64(0)
	if summary.Invoices > 0 {
		averageBasket = summary.Revenue / summary.Invoices
	}
	return c.JSON(fiber.Map{
		"period": period, "from": start, "to": now, "growth": growth,
		"summary":   fiber.Map{"revenue": summary.Revenue, "paid": summary.Paid, "receivables": summary.Receivables, "invoices": summary.Invoices, "averageBasket": averageBasket},
		"stock":     fiber.Map{"products": products, "variants": variants, "units": stockUnits, "value": stockValue, "low": lowStock, "out": outOfStock, "alerts": stockAlerts},
		"customers": fiber.Map{"total": customers}, "orders": orders, "trend": trend, "ageing": ageing, "paymentStatus": paymentStatus, "topProducts": topProducts, "topCustomers": topCustomers, "categories": categories, "traffic": traffic,
	})
}

func dashboardPeriod(period string, now time.Time) (time.Time, string) {
	switch period {
	case "7d":
		return now.AddDate(0, 0, -6).Truncate(24 * time.Hour), "day"
	case "90d":
		return now.AddDate(0, 0, -89).Truncate(24 * time.Hour), "day"
	case "12m":
		return time.Date(now.Year(), now.Month()-11, 1, 0, 0, 0, 0, now.Location()), "month"
	default:
		return now.AddDate(0, 0, -29).Truncate(24 * time.Hour), "day"
	}
}

func fillTrend(raw []dashboardTrend, start, timeEnd time.Time, bucket string) []dashboardTrend {
	byDate := map[string]dashboardTrend{}
	format := "2006-01-02"
	if bucket == "month" {
		format = "2006-01"
	}
	for _, p := range raw {
		byDate[p.Date.Format(format)] = p
	}
	result := make([]dashboardTrend, 0)
	for cursor := start; !cursor.After(timeEnd); {
		key := cursor.Format(format)
		if p, ok := byDate[key]; ok {
			result = append(result, p)
		} else {
			result = append(result, dashboardTrend{Date: cursor})
		}
		if bucket == "month" {
			cursor = cursor.AddDate(0, 1, 0)
		} else {
			cursor = cursor.AddDate(0, 0, 1)
		}
	}
	return result
}
func (s *Server) shopProducts(c *fiber.Ctx) error {
	var p []models.Product
	if e := s.DB.Where("active=true AND online=true").Preload("Variants", "active=true AND stock>0").Find(&p).Error; e != nil {
		return e
	}
	return c.JSON(p)
}
func (s *Server) createOrder(c *fiber.Ctx) error {
	var o models.Order
	if c.BodyParser(&o) != nil || len(o.Items) == 0 {
		return fiber.ErrBadRequest
	}
	o.Reference = s.ref("CMD")
	o.Status = "pending"
	var total int64
	for i := range o.Items {
		o.Items[i].Total = o.Items[i].UnitPrice * o.Items[i].Quantity
		total += o.Items[i].Total
	}
	o.Total = total + o.DeliveryFee
	if e := s.DB.Create(&o).Error; e != nil {
		return fiber.NewError(422, e.Error())
	}
	return c.Status(201).JSON(o)
}
func (s *Server) createContact(c *fiber.Ctx) error {
	var m models.ContactMessage
	if c.BodyParser(&m) != nil {
		return fiber.ErrBadRequest
	}
	m.Status = "new"
	if e := s.DB.Create(&m).Error; e != nil {
		return e
	}
	return c.SendStatus(201)
}

func (s *Server) inventory(c *fiber.Ctx) error {
	var in struct {
		Items []struct {
			VariantID uint  `json:"variantId"`
			Counted   int64 `json:"counted"`
		} `json:"items"`
	}
	if c.BodyParser(&in) != nil || len(in.Items) == 0 {
		return fiber.ErrBadRequest
	}
	uid := c.Locals("userID").(uint)
	reference := s.ref("INV")
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		for _, item := range in.Items {
			var v models.ProductVariant
			if e := tx.First(&v, item.VariantID).Error; e != nil {
				return e
			}
			delta := item.Counted - v.Stock
			if delta != 0 {
				if e := s.adjust(tx, v.ID, delta, uid, "inventory", reference); e != nil {
					return e
				}
			}
		}
		return nil
	})
	if err != nil {
		return fiber.NewError(422, err.Error())
	}
	return c.Status(201).JSON(fiber.Map{"reference": reference})
}

// imageExtension déduit le format à partir des premiers octets du fichier,
// pas de son nom.
//
// Seule l'extension était contrôlée : un script renommé en .png passait sans
// difficulté. Nginx sert ce dossier en statique et n'exécute rien, donc le
// risque restait faible, mais la vérification doit porter sur le contenu — et
// c'est aussi ce qui empêche un PDF renommé de finir dans une galerie photo.
func imageExtension(f *multipart.FileHeader) (string, error) {
	handle, err := f.Open()
	if err != nil {
		return "", fiber.NewError(400, "Fichier illisible")
	}
	defer handle.Close()
	head := make([]byte, 12)
	n, _ := io.ReadFull(handle, head)
	head = head[:n]
	switch {
	case bytes.HasPrefix(head, []byte{0xFF, 0xD8, 0xFF}):
		return ".jpg", nil
	case bytes.HasPrefix(head, []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}):
		return ".png", nil
	case len(head) >= 12 && bytes.HasPrefix(head, []byte("RIFF")) && bytes.Equal(head[8:12], []byte("WEBP")):
		return ".webp", nil
	}
	return "", fiber.NewError(415, "Ce fichier n\u2019est pas une image PNG, JPG ou WebP.")
}

func saveInvoiceImage(c *fiber.Ctx, prefix string) (string, error) {
	f, err := c.FormFile("image")
	if err != nil {
		return "", fiber.NewError(400, "Image requise")
	}
	if f.Size > 5<<20 {
		return "", fiber.NewError(413, "Image limitée à 5 Mo")
	}
	ext, err := imageExtension(f)
	if err != nil {
		return "", err
	}
	if ext == ".webp" {
		return "", fiber.NewError(415, "Seules les images PNG et JPG sont acceptées")
	}
	if err = os.MkdirAll("uploads", 0755); err != nil {
		return "", err
	}
	// Même correction qu'au téléversement des photos : sans fraction de seconde
	// réelle, deux envois rapprochés portaient le même nom.
	stamp := time.Now()
	name := fmt.Sprintf("%s-%s-%09d%s", prefix, stamp.Format("20060102-150405"), stamp.Nanosecond(), ext)
	if err = c.SaveFile(f, filepath.Join("uploads", name)); err != nil {
		return "", err
	}
	return "/uploads/" + name, nil
}

func (s *Server) uploadInvoiceAsset(c *fiber.Ctx) error {
	url, err := saveInvoiceImage(c, "invoice-default")
	if err != nil {
		return err
	}
	return c.Status(201).JSON(fiber.Map{"url": url})
}

// Facture, devis et bon de livraison portent tous les deux signatures.
// Le document cible vient de la route, jamais d'une hypothèse : signer un
// devis ne doit pas écrire sur la vente qui porte le même identifiant.
func (s *Server) uploadDocumentSignature(c *fiber.Ctx, resource string) error {
	kind := c.Params("kind")
	if kind != "client" && kind != "company" {
		return fiber.NewError(422, "Type de signature invalide")
	}
	var target any
	switch resource {
	case "sales":
		target = &models.Sale{}
	case "quotes":
		target = &models.Quote{}
	case "delivery-notes":
		target = &models.DeliveryNote{}
	default:
		return fiber.ErrNotFound
	}
	if s.DB.First(target, c.Params("id")).Error != nil {
		return fiber.ErrNotFound
	}
	url, err := saveInvoiceImage(c, "signature-"+kind)
	if err != nil {
		return err
	}
	field := "client_signature_url"
	if kind == "company" {
		field = "company_signature_url"
	}
	if err = s.DB.Model(target).Update(field, url).Error; err != nil {
		return fiber.NewError(422, err.Error())
	}
	return c.Status(201).JSON(fiber.Map{"url": url})
}

func (s *Server) uploadProductImage(c *fiber.Ctx) error {
	f, err := c.FormFile("image")
	if err != nil {
		return fiber.NewError(400, "Image requise")
	}
	if f.Size > 10<<20 {
		return fiber.NewError(413, "Image limitée à 10 Mo")
	}
	ext, err := imageExtension(f)
	if err != nil {
		return err
	}
	if err = os.MkdirAll("uploads", 0755); err != nil {
		return err
	}
	// « 000000 » n'est pas un motif de fraction de seconde en Go (il faudrait
	// « .000000 ») : le nom ne variait donc pas dans la même seconde, et deux
	// photos envoyées à la suite écrasaient le même fichier.
	now := time.Now()
	name := fmt.Sprintf("product-%s-%09d%s", now.Format("20060102-150405"), now.Nanosecond(), ext)
	if err = c.SaveFile(f, filepath.Join("uploads", name)); err != nil {
		return err
	}
	id64, _ := strconv.ParseUint(c.Params("id"), 10, 64)
	var existing int64
	s.DB.Model(&models.ProductImage{}).Where("product_id = ?", id64).Count(&existing)
	// La première photo d'un produit devient sa photo principale, et chaque
	// suivante se range à la fin. Sans cela aucune image n'était jamais marquée
	// et la vitrine retombait sur l'ordre d'insertion.
	img := models.ProductImage{ProductID: uint(id64), URL: "/uploads/" + name, Alt: c.FormValue("alt"),
		Position: int(existing), Primary: existing == 0}
	if err = s.DB.Create(&img).Error; err != nil {
		return fiber.NewError(422, err.Error())
	}
	return c.Status(201).JSON(img)
}

func (s *Server) duplicates(c *fiber.Ctx) error {
	type group struct {
		Value string `json:"value"`
		Count int64  `json:"count"`
	}
	var phones, emails []group
	s.DB.Model(&models.Customer{}).Select("lower(phone) AS value, count(*) AS count").Where("phone <> ''").Group("lower(phone)").Having("count(*) > 1").Scan(&phones)
	s.DB.Model(&models.Customer{}).Select("lower(email) AS value, count(*) AS count").Where("email <> ''").Group("lower(email)").Having("count(*) > 1").Scan(&emails)
	return c.JSON(fiber.Map{"phones": phones, "emails": emails})
}

func ean13(seed uint) string {
	base := fmt.Sprintf("200%09d", seed%1000000000)
	sum := 0
	for i, ch := range base {
		n := int(ch - '0')
		if i%2 == 0 {
			sum += n
		} else {
			sum += 3 * n
		}
	}
	return base + strconv.Itoa((10-sum%10)%10)
}
func (s *Server) label(c *fiber.Ctx) error {
	var v models.ProductVariant
	if s.DB.First(&v, c.Params("variantId")).Error != nil {
		return fiber.ErrNotFound
	}
	code := v.Barcode
	if code == "" {
		code = ean13(v.ID)
		s.DB.Model(&v).Update("barcode", code)
	}
	return c.JSON(fiber.Map{"barcode": code, "sku": v.SKU, "price": v.Price, "color": v.Color, "size": v.Size})
}

func (s *Server) convertQuote(c *fiber.Ctx) error {
	var quote models.Quote
	if e := s.DB.Preload("Items").First(&quote, c.Params("id")).Error; e != nil {
		return fiber.ErrNotFound
	}
	if quote.ConvertedSaleID != nil {
		return fiber.NewError(409, "Ce devis a déjà été converti en facture")
	}
	if len(quote.Items) == 0 {
		return fiber.NewError(422, "Le devis ne contient aucune ligne")
	}
	var sale models.Sale
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		// La conversion sort la marchandise du stock, exactement comme
		// l'encaissement au comptoir. Elle ne le faisait pas : la facture
		// partait, le stock restait. Pire, retoucher ensuite une ligne de
		// cette facture ajustait bien le stock — réduire une quantité créait
		// donc des unités qui n'en étaient jamais sorties.
		ids := make([]uint, 0, len(quote.Items))
		for _, item := range quote.Items {
			ids = append(ids, item.VariantID)
		}
		if _, e := lockVariants(tx, ids); e != nil {
			return e
		}
		defaults := s.readCheckoutSettings().InvoiceDefaults
		sale = models.Sale{Reference: s.ref("VTE"), QuoteID: &quote.ID, CustomerID: quote.CustomerID, UserID: c.Locals("userID").(uint), Channel: "quote", Status: "pending", PaymentMethod: "credit", Subtotal: quote.Subtotal, Discount: quote.Discount, TaxRate: quote.TaxRate, Tax: quote.Tax, Total: quote.Total, Paid: 0, InvoiceCompanyName: defaults.CompanyName, InvoiceTagline: defaults.Tagline, InvoicePhone: defaults.Phone, InvoiceAddress: defaults.Address, InvoiceThankYouTitle: defaults.ThankYouTitle, InvoiceFooterNote: defaults.FooterNote, CompanySignatureURL: defaults.CompanySignature}
		for _, item := range quote.Items {
			sale.Items = append(sale.Items, models.SaleItem{VariantID: item.VariantID, Quantity: item.Quantity, UnitPrice: item.UnitPrice, Discount: item.Discount, Total: item.Total})
		}
		if e := tx.Create(&sale).Error; e != nil {
			return e
		}
		for _, item := range sale.Items {
			if e := s.adjust(tx, item.VariantID, -item.Quantity, sale.UserID, "quote_convert", sale.Reference); e != nil {
				return e
			}
		}
		return tx.Model(&quote).Updates(map[string]any{"status": "accepted", "converted_sale_id": sale.ID}).Error
	})
	if err != nil {
		return fiber.NewError(422, err.Error())
	}
	s.log(c, "quote-convert", "quotes", quote.ID, quote.Reference+" → "+sale.Reference)
	return c.Status(201).JSON(sale)
}

func (s *Server) createDeliveryNote(c *fiber.Ctx) error {
	var sale models.Sale
	if e := s.DB.Preload("Items.Variant.Product").First(&sale, c.Params("id")).Error; e != nil {
		return fiber.ErrNotFound
	}
	var existing models.DeliveryNote
	if s.DB.Where("sale_id = ?", sale.ID).First(&existing).Error == nil {
		return fiber.NewError(409, "Un bon de livraison existe déjà pour cette facture")
	}
	note := models.DeliveryNote{Reference: s.ref("BL"), Status: "ready", SaleID: sale.ID, CustomerID: sale.CustomerID, UserID: c.Locals("userID").(uint), Notes: "Bon de livraison généré depuis la facture " + sale.Reference}
	for _, item := range sale.Items {
		note.Items = append(note.Items, models.DeliveryNoteItem{VariantID: item.VariantID, Description: item.Variant.Product.Name, Quantity: item.Quantity})
	}
	if e := s.DB.Create(&note).Error; e != nil {
		return fiber.NewError(422, e.Error())
	}
	return c.Status(201).JSON(note)
}
