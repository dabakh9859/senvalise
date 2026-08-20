package api

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
	"senvalise/internal/models"
)

// Administration de la boutique en ligne.
//
// Le CRUD générique suffit pour éditer une ligne, pas pour tenir un commerce :
// une commande se suit dans un pipeline et finit en facture, un catalogue se
// met en vitrine (en ligne, mis en avant, ordre d'affichage), et la livraison
// se règle en un endroit. Ces routes servent ces gestes-là ; la vitrine, elle,
// continue de lire les mêmes tables via /api/shop.

// Enchaînement autorisé des statuts d'une commande. Une commande livrée est
// terminale : on ne la rouvre pas, on passe par un retour.
var orderFlow = map[string][]string{
	"pending":    {"processing", "cancelled"},
	"processing": {"shipped", "cancelled"},
	"shipped":    {"delivered", "cancelled"},
	"delivered":  {},
	"cancelled":  {},
}

func (s *Server) registerShopAdmin(g fiber.Router) {
	g.Get("/overview", s.shopOverview)
	g.Get("/orders", s.shopAdminOrders)
	g.Post("/orders/:id/status", s.shopAdminOrderStatus)
	g.Post("/orders/:id/invoice", s.shopAdminOrderInvoice)
	g.Get("/catalog", s.shopAdminCatalog)
	g.Put("/catalog/:id", s.shopAdminCatalogUpdate)
	g.Post("/catalog/reorder", s.shopAdminReorder)
	g.Get("/customers", s.shopAdminCustomers)
	g.Get("/delivery", s.shopAdminDelivery)
	g.Put("/delivery", s.shopAdminDeliveryUpdate)
}

// ---------------------------------------------------------------- vue d'ensemble

func (s *Server) shopOverview(c *fiber.Ctx) error {
	now := time.Now()
	month := now.AddDate(0, 0, -30)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	type statusCount struct {
		Status string `json:"status"`
		Count  int64  `json:"count"`
		Amount int64  `json:"amount"`
	}
	statuses := make([]statusCount, 0)
	s.DB.Raw(`select status, count(*) count, coalesce(sum(total),0) amount from orders group by status`).Scan(&statuses)

	var monthOrders, monthRevenue, todayOrders, toProcess, unlinked int64
	s.DB.Raw(`select count(*) from orders where created_at >= ? and status <> 'cancelled'`, month).Scan(&monthOrders)
	s.DB.Raw(`select coalesce(sum(total),0) from orders where created_at >= ? and status <> 'cancelled'`, month).Scan(&monthRevenue)
	s.DB.Raw(`select count(*) from orders where created_at >= ?`, today).Scan(&todayOrders)
	s.DB.Raw(`select count(*) from orders where status in ('pending','processing')`).Scan(&toProcess)
	s.DB.Raw(`select count(*) from orders where sale_id is null and status in ('shipped','delivered')`).Scan(&unlinked)

	var online, offline, emptyOnline, featured int64
	s.DB.Raw(`select count(*) from products where active = true and online = true`).Scan(&online)
	s.DB.Raw(`select count(*) from products where active = true and online = false`).Scan(&offline)
	s.DB.Raw(`select count(*) from products p where p.active = true and p.online = true
		and not exists (select 1 from product_variants v where v.product_id = p.id and v.active = true and v.stock > 0)`).Scan(&emptyOnline)
	s.DB.Raw(`select count(*) from products where active = true and online = true and featured = true`).Scan(&featured)

	var accounts, newAccounts, vaults, vaultBalance, pendingMessages int64
	s.DB.Raw(`select count(*) from customers where password_hash <> ''`).Scan(&accounts)
	s.DB.Raw(`select count(*) from customers where password_hash <> '' and created_at >= ?`, month).Scan(&newAccounts)
	s.DB.Raw(`select count(*) from vaults where status = 'open'`).Scan(&vaults)
	s.DB.Raw(`select coalesce(sum(balance),0) from vaults`).Scan(&vaultBalance)
	s.DB.Raw(`select count(*) from contact_messages where status in ('new','pending','processing')`).Scan(&pendingMessages)

	type namedValue struct {
		Name  string `json:"name"`
		Count int64  `json:"count"`
		Value int64  `json:"value"`
	}
	top := make([]namedValue, 0)
	// Le rapprochement passe par la déclinaison, pas par le libellé stocké dans
	// la ligne de commande : un produit renommé ne doit pas sortir des ventes.
	s.DB.Raw(`select coalesce(p.name, oi.product_name) name, coalesce(sum(oi.quantity),0) count, coalesce(sum(oi.total),0) value
		from order_items oi join orders o on o.id = oi.order_id
		left join product_variants v on v.id = oi.variant_id
		left join products p on p.id = v.product_id
		where o.created_at >= ? and o.status <> 'cancelled'
		group by coalesce(p.name, oi.product_name) order by value desc limit 6`, month).Scan(&top)

	zones := make([]namedValue, 0)
	s.DB.Raw(`select coalesce(nullif(delivery_zone,''),'Non précisée') name, count(*) count, coalesce(sum(total),0) value
		from orders where created_at >= ? and status <> 'cancelled'
		group by 1 order by count desc limit 8`, month).Scan(&zones)

	recent := []models.Order{}
	s.DB.Preload("Items").Order("created_at desc").Limit(6).Find(&recent)

	basket := int64(0)
	if monthOrders > 0 {
		basket = monthRevenue / monthOrders
	}
	return c.JSON(fiber.Map{
		"statuses": statuses,
		"orders": fiber.Map{"month": monthOrders, "revenue": monthRevenue, "today": todayOrders,
			"toProcess": toProcess, "basket": basket, "toInvoice": unlinked},
		"catalog":   fiber.Map{"online": online, "offline": offline, "empty": emptyOnline, "featured": featured},
		"customers": fiber.Map{"accounts": accounts, "new": newAccounts, "vaults": vaults, "vaultBalance": vaultBalance},
		"messages":  pendingMessages,
		"top":       top,
		"zones":     zones,
		"recent":    recent,
	})
}

