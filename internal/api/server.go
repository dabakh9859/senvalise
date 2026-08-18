package api

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
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

func (s *Server) Register(app *fiber.App) {
	app.Get("/health", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"status": "ok", "service": "senvalise-api"}) })
	app.Post("/api/auth/login", s.login)
	app.Get("/api/shop/products", s.shopProducts)
	app.Post("/api/shop/orders", s.createOrder)
	app.Post("/api/shop/contact", s.createContact)
	a := app.Group("/api", auth.Required)
	a.Get("/me", s.me)
	a.Get("/dashboard", s.dashboard)
	managerOnly := map[string]bool{"categories": true, "brands": true, "suppliers": true, "products": true, "product-images": true, "variants": true, "arrivals": true, "orders": true, "vaults": true, "messages": true, "message-templates": true, "home-blocks": true, "settings": true, "delivery-zones": true, "users": true}
	for _, resource := range []string{"categories", "brands", "suppliers", "customers", "products", "product-images", "variants", "arrivals", "sales", "returns", "documents", "orders", "vaults", "cash-sessions", "cash-movements", "messages", "message-templates", "home-blocks", "activity-logs", "settings", "delivery-zones", "contact-messages", "users"} {
		r := resource
		a.Get("/"+r, func(c *fiber.Ctx) error { return s.list(c, r) })
		a.Get("/"+r+"/:id", func(c *fiber.Ctx) error { return s.show(c, r) })
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
	a.Post("/stock/adjust", s.adjustStock)
	a.Post("/stock/inventory", s.inventory)
	a.Post("/sales/checkout", s.checkout)
	a.Post("/arrivals/:id/receive", auth.Manager, s.receiveArrival)
	a.Post("/returns/process", s.processReturn)
	a.Post("/cash/open", s.openCash)
	a.Post("/cash/:id/close", s.closeCash)
	a.Post("/vaults/:id/deposit", s.depositVault)
	a.Post("/products/:id/images", auth.Manager, s.uploadProductImage)
	a.Get("/duplicates/customers", auth.Manager, s.duplicates)
	a.Get("/labels/:variantId", s.label)
	a.Post("/documents/:id/convert", s.convertDocument)
	a.Get("/reports/summary", auth.Manager, s.dashboard)
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
	case "documents":
		return &models.Document{}
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
	case "activity-logs":
		return &models.ActivityLog{}
	case "settings":
		return &models.Setting{}
	case "delivery-zones":
		return &models.DeliveryZone{}
	case "contact-messages":
		return &models.ContactMessage{}
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
	case "documents":
		return &[]models.Document{}
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
	case "activity-logs":
		return &[]models.ActivityLog{}
	case "settings":
		return &[]models.Setting{}
	case "delivery-zones":
		return &[]models.DeliveryZone{}
	case "contact-messages":
		return &[]models.ContactMessage{}
	case "users":
		return &[]models.User{}
	}
	return nil
}
func preload(db *gorm.DB, name string) *gorm.DB {
	switch name {
	case "products":
		return db.Preload("Variants").Preload("Images")
	case "arrivals", "sales", "returns", "documents", "orders", "vaults", "cash-sessions":
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
	if q := c.Query("q"); q != "" {
		db = db.Where("CAST(id AS TEXT) LIKE ?", "%"+q+"%")
	}
	limit, _ := strconv.Atoi(c.Query("limit", "100"))
	if limit > 500 {
		limit = 500
	}
	if e := db.Limit(limit).Find(out).Error; e != nil {
		return e
	}
	return c.JSON(out)
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
	return c.JSON(out)
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
		return fiber.NewError(422, e.Error())
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
	if e := c.BodyParser(out); e != nil {
		return fiber.ErrBadRequest
	}
	if e := s.DB.Save(out).Error; e != nil {
		return fiber.NewError(422, e.Error())
	}
	return c.JSON(out)
}
func (s *Server) remove(c *fiber.Ctx, name string) error {
	out := modelFor(name)
	if out == nil {
		return fiber.ErrNotFound
	}
	if e := s.DB.Delete(out, c.Params("id")).Error; e != nil {
		return fiber.NewError(422, e.Error())
	}
	return c.SendStatus(204)
}

func ref(prefix string) string {
	return fmt.Sprintf("%s-%s", prefix, time.Now().Format("20060102-150405.000"))
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
		return s.adjust(tx, in.VariantID, in.Quantity, c.Locals("userID").(uint), in.Reason, ref("STK"))
	})
	if e != nil {
		return fiber.NewError(422, e.Error())
	}
	return c.SendStatus(201)
}

