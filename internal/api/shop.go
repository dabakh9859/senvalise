package api

import (
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"senvalise/internal/auth"
	"senvalise/internal/models"
)

// API de la boutique en ligne.
//
// Les formes JSON reprennent celles que le site manipulait dans son
// localStorage — ref, colors, specs, gallery, vault.tx, addresses — pour que
// les pages n'aient pas a etre reecrites. C'est la gestion qui s'aligne.

const (
	minDeposit = 1000
	maxDeposit = 2000000
)

var depositMethods = map[string]string{
	"wave":          "Wave",
	"orange_money":  "Orange Money",
	"cash":          "Espèces en boutique",
	"bank_transfer": "Virement",
}

func (s *Server) RegisterShop(app *fiber.App) {
	g := app.Group("/api/shop")
	g.Get("/catalog", s.shopCatalog)
	g.Get("/zones", s.shopZones)
	// Mêmes garde-fous que côté gestion : la boutique est la porte la plus
	// exposée, et l'inscription se prête aussi au remplissage automatique.
	g.Post("/auth/register", loginLimiter(), s.shopRegister)
	g.Post("/auth/login", loginLimiter(), s.shopLogin)

	me := g.Group("", auth.Customer)
	me.Get("/me", s.shopMe)
	me.Put("/me", s.shopUpdateProfile)
	me.Put("/me/password", s.shopChangePassword)
	me.Delete("/me", s.shopDeleteAccount)
	me.Get("/addresses", s.shopAddresses)
	me.Post("/addresses", s.shopSaveAddress)
	me.Delete("/addresses/:id", s.shopRemoveAddress)
	me.Post("/addresses/:id/default", s.shopDefaultAddress)
	me.Get("/vault", s.shopVault)
	me.Post("/vault/deposit", s.shopDeposit)
	me.Put("/vault/goal", s.shopGoal)
	me.Get("/orders", s.shopOrders)
	me.Post("/orders/vault", s.shopPayFromVault)
}

// ---------- catalogue ----------

type shopSpecOut struct {
	K string `json:"k"`
	V string `json:"v"`
}

type shopProductOut struct {
	Ref      string        `json:"ref"`
	Name     string        `json:"name"`
	Category string        `json:"category"`
	Tag      string        `json:"tag"`
	Flag     string        `json:"flag"`
	Blurb    string        `json:"blurb"`
	Desc     string        `json:"desc"`
	Price    int64         `json:"price"`
	Volume   int           `json:"volume"`
	Weight   float64       `json:"weight"`
	Cabin    bool          `json:"cabin"`
	Stock    int64         `json:"stock"`
	Img      string        `json:"img"`
	Gallery  []string      `json:"gallery"`
	Colors   []string      `json:"colors"`
	Specs    []shopSpecOut `json:"specs"`
}

func (s *Server) shopCatalog(c *fiber.Ctx) error {
	var products []models.Product
	if e := s.DB.Where("active = true AND online = true").
		Preload("Images", func(db *gorm.DB) *gorm.DB { return db.Order("position asc, id asc") }).
		Preload("Specs", func(db *gorm.DB) *gorm.DB { return db.Order("position asc, id asc") }).
		Preload("Colorways", func(db *gorm.DB) *gorm.DB { return db.Order("position asc, id asc") }).
		Preload("Variants", "active = true").
		Order("position asc, id asc").Find(&products).Error; e != nil {
		return e
	}

	categories := map[uint]string{}
	var rows []models.Category
	s.DB.Find(&rows)
	for _, r := range rows {
		categories[r.ID] = r.Slug
	}

	out := make([]shopProductOut, 0, len(products))
	for _, p := range products {
		item := shopProductOut{
			Ref: p.Slug, Name: p.Name, Tag: p.Tag, Flag: p.Flag,
			Blurb: p.Blurb, Desc: p.Description,
			Volume: p.Volume, Weight: p.Weight, Cabin: p.Cabin,
			Gallery: []string{}, Colors: []string{}, Specs: []shopSpecOut{},
		}
		if p.CategoryID != nil {
			item.Category = categories[*p.CategoryID]
		}
		// Prix affiche : le plus bas des variantes actives, sinon rien a vendre.
		for _, v := range p.Variants {
			if item.Price == 0 || v.Price < item.Price {
				item.Price = v.Price
			}
			item.Stock += v.Stock
		}
		for _, img := range p.Images {
			item.Gallery = append(item.Gallery, img.URL)
		}
		if len(item.Gallery) > 0 {
			item.Img = item.Gallery[0]
		}
		for _, cw := range p.Colorways {
			item.Colors = append(item.Colors, cw.Slug)
		}
		for _, sp := range p.Specs {
			item.Specs = append(item.Specs, shopSpecOut{K: sp.Label, V: sp.Value})
		}
		out = append(out, item)
	}

	var colorways []models.Colorway
	s.DB.Order("position asc, id asc").Find(&colorways)
	tints := map[string]fiber.Map{}
	for _, cw := range colorways {
		tints[cw.Slug] = fiber.Map{"name": cw.Name, "hex": cw.Hex}
	}

	cats := []fiber.Map{{"id": "tout", "label": "Tout"}}
	for _, r := range rows {
		cats = append(cats, fiber.Map{"id": r.Slug, "label": r.Name})
	}

	fee, freeFrom := s.shippingConfig()
	return c.JSON(fiber.Map{
		"products": out, "colorways": tints, "categories": cats,
		"shipping": fiber.Map{"fee": fee, "freeFrom": freeFrom},
	})
}