// ---------------------------------------------------------------------- commandes

func (s *Server) shopAdminOrders(c *fiber.Ctx) error {
	db := s.DB.Preload("Items").Order("created_at desc")
	if status := c.Query("status"); status != "" && status != "all" {
		db = db.Where("status = ?", status)
	}
	rows := []models.Order{}
	if e := db.Limit(400).Find(&rows).Error; e != nil {
		return e
	}
	// Le nom du client vit dans une autre table : on l'attache ici plutôt que
	// de faire relire chaque commande par le navigateur.
	names := map[uint]models.Customer{}
	ids := make([]uint, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.CustomerID)
	}
	if len(ids) > 0 {
		customers := []models.Customer{}
		s.DB.Where("id in ?", ids).Find(&customers)
		for _, customer := range customers {
			names[customer.ID] = customer
		}
	}
	out := make([]fiber.Map, 0, len(rows))
	for _, row := range rows {
		customer := names[row.CustomerID]
		units := int64(0)
		for _, item := range row.Items {
			units += item.Quantity
		}
		out = append(out, fiber.Map{
			"id": row.ID, "reference": row.Reference, "createdAt": row.CreatedAt, "status": row.Status,
			"paymentMethod": row.PaymentMethod, "total": row.Total, "deliveryFee": row.DeliveryFee,
			"deliveryZone": row.DeliveryZone, "address": row.Address, "saleId": row.SaleID,
			"customerId": row.CustomerID, "customer": customer.Name, "phone": customer.Phone,
			"email": customer.Email, "items": row.Items, "units": units,
			"next": orderFlow[row.Status],
		})
	}
	return c.JSON(out)
}

func (s *Server) shopAdminOrderStatus(c *fiber.Ctx) error {
	var in struct {
		Status string `json:"status"`
	}
	if c.BodyParser(&in) != nil || in.Status == "" {
		return fiber.ErrBadRequest
	}
	var order models.Order
	if e := s.DB.First(&order, c.Params("id")).Error; e != nil {
		return e
	}
	allowed := false
	for _, next := range orderFlow[order.Status] {
		if next == in.Status {
			allowed = true
			break
		}
	}
	if !allowed {
		return fiber.NewError(422, fmt.Sprintf("Passage de « %s » à « %s » impossible.", orderStatusLabel(order.Status), orderStatusLabel(in.Status)))
	}
	if e := s.DB.Model(&order).Update("status", in.Status).Error; e != nil {
		return e
	}
	s.log(c, "order-status", "orders", order.ID, order.Reference+" → "+in.Status)
	return c.JSON(order)
}

