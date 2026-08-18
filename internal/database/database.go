package database

import (
	"fmt"
	"os"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"senvalise/internal/models"
)

func Open() (*gorm.DB, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://senvalise:senvalise@localhost:5432/senvalise?sslmode=disable"
	}
	var db *gorm.DB
	var err error
	for i := 0; i < 30; i++ {
		db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
		if err == nil {
			break
		}
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		return nil, fmt.Errorf("database: %w", err)
	}
	err = db.AutoMigrate(&models.User{}, &models.Category{}, &models.Brand{}, &models.Supplier{}, &models.Customer{}, &models.Product{}, &models.ProductImage{}, &models.ProductVariant{}, &models.StockMovement{}, &models.Arrival{}, &models.ArrivalItem{}, &models.Sale{}, &models.SaleItem{}, &models.SaleReturn{}, &models.ReturnItem{}, &models.Document{}, &models.DocumentItem{}, &models.Order{}, &models.OrderItem{}, &models.Vault{}, &models.VaultDeposit{}, &models.CashSession{}, &models.CashMovement{}, &models.Message{}, &models.MessageTemplate{}, &models.HomeBlock{}, &models.ActivityLog{}, &models.Setting{}, &models.DeliveryZone{}, &models.ContactMessage{})
	if err != nil {
		return nil, err
	}
	return db, seed(db)
}

func seed(db *gorm.DB) error {
	var n int64
	db.Model(&models.User{}).Count(&n)
	if n > 0 {
		return nil
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
	return db.Create(&models.User{Name: "Gérant SenValise", Email: email, PasswordHash: string(hash), Role: "manager", Active: true}).Error
}
