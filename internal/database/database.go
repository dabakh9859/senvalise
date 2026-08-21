package database

import (
	"fmt"
	"log"
	"os"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlog "gorm.io/gorm/logger"
	"senvalise/internal/models"
)

func Open() (*gorm.DB, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://senvalise:senvalise@localhost:5432/senvalise?sslmode=disable"
	}
	// Les semeurs utilisent First() + ErrRecordNotFound comme sonde « cet
	// enregistrement existe-t-il deja ? ». Le journaliseur par defaut traite
	// chacune de ces sondes comme une erreur : un demarrage sur base neuve
	// deversait quarante lignes rouges sans qu'aucune ne signale un probleme,
	// ce qui aurait masque une vraie erreur. On garde les requetes lentes et
	// les vraies erreurs, on tait les absences attendues.
	gormLogger := gormlog.New(log.New(os.Stdout, "", log.LstdFlags), gormlog.Config{
		SlowThreshold:             200 * time.Millisecond,
		LogLevel:                  gormlog.Warn,
		IgnoreRecordNotFoundError: true,
		Colorful:                  false,
	})
	var db *gorm.DB
	var err error
	for i := 0; i < 30; i++ {
		db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: gormLogger})
		if err == nil {
			break
		}
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		return nil, fmt.Errorf("database: %w", err)
	}
	// Sale and Quote reference each other, so a single pass cannot create both
	// foreign keys. Create the tables without constraints first, then re-run the
	// migration to add them once every table exists.
	schema := []any{&models.User{}, &models.Category{}, &models.Brand{}, &models.Supplier{}, &models.Customer{}, &models.CustomerAddress{}, &models.Colorway{}, &models.Product{}, &models.ProductSpec{}, &models.ProductColorway{}, &models.ProductImage{}, &models.ProductVariant{}, &models.StockMovement{}, &models.Arrival{}, &models.ArrivalItem{}, &models.Sale{}, &models.SaleItem{}, &models.SalePayment{}, &models.SaleReturn{}, &models.ReturnItem{}, &models.Quote{}, &models.QuoteItem{}, &models.DeliveryNote{}, &models.DeliveryNoteItem{}, &models.Document{}, &models.DocumentItem{}, &models.Order{}, &models.OrderItem{}, &models.Vault{}, &models.VaultDeposit{}, &models.CashSession{}, &models.CashMovement{}, &models.Message{}, &models.MessageTemplate{}, &models.Campaign{}, &models.HomeBlock{}, &models.ActivityLog{}, &models.Setting{}, &models.DeliveryZone{}, &models.ContactMessage{}, &models.Expense{}}
	db.Config.DisableForeignKeyConstraintWhenMigrating = true
	if err := db.AutoMigrate(schema...); err != nil {
		return nil, err
	}
	db.Config.DisableForeignKeyConstraintWhenMigrating = false
	if err := db.AutoMigrate(schema...); err != nil {
		return nil, err
	}
	// Les references de document viennent d'une sequence plutot que d'un
	// horodatage : deux ventes enregistrees dans la meme milliseconde
	// recevaient la meme reference, et l'index unique en rejetait une.
	if err := db.Exec("CREATE SEQUENCE IF NOT EXISTS document_refs START 1").Error; err != nil {
		return nil, err
	}
	return db, seed(db)
}

func seed(db *gorm.DB) error {
	var n int64
	db.Model(&models.User{}).Count(&n)
	if n > 0 {
		return seedDefaults(db)
	}
	password := os.Getenv("ADMIN_PASSWORD")
	if password == "" {
		password = "ChangeMe123!"
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	email := os.Getenv("ADMIN_EMAIL")
	if email == "" {
		email = "gerant@senvalise.sn"
	}
	if err := db.Create(&models.User{Name: "Gérant SenValise", Email: email, PasswordHash: string(hash), Role: "manager", Active: true}).Error; err != nil {
		return err
	}
	return seedDefaults(db)
}

func seedDefaults(db *gorm.DB) error {
	// Les photos de catalogue appartiennent a seedShop, qui pose la galerie
	// locale de chaque produit. Un bloc en attachait ici depuis Unsplash, avant
	// meme que les produits n'existent : sur une base neuve les huit recherches
	// echouaient et journalisaient une erreur, et sur une base existante
	// seedShop supprimait ensuite ces memes images. Rien ne le remplace.
	var setting models.Setting
	if db.Where("key = ?", "checkout_config").First(&setting).Error == gorm.ErrRecordNotFound {
		// Ne pas sortir ici : le catalogue et le jeu de démonstration se seedent
		// en dessous, et une base neuve passe forcément par cette branche.
		if err := db.Create(&models.Setting{Key: "checkout_config", Value: `{"taxRate":18,"taxEnabledByDefault":false,"paymentMethods":[{"id":"cash","label":"Espèces","active":true},{"id":"wave","label":"Wave","active":true},{"id":"orange_money","label":"Orange Money","active":true},{"id":"card","label":"Carte bancaire","active":true},{"id":"credit","label":"Crédit","active":true},{"id":"bank_transfer","label":"Virement","active":false}]}`}).Error; err != nil {
			return err
		}
	}
	if err := seedShop(db); err != nil {
		return err
	}
	if err := seedDemo(db); err != nil {
		return err
	}
	return seedBusinessDocuments(db)
}

func seedBusinessDocuments(db *gorm.DB) error {
	// Keep conversion links navigable for data created before QuoteID was added to Sales.
	db.Exec("UPDATE sales SET quote_id = quotes.id FROM quotes WHERE quotes.converted_sale_id = sales.id AND sales.quote_id IS NULL")
	// Convert legacy aggregate amounts into auditable payment rows once.
	var paidSales []models.Sale
	db.Where("paid > 0").Find(&paidSales)
	for _, sale := range paidSales {
		var paymentCount int64
		db.Model(&models.SalePayment{}).Where("sale_id = ?", sale.ID).Count(&paymentCount)
		if paymentCount == 0 {
			method := sale.PaymentMethod
			if method == "" {
				method = "legacy"
			}
			_ = db.Create(&models.SalePayment{SaleID: sale.ID, UserID: sale.UserID, Method: method, Amount: sale.Paid, Status: "active", Reference: "MIG-" + sale.Reference}).Error
		}
	}
	db.Exec("UPDATE sales SET status = CASE WHEN status = 'cancelled' THEN 'cancelled' WHEN paid >= total AND total > 0 THEN 'paid' WHEN paid > 0 THEN 'partial' ELSE 'pending' END")
	var count int64
	db.Model(&models.Quote{}).Count(&count)
	if count > 0 {
		return nil
	}
	var sale models.Sale
	if db.Preload("Items.Variant.Product").First(&sale).Error != nil || len(sale.Items) == 0 {
		return nil
	}
	quote := models.Quote{Reference: "DEV-DEMO-001", Status: "sent", CustomerID: sale.CustomerID, UserID: sale.UserID, Subtotal: sale.Subtotal, Discount: sale.Discount, TaxRate: sale.TaxRate, Tax: sale.Tax, Total: sale.Total, Notes: "Devis de démonstration SenValise"}
	for _, item := range sale.Items {
		quote.Items = append(quote.Items, models.QuoteItem{VariantID: item.VariantID, Description: item.Variant.Product.Name, Quantity: item.Quantity, UnitPrice: item.UnitPrice, Discount: item.Discount, Total: item.Total})
	}
	return db.Create(&quote).Error
}