// shopAdminOrderInvoice transforme une commande web en facture : elle sort le
// stock, crée la vente et garde le lien. Les frais de livraison entrent dans le
// total facturé sans ligne d'article — leur contrepartie est une dépense de
// transport, pas un coût d'achat.
func (s *Server) shopAdminOrderInvoice(c *fiber.Ctx) error {
	var in struct {
		Paid bool `json:"paid"`
	}
	_ = c.BodyParser(&in)

	var order models.Order
	if e := s.DB.Preload("Items").First(&order, c.Params("id")).Error; e != nil {
		return e
	}
	if order.SaleID != nil {
		return fiber.NewError(422, "Cette commande a déjà été facturée.")
	}
	if order.Status == "cancelled" {
		return fiber.NewError(422, "Une commande annulée ne se facture pas.")
	}
	if len(order.Items) == 0 {
		return fiber.NewError(422, "Cette commande ne contient aucune ligne.")
	}
	defaults := s.readCheckoutSettings().InvoiceDefaults
	userID, _ := c.Locals("userID").(uint)
	customerID := order.CustomerID
	sale := models.Sale{
		Reference: ref("WEB"), CustomerID: &customerID, UserID: userID, Channel: "online",
		PaymentMethod: order.PaymentMethod, InvoiceCompanyName: defaults.CompanyName,
		InvoiceTagline: defaults.Tagline, InvoicePhone: defaults.Phone, InvoiceAddress: defaults.Address,
		InvoiceThankYouTitle: defaults.ThankYouTitle, InvoiceFooterNote: defaults.FooterNote,
		CompanySignatureURL: defaults.CompanySignature,
	}
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		if e := tx.Create(&sale).Error; e != nil {
			return e
		}
		var subtotal int64
		for _, item := range order.Items {
			var variant models.ProductVariant
			if e := tx.First(&variant, item.VariantID).Error; e != nil {
				return fmt.Errorf("article introuvable pour « %s »", item.ProductName)
			}
			total := item.UnitPrice * item.Quantity
			subtotal += total
			line := models.SaleItem{SaleID: sale.ID, VariantID: variant.ID, Quantity: item.Quantity,
				UnitPrice: item.UnitPrice, UnitCost: variant.Cost, Total: total}
			if e := tx.Create(&line).Error; e != nil {
				return e
			}
			if e := s.adjust(tx, variant.ID, -item.Quantity, userID, "commande web", sale.Reference); e != nil {
				return e
			}
		}
		sale.Subtotal = subtotal
		sale.Total = subtotal + order.DeliveryFee
		sale.Status = "pending"
		if in.Paid {
			sale.Paid = sale.Total
			sale.Status = "paid"
			if e := tx.Create(&models.SalePayment{SaleID: sale.ID, UserID: userID, Method: order.PaymentMethod,
				Amount: sale.Total, Status: "active", Reference: "WEB-" + order.Reference}).Error; e != nil {
				return e
			}
		}
		if e := tx.Model(&sale).Select("subtotal", "total", "paid", "status").Updates(&sale).Error; e != nil {
			return e
		}
		return tx.Model(&models.Order{}).Where("id = ?", order.ID).Update("sale_id", sale.ID).Error
	})
	if err != nil {
		return fiber.NewError(422, err.Error())
	}
	s.log(c, "order-invoice", "orders", order.ID, order.Reference+" → "+sale.Reference)
	return c.JSON(fiber.Map{"sale": sale, "orderId": order.ID})
}

func orderStatusLabel(status string) string {
	switch status {
	case "pending":
		return "en attente"
	case "processing":
		return "en préparation"
	case "shipped":
		return "expédiée"
	case "delivered":
		return "livrée"
	case "cancelled":
		return "annulée"
	}
	return status
}