func (s *Server) shippingConfig() (int64, int64) {
	fee, freeFrom := int64(4000), int64(100000)
	for key, target := range map[string]*int64{"shipping_fee": &fee, "shipping_free_from": &freeFrom} {
		var row models.Setting
		if s.DB.Where("key = ?", key).First(&row).Error == nil {
			var parsed int64
			if _, err := fmt.Sscanf(row.Value, "%d", &parsed); err == nil && parsed >= 0 {
				*target = parsed
			}
		}
	}
	return fee, freeFrom
}

func (s *Server) shopZones(c *fiber.Ctx) error {
	var zones []models.DeliveryZone
	if e := s.DB.Where("active = true").Order("area asc, name asc").Find(&zones).Error; e != nil {
		return e
	}
	out := make([]fiber.Map, 0, len(zones))
	for _, z := range zones {
		out = append(out, fiber.Map{
			"id": z.Slug, "name": z.Name, "area": z.Area,
			"lat": z.Lat, "lon": z.Lon, "delay": z.Delay, "fee": z.Fee,
		})
	}
	return c.JSON(out)
}

// ---------- comptes clients ----------

func customerJSON(c models.Customer) fiber.Map {
	return fiber.Map{"id": c.ID, "name": c.Name, "email": c.Email, "phone": c.Phone}
}