type lineInput struct {
	VariantID uint  `json:"variantId"`
	Quantity  int64 `json:"quantity"`
	UnitPrice int64 `json:"unitPrice"`
	Discount  int64 `json:"discount"`
}

func (s *Server) checkout(c *fiber.Ctx) error {
	var in struct {
		CustomerID    *uint       `json:"customerId"`
		PaymentMethod string      `json:"paymentMethod"`
		Paid          int64       `json:"paid"`
		Discount      int64       `json:"discount"`
		Items         []lineInput `json:"items"`
	}
	if c.BodyParser(&in) != nil || len(in.Items) == 0 {
		return fiber.ErrBadRequest
	}
	sale := models.Sale{Reference: ref("VTE"), CustomerID: in.CustomerID, UserID: c.Locals("userID").(uint), Channel: "pos", PaymentMethod: in.PaymentMethod, Discount: in.Discount}
	e := s.DB.Transaction(func(tx *gorm.DB) error {
		if e := tx.Create(&sale).Error; e != nil {
			return e
		}
		var total int64
		for _, l := range in.Items {
			var v models.ProductVariant
			if e := tx.First(&v, l.VariantID).Error; e != nil {
				return e
			}
			price := l.UnitPrice
			if price == 0 {
				price = v.Price
			}
			line := price*l.Quantity - l.Discount
			total += line
			if e := tx.Create(&models.SaleItem{SaleID: sale.ID, VariantID: v.ID, Quantity: l.Quantity, UnitPrice: price, UnitCost: v.Cost, Discount: l.Discount, Total: line}).Error; e != nil {
				return e
			}
			if e := s.adjust(tx, v.ID, -l.Quantity, sale.UserID, "sale", sale.Reference); e != nil {
				return e
			}
		}
		sale.Subtotal = total + in.Discount
		sale.Total = total
		sale.Paid = in.Paid
		if in.Paid >= total {
			sale.Status = "paid"
		} else if in.Paid > 0 {
			sale.Status = "partial"
		} else {
			sale.Status = "pending"
		}
		return tx.Save(&sale).Error
	})
	if e != nil {
		return fiber.NewError(422, e.Error())
	}
	s.DB.Preload("Items").First(&sale, sale.ID)
	return c.Status(201).JSON(sale)
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
	e := s.DB.Transaction(func(tx *gorm.DB) error {
		for _, i := range a.Items {
			if e := s.adjust(tx, i.VariantID, i.Quantity, c.Locals("userID").(uint), "arrival", a.Reference); e != nil {
				return e
			}
			var v models.ProductVariant
			tx.First(&v, i.VariantID)
			newCost := i.LandedCost
			if newCost == 0 {
				newCost = i.UnitCost
			}
			tx.Model(&v).Update("cost", newCost)
		}
		now := time.Now()
		return tx.Model(&a).Updates(map[string]any{"status": "received", "received_at": now}).Error
	})
	if e != nil {
		return fiber.NewError(422, e.Error())
	}
	return c.JSON(a)
}
func (s *Server) processReturn(c *fiber.Ctx) error {
	var in struct {
		SaleID               uint `json:"saleId"`
		Reason, RefundMethod string
		Restock              bool `json:"restock"`
		Items                []struct {
			VariantID        uint  `json:"variantId"`
			Quantity, Amount int64 `json:"quantity"`
		} `json:"items"`
	}
	if c.BodyParser(&in) != nil || len(in.Items) == 0 {
		return fiber.ErrBadRequest
	}
	r := models.SaleReturn{Reference: ref("RET"), SaleID: in.SaleID, UserID: c.Locals("userID").(uint), Reason: in.Reason, RefundMethod: in.RefundMethod, Restock: in.Restock}
	e := s.DB.Transaction(func(tx *gorm.DB) error {
		if e := tx.Create(&r).Error; e != nil {
			return e
		}
		for _, i := range in.Items {
			r.Amount += i.Amount
			if e := tx.Create(&models.ReturnItem{SaleReturnID: r.ID, VariantID: i.VariantID, Quantity: i.Quantity, Amount: i.Amount}).Error; e != nil {
				return e
			}
			if in.Restock {
				if e := s.adjust(tx, i.VariantID, i.Quantity, r.UserID, "return", r.Reference); e != nil {
					return e
				}
			}
		}
		return tx.Save(&r).Error
	})
	if e != nil {
		return fiber.NewError(422, e.Error())
	}
	return c.Status(201).JSON(r)
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
	if e := s.DB.Model(&models.CashSession{}).Where("id=? AND status='open'", c.Params("id")).Updates(map[string]any{"status": "closed", "closing_amount": in.ClosingAmount, "closed_at": now}).Error; e != nil {
		return e
	}
	return c.SendStatus(204)
}
func (s *Server) depositVault(c *fiber.Ctx) error {
	var in struct {
		Amount int64  `json:"amount"`
		Method string `json:"method"`
	}
	if c.BodyParser(&in) != nil || in.Amount <= 0 {
		return fiber.ErrBadRequest
	}
	e := s.DB.Transaction(func(tx *gorm.DB) error {
		var v models.Vault
		if e := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&v, c.Params("id")).Error; e != nil {
			return e
		}
		if e := tx.Model(&v).Update("balance", gorm.Expr("balance + ?", in.Amount)).Error; e != nil {
			return e
		}
		return tx.Create(&models.VaultDeposit{VaultID: v.ID, Amount: in.Amount, Method: in.Method, Reference: ref("DEP")}).Error
	})
	if e != nil {
		return fiber.NewError(422, e.Error())
	}
	return c.SendStatus(201)
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
	o.Reference = ref("CMD")
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
	reference := ref("INV")
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