// ----------------------------------------------------------------- catalogue

func (s *Server) shopAdminCatalog(c *fiber.Ctx) error {
	type row struct {
		ID       uint   `json:"id"`
		Name     string `json:"name"`
		Slug     string `json:"slug"`
		Category string `json:"category"`
		Active   bool   `json:"active"`
		Online   bool   `json:"online"`
		Featured bool   `json:"featured"`
		Position int    `json:"position"`
		Tag      string `json:"tag"`
		Flag     string `json:"flag"`
		Blurb    string `json:"blurb"`
		Image    string `json:"image"`
		Variants int64  `json:"variants"`
		Stock    int64  `json:"stock"`
		Price    int64  `json:"price"`
		Images   int64  `json:"images"`
		Sold     int64  `json:"sold"`
	}
	rows := make([]row, 0)
	since := time.Now().AddDate(0, 0, -30)
	s.DB.Raw(`select p.id, p.name, p.slug, coalesce(c.name,'Sans catégorie') category,
		p.active, p.online, p.featured, p.position, p.tag, p.flag, p.blurb,
		coalesce((select url from product_images i where i.product_id=p.id order by i.primary desc, i.position asc, i.id asc limit 1),'') image,
		(select count(*) from product_variants v where v.product_id=p.id and v.active=true) variants,
		coalesce((select sum(greatest(v.stock,0)) from product_variants v where v.product_id=p.id and v.active=true),0) stock,
		coalesce((select min(v.price) from product_variants v where v.product_id=p.id and v.active=true),0) price,
		(select count(*) from product_images i where i.product_id=p.id) images,
		coalesce((select sum(oi.quantity) from order_items oi
			join orders o on o.id=oi.order_id
			join product_variants v on v.id=oi.variant_id
			where v.product_id=p.id and o.created_at >= ? and o.status <> 'cancelled'),0) sold
		from products p left join categories c on c.id=p.category_id
		order by p.online desc, p.position asc, p.name asc`, since).Scan(&rows)
	return c.JSON(rows)
}

func (s *Server) shopAdminCatalogUpdate(c *fiber.Ctx) error {
	var in struct {
		Online   *bool   `json:"online"`
		Featured *bool   `json:"featured"`
		Active   *bool   `json:"active"`
		Position *int    `json:"position"`
		Tag      *string `json:"tag"`
		Flag     *string `json:"flag"`
		Blurb    *string `json:"blurb"`
	}
	if c.BodyParser(&in) != nil {
		return fiber.ErrBadRequest
	}
	var product models.Product
	if e := s.DB.First(&product, c.Params("id")).Error; e != nil {
		return e
	}
	changes := map[string]any{}
	if in.Online != nil {
		changes["online"] = *in.Online
	}
	if in.Featured != nil {
		changes["featured"] = *in.Featured
	}
	if in.Active != nil {
		changes["active"] = *in.Active
	}
	if in.Position != nil {
		changes["position"] = *in.Position
	}
	if in.Tag != nil {
		changes["tag"] = *in.Tag
	}
	if in.Flag != nil {
		changes["flag"] = *in.Flag
	}
	if in.Blurb != nil {
		changes["blurb"] = *in.Blurb
	}
	if len(changes) == 0 {
		return c.JSON(product)
	}
	if e := s.DB.Model(&product).Updates(changes).Error; e != nil {
		return e
	}
	s.log(c, "catalog", "products", product.ID, product.Name)
	return c.JSON(product)
}