func (s *Server) shopRegister(c *fiber.Ctx) error {
	var in struct{ Name, Email, Phone, Password string }
	if c.BodyParser(&in) != nil {
		return fiber.ErrBadRequest
	}
	in.Name, in.Email = strings.TrimSpace(in.Name), strings.ToLower(strings.TrimSpace(in.Email))
	in.Phone = strings.TrimSpace(in.Phone)
	if len([]rune(in.Name)) < 2 {
		return fiber.NewError(422, "Le nom doit contenir au moins deux caractères.")
	}
	if !strings.Contains(in.Email, "@") || len(in.Email) < 6 {
		return fiber.NewError(422, "Adresse e-mail invalide.")
	}
	if len(in.Password) < 8 {
		return fiber.NewError(422, "Le mot de passe doit contenir au moins 8 caractères.")
	}
	var existing models.Customer
	err := s.DB.Where("lower(email) = ?", in.Email).First(&existing).Error
	if err == nil && existing.PasswordHash != "" {
		return fiber.NewError(409, "Un compte existe déjà avec cette adresse.")
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err == gorm.ErrRecordNotFound {
		// Le client peut deja exister s'il a ete cree au comptoir : on lui
		// ouvre l'acces en ligne au lieu de creer un doublon.
		existing = models.Customer{Name: in.Name, Email: in.Email, Phone: in.Phone}
	}
	existing.PasswordHash = string(hash)
	existing.Active = true
	if existing.Name == "" {
		existing.Name = in.Name
	}
	if existing.Phone == "" {
		existing.Phone = in.Phone
	}
	if e := s.DB.Save(&existing).Error; e != nil {
		return fiber.NewError(422, e.Error())
	}
	token, _ := auth.Sign(existing.ID, auth.RoleCustomer)
	return c.Status(201).JSON(fiber.Map{"token": token, "user": customerJSON(existing)})
}

func (s *Server) shopLogin(c *fiber.Ctx) error {
	var in struct{ Email, Password string }
	if c.BodyParser(&in) != nil {
		return fiber.ErrBadRequest
	}
	var customer models.Customer
	if s.DB.Where("lower(email) = ?", strings.ToLower(strings.TrimSpace(in.Email))).First(&customer).Error != nil ||
		customer.PasswordHash == "" ||
		bcrypt.CompareHashAndPassword([]byte(customer.PasswordHash), []byte(in.Password)) != nil ||
		!customer.Active {
		return c.Status(401).JSON(fiber.Map{"error": "Adresse ou mot de passe incorrect."})
	}
	token, _ := auth.Sign(customer.ID, auth.RoleCustomer)
	return c.JSON(fiber.Map{"token": token, "user": customerJSON(customer)})
}

func (s *Server) customer(c *fiber.Ctx) (models.Customer, error) {
	var row models.Customer
	if e := s.DB.First(&row, c.Locals("customerID")).Error; e != nil {
		return row, fiber.ErrUnauthorized
	}
	return row, nil
}

func (s *Server) shopMe(c *fiber.Ctx) error {
	row, err := s.customer(c)
	if err != nil {
		return err
	}
	return c.JSON(customerJSON(row))
}

func (s *Server) shopUpdateProfile(c *fiber.Ctx) error {
	row, err := s.customer(c)
	if err != nil {
		return err
	}
	var in struct{ Name, Phone string }
	if c.BodyParser(&in) != nil {
		return fiber.ErrBadRequest
	}
	if name := strings.TrimSpace(in.Name); len([]rune(name)) >= 2 {
		row.Name = name
	} else {
		return fiber.NewError(422, "Le nom doit contenir au moins deux caractères.")
	}
	row.Phone = strings.TrimSpace(in.Phone)
	if e := s.DB.Save(&row).Error; e != nil {
		return fiber.NewError(422, e.Error())
	}
	return c.JSON(customerJSON(row))
}

func (s *Server) shopChangePassword(c *fiber.Ctx) error {
	row, err := s.customer(c)
	if err != nil {
		return err
	}
	var in struct{ Current, Next string }
	if c.BodyParser(&in) != nil {
		return fiber.ErrBadRequest
	}
	if bcrypt.CompareHashAndPassword([]byte(row.PasswordHash), []byte(in.Current)) != nil {
		return fiber.NewError(422, "Mot de passe actuel incorrect.")
	}
	if len(in.Next) < 8 {
		return fiber.NewError(422, "Le nouveau mot de passe doit contenir au moins 8 caractères.")
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(in.Next), bcrypt.DefaultCost)
	row.PasswordHash = string(hash)
	if e := s.DB.Save(&row).Error; e != nil {
		return fiber.NewError(422, e.Error())
	}
	return c.SendStatus(204)
}

// Le client ferme son acces en ligne. La fiche est conservee : elle porte
// l'historique de ventes, et un coffre approvisionne ne s'efface pas.
func (s *Server) shopDeleteAccount(c *fiber.Ctx) error {
	row, err := s.customer(c)
	if err != nil {
		return err
	}
	var vault models.Vault
	if s.DB.Where("customer_id = ?", row.ID).First(&vault).Error == nil && vault.Balance > 0 {
		return fiber.NewError(409, fmt.Sprintf("Votre coffre contient encore %d F. Contactez la boutique avant de fermer le compte.", vault.Balance))
	}
	row.PasswordHash, row.Active = "", false
	if e := s.DB.Save(&row).Error; e != nil {
		return fiber.NewError(422, e.Error())
	}
	return c.SendStatus(204)
}

// ---------- adresses ----------

func (s *Server) shopAddresses(c *fiber.Ctx) error {
	row, err := s.customer(c)
	if err != nil {
		return err
	}
	var list []models.CustomerAddress
	s.DB.Where("customer_id = ?", row.ID).Order("is_default desc, id asc").Find(&list)
	return c.JSON(list)
}

func (s *Server) shopSaveAddress(c *fiber.Ctx) error {
	row, err := s.customer(c)
	if err != nil {
		return err
	}
	var in models.CustomerAddress
	if c.BodyParser(&in) != nil {
		return fiber.ErrBadRequest
	}
	in.Label, in.Zone, in.Detail = strings.TrimSpace(in.Label), strings.TrimSpace(in.Zone), strings.TrimSpace(in.Detail)
	if in.Label == "" || in.Zone == "" || in.Detail == "" {
		return fiber.NewError(422, "Libellé, zone et adresse sont obligatoires.")
	}
	var target models.CustomerAddress
	if in.ID != 0 {
		if s.DB.Where("id = ? AND customer_id = ?", in.ID, row.ID).First(&target).Error != nil {
			return fiber.ErrNotFound
		}
	} else {
		target = models.CustomerAddress{CustomerID: row.ID}
		var count int64
		s.DB.Model(&models.CustomerAddress{}).Where("customer_id = ?", row.ID).Count(&count)
		target.IsDefault = count == 0
	}
	target.Label, target.Zone, target.Detail = in.Label, in.Zone, in.Detail
	if e := s.DB.Save(&target).Error; e != nil {
		return fiber.NewError(422, e.Error())
	}
	return c.Status(201).JSON(target)
}

func (s *Server) shopRemoveAddress(c *fiber.Ctx) error {
	row, err := s.customer(c)
	if err != nil {
		return err
	}
	var target models.CustomerAddress
	if s.DB.Where("id = ? AND customer_id = ?", c.Params("id"), row.ID).First(&target).Error != nil {
		return fiber.ErrNotFound
	}
	if e := s.DB.Delete(&target).Error; e != nil {
		return fiber.NewError(422, e.Error())
	}
	// La liste ne doit jamais rester sans adresse par defaut.
	if target.IsDefault {
		var next models.CustomerAddress
		if s.DB.Where("customer_id = ?", row.ID).Order("id asc").First(&next).Error == nil {
			s.DB.Model(&next).Update("is_default", true)
		}
	}
	return c.SendStatus(204)
}

func (s *Server) shopDefaultAddress(c *fiber.Ctx) error {
	row, err := s.customer(c)
	if err != nil {
		return err
	}
	var target models.CustomerAddress
	if s.DB.Where("id = ? AND customer_id = ?", c.Params("id"), row.ID).First(&target).Error != nil {
		return fiber.ErrNotFound
	}
	if e := s.DB.Transaction(func(tx *gorm.DB) error {
		if e := tx.Model(&models.CustomerAddress{}).Where("customer_id = ?", row.ID).Update("is_default", false).Error; e != nil {
			return e
		}
		return tx.Model(&target).Update("is_default", true).Error
	}); e != nil {
		return fiber.NewError(422, e.Error())
	}
	return c.SendStatus(204)
}

// ---------- coffre ----------

func (s *Server) vaultOf(tx *gorm.DB, customerID uint) (models.Vault, error) {
	var vault models.Vault
	err := tx.Where("customer_id = ?", customerID).First(&vault).Error
	if err == gorm.ErrRecordNotFound {
		vault = models.Vault{CustomerID: customerID, Status: "open"}
		err = tx.Create(&vault).Error
	}
	return vault, err
}

func (s *Server) shopVault(c *fiber.Ctx) error {
	row, err := s.customer(c)
	if err != nil {
		return err
	}
	vault, e := s.vaultOf(s.DB, row.ID)
	if e != nil {
		return e
	}
	var deposits []models.VaultDeposit
	s.DB.Where("vault_id = ?", vault.ID).Order("id desc").Find(&deposits)
	tx := make([]fiber.Map, 0, len(deposits))
	for _, d := range deposits {
		tx = append(tx, fiber.Map{
			"id": d.ID, "amount": d.Amount, "method": d.Method,
			"label": depositMethods[d.Method], "reference": d.Reference,
			"at": d.CreatedAt.UnixMilli(),
		})
	}
	return c.JSON(fiber.Map{
		"balance": vault.Balance, "goal": vault.Goal, "goalRef": vault.GoalRef,
		"tx": tx, "min": minDeposit, "max": maxDeposit, "methods": depositMethods,
	})
}

func (s *Server) shopDeposit(c *fiber.Ctx) error {
	row, err := s.customer(c)
	if err != nil {
		return err
	}
	var in struct {
		Amount int64  `json:"amount"`
		Method string `json:"method"`
	}
	if c.BodyParser(&in) != nil {
		return fiber.ErrBadRequest
	}
	if in.Amount < minDeposit {
		return fiber.NewError(422, fmt.Sprintf("Montant minimum : %d F.", minDeposit))
	}
	if in.Amount > maxDeposit {
		return fiber.NewError(422, fmt.Sprintf("Montant maximum par versement : %d F.", maxDeposit))
	}
	if _, ok := depositMethods[in.Method]; !ok {
		return fiber.NewError(422, "Moyen de versement non accepté.")
	}
	var vault models.Vault
	if e := s.DB.Transaction(func(tx *gorm.DB) error {
		v, e := s.vaultOf(tx, row.ID)
		if e != nil {
			return e
		}
		if e := tx.Create(&models.VaultDeposit{
			VaultID: v.ID, Amount: in.Amount, Method: in.Method, Reference: s.ref("VER"),
		}).Error; e != nil {
			return e
		}
		v.Balance += in.Amount
		vault = v
		return tx.Save(&v).Error
	}); e != nil {
		return fiber.NewError(422, e.Error())
	}
	return c.Status(201).JSON(fiber.Map{"balance": vault.Balance})
}

func (s *Server) shopGoal(c *fiber.Ctx) error {
	row, err := s.customer(c)
	if err != nil {
		return err
	}
	var in struct {
		Amount int64  `json:"amount"`
		Ref    string `json:"ref"`
	}
	if c.BodyParser(&in) != nil {
		return fiber.ErrBadRequest
	}
	if in.Amount < 0 || in.Amount > maxDeposit*5 {
		return fiber.NewError(422, "Objectif hors limites.")
	}
	vault, e := s.vaultOf(s.DB, row.ID)
	if e != nil {
		return e
	}
	vault.Goal, vault.GoalRef = in.Amount, strings.TrimSpace(in.Ref)
	if e := s.DB.Save(&vault).Error; e != nil {
		return fiber.NewError(422, e.Error())
	}
	return c.JSON(fiber.Map{"goal": vault.Goal, "goalRef": vault.GoalRef})
}

// ---------- commandes ----------

func orderJSON(o models.Order) fiber.Map {
	lines := make([]fiber.Map, 0, len(o.Items))
	for _, i := range o.Items {
		lines = append(lines, fiber.Map{
			"ref": i.ProductName, "name": i.ProductName, "variantId": i.VariantID,
			"qty": i.Quantity, "price": i.UnitPrice, "total": i.Total,
		})
	}
	return fiber.Map{
		"id": o.Reference, "at": o.CreatedAt.UnixMilli(), "status": o.Status,
		"total": o.Total, "shipping": o.DeliveryFee, "zone": o.DeliveryZone,
		// parametres.html lit order.address.zone : l'adresse est un objet,
		// pas une chaine, comme du temps du stockage local.
		"address": fiber.Map{"label": "", "zone": o.DeliveryZone, "detail": o.Address},
		"method":  o.PaymentMethod, "lines": lines,
	}
}

func (s *Server) shopOrders(c *fiber.Ctx) error {
	row, err := s.customer(c)
	if err != nil {
		return err
	}
	var orders []models.Order
	s.DB.Where("customer_id = ?", row.ID).Preload("Items").Order("id desc").Find(&orders)
	out := make([]fiber.Map, 0, len(orders))
	for _, o := range orders {
		out = append(out, orderJSON(o))
	}
	return c.JSON(out)
}

// Paiement par le coffre : le seul moyen reellement branche. Le solde est
// verrouille le temps de la transaction, sinon deux onglets ouverts
// pourraient depenser deux fois le meme argent.
func (s *Server) shopPayFromVault(c *fiber.Ctx) error {
	row, err := s.customer(c)
	if err != nil {
		return err
	}
	var in struct {
		Lines []struct {
			Ref   string `json:"ref"`
			Qty   int64  `json:"qty"`
			Color string `json:"color"`
		} `json:"lines"`
		AddressID uint   `json:"addressId"`
		Zone      string `json:"zone"`
	}
	if c.BodyParser(&in) != nil || len(in.Lines) == 0 {
		return fiber.NewError(422, "Votre panier est vide.")
	}

	fee, freeFrom := s.shippingConfig()
	var order models.Order
	e := s.DB.Transaction(func(tx *gorm.DB) error {
		var vault models.Vault
		if err := tx.Clauses(lockForUpdate()).Where("customer_id = ?", row.ID).First(&vault).Error; err != nil {
			return fmt.Errorf("votre coffre est vide")
		}

		var subtotal int64
		items := []models.OrderItem{}
		for _, l := range in.Lines {
			if l.Qty <= 0 {
				return fmt.Errorf("quantité invalide")
			}
			var product models.Product
			if err := tx.Where("slug = ? AND online = true AND active = true", l.Ref).First(&product).Error; err != nil {
				return fmt.Errorf("article introuvable : %s", l.Ref)
			}
			var variant models.ProductVariant
			q := tx.Where("product_id = ? AND active = true", product.ID)
			if l.Color != "" {
				q = q.Where("lower(color) = ?", strings.ToLower(l.Color))
			}
			if err := q.Order("price asc").First(&variant).Error; err != nil {
				// Teinte non declinee en stock : on retombe sur la variante la
				// moins chere du produit plutot que de refuser la commande.
				if err := tx.Where("product_id = ? AND active = true", product.ID).Order("price asc").First(&variant).Error; err != nil {
					return fmt.Errorf("article indisponible : %s", product.Name)
				}
			}
			if variant.Stock < l.Qty {
				return fmt.Errorf("%s : il ne reste que %d pièce(s)", product.Name, variant.Stock)
			}
			line := variant.Price * l.Qty
			subtotal += line
			items = append(items, models.OrderItem{
				VariantID: variant.ID, ProductName: product.Name,
				Quantity: l.Qty, UnitPrice: variant.Price, Total: line,
			})
		}

		shipping := fee
		if freeFrom > 0 && subtotal >= freeFrom {
			shipping = 0
		}
		total := subtotal + shipping
		if vault.Balance < total {
			return fmt.Errorf("solde insuffisant : il manque %d F", total-vault.Balance)
		}

		address, zone := "", in.Zone
		if in.AddressID != 0 {
			var a models.CustomerAddress
			if tx.Where("id = ? AND customer_id = ?", in.AddressID, row.ID).First(&a).Error == nil {
				address, zone = a.Detail, a.Zone
			}
		}

		// Verrou exclusif sur le stock avant de créer la commande : la clé
		// étrangère des lignes pose sinon un verrou partagé que l'ajustement
		// devrait promouvoir, ce qui interbloque deux commandes simultanées
		// portant sur le même article.
		ids := make([]uint, 0, len(items))
		for _, item := range items {
			ids = append(ids, item.VariantID)
		}
		if _, err := lockVariants(tx, ids); err != nil {
			return err
		}

		order = models.Order{
			Reference: s.ref("CMD"), CustomerID: row.ID, Status: "pending",
			PaymentMethod: "vault", Total: total, DeliveryFee: shipping,
			DeliveryZone: zone, Address: address, Items: items,
		}
		if err := tx.Create(&order).Error; err != nil {
			return err
		}
		for _, item := range order.Items {
			if err := s.adjust(tx, item.VariantID, -item.Quantity, 0, "web_order", order.Reference); err != nil {
				return err
			}
		}
		vault.Balance -= total
		if err := tx.Save(&vault).Error; err != nil {
			return err
		}
		return tx.Create(&models.VaultDeposit{
			VaultID: vault.ID, Amount: -total, Method: "order", Reference: order.Reference,
		}).Error
	})
	if e != nil {
		return fiber.NewError(422, e.Error())
	}
	s.DB.Preload("Items").First(&order, order.ID)
	return c.Status(201).JSON(orderJSON(order))
}

// Suivi indicatif, calcule depuis l'age de la commande tant qu'aucun
// transporteur n'est branche. Le statut reel du back-office prime.
func orderStep(o models.Order) int {
	if o.Status == "delivered" {
		return 3
	}
	switch age := time.Since(o.CreatedAt); {
	case age < 2*time.Hour:
		return 0
	case age < 24*time.Hour:
		return 1
	case age < 72*time.Hour:
		return 2
	default:
		return 3
	}
}