func (s *Server) uploadProductImage(c *fiber.Ctx) error {
	f, err := c.FormFile("image")
	if err != nil {
		return fiber.NewError(400, "Image requise")
	}
	if f.Size > 10<<20 {
		return fiber.NewError(413, "Image limitée à 10 Mo")
	}
	ext := strings.ToLower(filepath.Ext(f.Filename))
	allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}
	if !allowed[ext] {
		return fiber.NewError(415, "Format non accepté")
	}
	if err = os.MkdirAll("uploads", 0755); err != nil {
		return err
	}
	name := fmt.Sprintf("product-%s%s", time.Now().Format("20060102150405000000"), ext)
	if err = c.SaveFile(f, filepath.Join("uploads", name)); err != nil {
		return err
	}
	id64, _ := strconv.ParseUint(c.Params("id"), 10, 64)
	img := models.ProductImage{ProductID: uint(id64), URL: "/uploads/" + name, Alt: c.FormValue("alt")}
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

func (s *Server) convertDocument(c *fiber.Ctx) error {
	var in struct {
		Type string `json:"type"`
	}
	if c.BodyParser(&in) != nil || in.Type == "" {
		return fiber.ErrBadRequest
	}
	var source models.Document
	if s.DB.Preload("Items").First(&source, c.Params("id")).Error != nil {
		return fiber.ErrNotFound
	}
	target := models.Document{Reference: ref(strings.ToUpper(in.Type[:min(3, len(in.Type))])), Type: in.Type, Status: "draft", CustomerID: source.CustomerID, ParentID: &source.ID, Total: source.Total, Notes: source.Notes}
	for _, x := range source.Items {
		target.Items = append(target.Items, models.DocumentItem{Description: x.Description, Quantity: x.Quantity, UnitPrice: x.UnitPrice, Total: x.Total})
	}
	if e := s.DB.Create(&target).Error; e != nil {
		return fiber.NewError(422, e.Error())
	}
	return c.Status(201).JSON(target)
}