// shopAdminReorder enregistre l'ordre de la vitrine en un seul aller-retour :
// la position est un rang dense, ce qui évite les trous après un glissement.
func (s *Server) shopAdminReorder(c *fiber.Ctx) error {
	var in struct {
		Order []uint `json:"order"`
	}
	if c.BodyParser(&in) != nil || len(in.Order) == 0 {
		return fiber.ErrBadRequest
	}
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		for index, id := range in.Order {
			if e := tx.Model(&models.Product{}).Where("id = ?", id).Update("position", index).Error; e != nil {
				return e
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	return c.SendStatus(204)
}

// ------------------------------------------------------------------- clients

func (s *Server) shopAdminCustomers(c *fiber.Ctx) error {
	type row struct {
		ID        uint       `json:"id"`
		Name      string     `json:"name"`
		Phone     string     `json:"phone"`
		Email     string     `json:"email"`
		Zone      string     `json:"zone"`
		CreatedAt time.Time  `json:"createdAt"`
		Addresses int64      `json:"addresses"`
		Orders    int64      `json:"orders"`
		Spent     int64      `json:"spent"`
		LastOrder *time.Time `json:"lastOrder"`
		Vault     int64      `json:"vault"`
		Consent   bool       `json:"consent"`
	}
	rows := make([]row, 0)
	s.DB.Raw(`select cu.id, cu.name, cu.phone, cu.email, cu.zone, cu.created_at,
		cu.whats_app_consent consent,
		(select count(*) from customer_addresses a where a.customer_id=cu.id) addresses,
		(select count(*) from orders o where o.customer_id=cu.id and o.status <> 'cancelled') orders,
		coalesce((select sum(o.total) from orders o where o.customer_id=cu.id and o.status <> 'cancelled'),0) spent,
		(select max(o.created_at) from orders o where o.customer_id=cu.id) last_order,
		coalesce((select v.balance from vaults v where v.customer_id=cu.id),0) vault
		from customers cu where cu.password_hash <> ''
		order by last_order desc nulls last, cu.created_at desc`).Scan(&rows)
	return c.JSON(rows)
}

// ------------------------------------------------------------------ livraison

func (s *Server) shopAdminDelivery(c *fiber.Ctx) error {
	zones := []models.DeliveryZone{}
	s.DB.Order("area asc, name asc").Find(&zones)
	fee, freeFrom := s.shippingConfig()
	return c.JSON(fiber.Map{"zones": zones, "fee": fee, "freeFrom": freeFrom})
}

func (s *Server) shopAdminDeliveryUpdate(c *fiber.Ctx) error {
	var in struct {
		Fee      *int64 `json:"fee"`
		FreeFrom *int64 `json:"freeFrom"`
		Zones    []struct {
			ID     uint   `json:"id"`
			Fee    int64  `json:"fee"`
			Delay  string `json:"delay"`
			Active bool   `json:"active"`
		} `json:"zones"`
	}
	if c.BodyParser(&in) != nil {
		return fiber.ErrBadRequest
	}
	if in.Fee != nil && *in.Fee < 0 || in.FreeFrom != nil && *in.FreeFrom < 0 {
		return fiber.NewError(422, "Les montants de livraison ne peuvent pas être négatifs.")
	}
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		save := func(key string, value int64) error {
			var row models.Setting
			if tx.Where("key = ?", key).First(&row).Error == gorm.ErrRecordNotFound {
				return tx.Create(&models.Setting{Key: key, Value: fmt.Sprintf("%d", value)}).Error
			}
			return tx.Model(&row).Update("value", fmt.Sprintf("%d", value)).Error
		}
		if in.Fee != nil {
			if e := save("shipping_fee", *in.Fee); e != nil {
				return e
			}
		}
		if in.FreeFrom != nil {
			if e := save("shipping_free_from", *in.FreeFrom); e != nil {
				return e
			}
		}
		for _, zone := range in.Zones {
			if e := tx.Model(&models.DeliveryZone{}).Where("id = ?", zone.ID).
				Updates(map[string]any{"fee": zone.Fee, "delay": zone.Delay, "active": zone.Active}).Error; e != nil {
				return e
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	s.log(c, "delivery", "settings", 0, "réglages de livraison")
	return s.shopAdminDelivery(c)
}

// log trace une action d'administration de la boutique. Le journal d'activité
// existait comme ressource sans que rien ne l'alimente : les gestes qui
// changent l'état de la vitrine y laissent désormais une ligne.
func (s *Server) log(c *fiber.Ctx, action, entity string, id uint, details string) {
	userID, _ := c.Locals("userID").(uint)
	_ = s.DB.Create(&models.ActivityLog{UserID: userID, Action: action, Entity: entity, EntityID: id, Details: details}).Error
}
