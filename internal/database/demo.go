package database

import (
	"fmt"
	"os"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"senvalise/internal/models"
)

// Mot de passe unique des comptes de démonstration (équipe et clients).
const demoPassword = "Demo1234!"

// seedDemo remplit les modules de gestion. Le catalogue vient déjà de
// seedShop ; ici on ajoute la vie de la boutique — équipe, fournisseurs,
// clients, arrivage, ventes, caisse, dépenses, commandes web — étalée sur les
// deux mois écoulés pour que le tableau de bord et les rapports aient de la
// matière dès le premier démarrage.
//
// Le jeu n'est écrit que si SEED_DEMO vaut "true" et qu'aucune vente n'existe :
// une boutique réelle ne peut donc jamais se retrouver avec ces lignes.
func seedDemo(db *gorm.DB) error {
	if os.Getenv("SEED_DEMO") != "true" {
		return nil
	}
	var existing int64
	db.Model(&models.Sale{}).Count(&existing)
	if existing > 0 {
		return nil
	}
	var variants []models.ProductVariant
	if err := db.Order("id").Find(&variants).Error; err != nil {
		return err
	}
	if len(variants) < 4 {
		return nil // catalogue pas encore en place, rien à raccrocher
	}
	// Le plan de démonstration cible des variantes par rang ; le modulo évite
	// toute dépendance au nombre exact d'articles du catalogue.
	pick := func(i int) models.ProductVariant { return variants[i%len(variants)] }

	// Libellé lisible des lignes de commande : le nom du produit, pas le SKU.
	productName := map[uint]string{}
	var catalogue []models.Product
	db.Find(&catalogue)
	for _, item := range catalogue {
		productName[item.ID] = item.Name
	}

	var manager models.User
	if err := db.Order("id").First(&manager).Error; err != nil {
		return err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(demoPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	pass := string(hash)
	now := time.Now()
	at := func(daysAgo, hour int) time.Time {
		d := now.AddDate(0, 0, -daysAgo)
		return time.Date(d.Year(), d.Month(), d.Day(), hour, 30, 0, 0, d.Location())
	}
	stamp := func(t time.Time) models.Base { return models.Base{CreatedAt: t, UpdatedAt: t} }
	create := func(label string, value any) error {
		if e := db.Create(value).Error; e != nil {
			return fmt.Errorf("démo %s: %w", label, e)
		}
		return nil
	}

	// --- Équipe ------------------------------------------------------------
	staff := []models.User{
		{Base: stamp(at(75, 9)), Name: "Awa Ndiaye", Email: "awa@senvalise.sn", PasswordHash: pass, Role: "vendor", Active: true},
		{Base: stamp(at(75, 9)), Name: "Moussa Fall", Email: "moussa@senvalise.sn", PasswordHash: pass, Role: "vendor", Active: true},
	}
	for i := range staff {
		if e := create("équipe", &staff[i]); e != nil {
			return e
		}
	}
	sellers := []uint{manager.ID, staff[0].ID, staff[1].ID}

	// --- Marques et fournisseurs -------------------------------------------
	for i, b := range []struct{ Name, Slug string }{
		{"SenValise", "senvalise"},
		{"Sahel Cuir", "sahel-cuir"},
		{"Atlas Bagage", "atlas-bagage"},
	} {
		if e := create("marque", &models.Brand{Base: stamp(at(74-i, 9)), Name: b.Name, Slug: b.Slug}); e != nil {
			return e
		}
	}
	suppliers := []models.Supplier{
		{Base: stamp(at(72, 9)), Name: "Guangzhou Luggage Co.", Phone: "+86 20 8888 1234", Email: "sales@gzluggage.cn", Address: "Baiyun, Guangzhou"},
		{Base: stamp(at(72, 10)), Name: "Sahel Cuir SARL", Phone: "+221 33 821 44 20", Email: "contact@sahelcuir.sn", Address: "Zone industrielle, Dakar"},
		{Base: stamp(at(71, 9)), Name: "Transit Dakar Express", Phone: "+221 33 849 10 05", Email: "ops@transitdakar.sn", Address: "Môle 2, Port de Dakar"},
	}
	for i := range suppliers {
		if e := create("fournisseur", &suppliers[i]); e != nil {
			return e
		}
	}

	// --- Clients ------------------------------------------------------------
	type customerSpec struct {
		Name, Phone, Email, Zone, Address string
		Online                            bool
	}
	specs := []customerSpec{
		{"Fatou Diop", "+221 77 512 30 11", "fatou.diop@example.sn", "Point E et Fann", "Rue 10, Point E, Dakar", true},
		{"Cheikh Sarr", "+221 76 640 18 902", "cheikh.sarr@example.sn", "Almadies et Ngor", "Route des Almadies, Dakar", true},
		{"Aminata Bâ", "+221 78 330 77 45", "aminata.ba@example.sn", "Mermoz et Sacré-Cœur", "Cité Mermoz, villa 42", true},
		{"Ousmane Diallo", "+221 77 208 64 30", "ousmane.diallo@example.sn", "Dakar Plateau", "Avenue Pompidou, Plateau", false},
		{"Mariama Sow", "+221 70 915 22 08", "mariama.sow@example.sn", "Parcelles Assainies", "Unité 15, Parcelles", false},
		{"Ibrahima Ndour", "+221 77 744 09 61", "ibrahima.ndour@example.sn", "Thiès", "Quartier Randoulène, Thiès", false},
		{"Khady Camara", "+221 76 118 53 77", "khady.camara@example.sn", "Guédiawaye", "Cité Sotiba, Guédiawaye", false},
		{"Serigne Mbaye", "+221 78 402 91 36", "serigne.mbaye@example.sn", "Mbour et Saly", "Saly Portudal, Mbour", false},
	}
	customers := make([]models.Customer, 0, len(specs))
	for i, s := range specs {
		c := models.Customer{
			Base: stamp(at(70-i, 11)), Name: s.Name, Phone: s.Phone, Email: s.Email,
			Address: s.Address, Zone: s.Zone, Active: true, WhatsAppConsent: i%2 == 0,
		}
		if s.Online {
			c.PasswordHash = pass
		}
		if e := create("client", &c); e != nil {
			return e
		}
		if s.Online {
			if e := create("adresse", &models.CustomerAddress{
				Base: stamp(at(70-i, 11)), CustomerID: c.ID, Label: "Domicile",
				Zone: s.Zone, Detail: s.Address, IsDefault: true,
			}); e != nil {
				return e
			}
		}
		customers = append(customers, c)
	}

	// --- Coûts d'achat et seuils d'alerte -----------------------------------
	// La marge cible de la boutique est d'environ 45 % : le coût se déduit du
	// prix de vente, ce qui rend les rapports de marge exploitables.
	cost := map[uint]int64{}
	for _, v := range variants {
		cost[v.ID] = v.Price * 55 / 100
		if e := db.Model(&models.ProductVariant{}).Where("id = ?", v.ID).
			Updates(map[string]any{"cost": cost[v.ID], "alert_at": 3}).Error; e != nil {
			return fmt.Errorf("démo coût variante: %w", e)
		}
	}

	// Stock tenu en mémoire pour que chaque mouvement porte un avant/après
	// exact, comme le fait adjust() côté API.
	level := map[uint]int64{}
	move := func(variantID uint, qty int64, userID uint, reason, reference string, t time.Time) error {
		before := level[variantID]
		after := before + qty
		if after < 0 {
			return fmt.Errorf("démo stock: %s passerait à %d", reference, after)
		}
		level[variantID] = after
		kind := "out"
		if qty > 0 {
			kind = "in"
		}
		return create("mouvement", &models.StockMovement{
			Base: stamp(t), VariantID: variantID, UserID: userID, Type: kind, Reason: reason,
			Quantity: qty, StockBefore: before, StockAfter: after, Reference: reference,
		})
	}

	// --- Arrivages ----------------------------------------------------------
	received := at(60, 10)
	arrival := models.Arrival{
		Base: stamp(at(68, 9)), Reference: "ARR-2025-001", SupplierID: &suppliers[0].ID,
		Status: "received", Currency: "CNY", ExchangeRate: 84.5,
		Shipping: 1250000, Customs: 640000, OtherFees: 180000, ReceivedAt: &received,
	}
	for _, v := range variants {
		arrival.Items = append(arrival.Items, models.ArrivalItem{
			Base: stamp(at(68, 9)), VariantID: v.ID, Quantity: 24,
			UnitCost: cost[v.ID], LandedCost: cost[v.ID] * 108 / 100,
		})
	}
	if e := create("arrivage", &arrival); e != nil {
		return e
	}
	for _, it := range arrival.Items {
		if e := move(it.VariantID, it.Quantity, manager.ID, "reception", arrival.Reference, received); e != nil {
			return e
		}
	}
	pending := models.Arrival{
		Base: stamp(at(6, 9)), Reference: "ARR-2025-002", SupplierID: &suppliers[1].ID,
		Status: "draft", Currency: "XOF", ExchangeRate: 1, Shipping: 320000, Customs: 0, OtherFees: 45000,
		Items: []models.ArrivalItem{
			{Base: stamp(at(6, 9)), VariantID: pick(0).ID, Quantity: 12, UnitCost: cost[pick(0).ID], LandedCost: cost[pick(0).ID]},
			{Base: stamp(at(6, 9)), VariantID: pick(3).ID, Quantity: 18, UnitCost: cost[pick(3).ID], LandedCost: cost[pick(3).ID]},
		},
	}
	if e := create("arrivage", &pending); e != nil {
		return e
	}

	// --- Ventes -------------------------------------------------------------
	type line struct{ Variant, Qty int }
	type saleSpec struct {
		DaysAgo, Hour, Customer int // Customer = -1 pour un client de passage
		Lines                   []line
		Method                  string
		PaidRatio               int // pourcentage réglé
		Channel                 string
		Discount                int64
	}
	plan := []saleSpec{
		{54, 11, 0, []line{{0, 1}}, "cash", 100, "pos", 0},
		{48, 16, 1, []line{{2, 1}, {7, 2}}, "wave", 100, "pos", 5000},
		{41, 10, 3, []line{{6, 3}}, "orange_money", 100, "pos", 0},
		{35, 15, 2, []line{{4, 1}}, "card", 100, "online", 0},
		{29, 12, -1, []line{{7, 1}}, "cash", 100, "pos", 0},
		{24, 17, 4, []line{{1, 1}, {6, 1}}, "credit", 40, "pos", 0},
		{21, 11, 5, []line{{3, 2}}, "wave", 100, "pos", 3000},
		{18, 14, 0, []line{{5, 1}}, "cash", 100, "pos", 0},
		{15, 10, 6, []line{{0, 1}, {7, 1}}, "orange_money", 100, "online", 0},
		{12, 18, 7, []line{{2, 1}}, "bank_transfer", 60, "pos", 0},
		{9, 13, 1, []line{{6, 2}}, "cash", 100, "pos", 0},
		{6, 11, -1, []line{{3, 1}}, "wave", 100, "pos", 0},
		{3, 16, 2, []line{{1, 1}, {7, 3}}, "card", 100, "pos", 8000},
		{1, 12, 4, []line{{5, 1}, {6, 1}}, "cash", 100, "pos", 0},
	}
	sales := make([]models.Sale, 0, len(plan))
	for i, p := range plan {
		when := at(p.DaysAgo, p.Hour)
		seller := sellers[i%len(sellers)]
		sale := models.Sale{
			Base: stamp(when), Reference: fmt.Sprintf("FAC-%s-%03d", when.Format("200601"), i+1),
			UserID: seller, Channel: p.Channel, PaymentMethod: p.Method, Discount: p.Discount,
			InvoiceCompanyName: "SenValise", InvoiceTagline: "Valises et bagages, Dakar",
			InvoicePhone: "+221 33 800 12 12", InvoiceAddress: "Avenue Cheikh Anta Diop, Dakar",
		}
		if p.Customer >= 0 {
			sale.CustomerID = &customers[p.Customer].ID
		}
		var subtotal int64
		for _, l := range p.Lines {
			v := pick(l.Variant)
			total := v.Price * int64(l.Qty)
			subtotal += total
			sale.Items = append(sale.Items, models.SaleItem{
				Base: stamp(when), VariantID: v.ID, Quantity: int64(l.Qty),
				UnitPrice: v.Price, UnitCost: cost[v.ID], Total: total,
			})
		}
		sale.Subtotal = subtotal
		sale.Total = subtotal - p.Discount
		sale.Paid = sale.Total * int64(p.PaidRatio) / 100
		switch {
		case sale.Paid >= sale.Total:
			sale.Status = "paid"
		case sale.Paid > 0:
			sale.Status = "partial"
		default:
			sale.Status = "pending"
		}
		if e := create("vente", &sale); e != nil {
			return e
		}
		if sale.Paid > 0 {
			if e := create("règlement", &models.SalePayment{
				Base: stamp(when), SaleID: sale.ID, UserID: seller, Method: p.Method,
				Amount: sale.Paid, Status: "active", Reference: "REG-" + sale.Reference,
			}); e != nil {
				return e
			}
		}
		for _, l := range p.Lines {
			if e := move(pick(l.Variant).ID, -int64(l.Qty), seller, "vente", sale.Reference, when); e != nil {
				return e
			}
		}
		sales = append(sales, sale)
	}

	// --- Retour et bon de livraison -----------------------------------------
	back := sales[4]
	when := at(27, 11)
	ret := models.SaleReturn{
		Base: stamp(when), Reference: "RET-2025-001", SaleID: back.ID, UserID: manager.ID,
		Reason: "Poignée défectueuse", RefundMethod: "cash", Amount: back.Total, Restock: true,
		Items: []models.ReturnItem{{Base: stamp(when), VariantID: back.Items[0].VariantID, Quantity: 1, Amount: back.Total}},
	}
	if e := create("retour", &ret); e != nil {
		return e
	}
	if e := move(back.Items[0].VariantID, 1, manager.ID, "retour", ret.Reference, when); e != nil {
		return e
	}

	last := sales[len(sales)-1]
	note := models.DeliveryNote{
		Base: stamp(at(1, 13)), Reference: "BL-2025-001", Status: "ready", SaleID: last.ID,
		CustomerID: last.CustomerID, UserID: last.UserID, Notes: "Livraison à domicile, appeler avant passage.",
	}
	for _, it := range last.Items {
		note.Items = append(note.Items, models.DeliveryNoteItem{
			Base: stamp(at(1, 13)), VariantID: it.VariantID, Quantity: it.Quantity,
		})
	}
	if e := create("bon de livraison", &note); e != nil {
		return e
	}

	// --- Commandes web -------------------------------------------------------
	webOrders := []struct {
		DaysAgo, Customer, Variant, Qty int
		Status, Method, Zone            string
		Fee                             int64
	}{
		{5, 0, 0, 1, "pending", "wave", "Point E et Fann", 2000},
		{3, 2, 6, 2, "processing", "orange_money", "Mermoz et Sacré-Cœur", 2000},
		{2, 1, 3, 1, "delivered", "card", "Almadies et Ngor", 3000},
	}
	for i, o := range webOrders {
		t := at(o.DaysAgo, 20)
		v := pick(o.Variant)
		label := productName[v.ProductID]
		if label == "" {
			label = v.SKU
		}
		total := v.Price * int64(o.Qty)
		order := models.Order{
			Base: stamp(t), Reference: fmt.Sprintf("CMD-%s-%03d", t.Format("200601"), i+1),
			CustomerID: customers[o.Customer].ID, Status: o.Status, PaymentMethod: o.Method,
			Total: total + o.Fee, DeliveryFee: o.Fee, DeliveryZone: o.Zone,
			Address: customers[o.Customer].Address,
			Items: []models.OrderItem{{
				Base: stamp(t), VariantID: v.ID, ProductName: label,
				Quantity: int64(o.Qty), UnitPrice: v.Price, Total: total,
			}},
		}
		if e := create("commande web", &order); e != nil {
			return e
		}
	}

	// --- Coffres clients ------------------------------------------------------
	for i, idx := range []int{0, 2} {
		vault := models.Vault{
			Base: stamp(at(45-i*5, 10)), CustomerID: customers[idx].ID, Status: "open",
			Goal: 200000, GoalRef: pick(0).SKU,
		}
		for d := 0; d < 3; d++ {
			vault.Deposits = append(vault.Deposits, models.VaultDeposit{
				Base: stamp(at(40-d*12, 10)), Amount: 25000, Method: "wave",
				Reference: fmt.Sprintf("DEP-%d-%d", idx+1, d+1),
			})
			vault.Balance += 25000
		}
		if e := create("coffre", &vault); e != nil {
			return e
		}
	}

	// --- Caisse ---------------------------------------------------------------
	closedAt := at(1, 19)
	closed := models.CashSession{
		Base: stamp(at(1, 8)), UserID: sellers[1], Status: "closed", OpeningAmount: 50000,
		ExpectedAmount: 214000, ClosingAmount: 213000, OpenedAt: at(1, 8), ClosedAt: &closedAt,
		Movements: []models.CashMovement{
			{Base: stamp(at(1, 12)), UserID: sellers[1], Direction: "in", Category: "vente", Amount: 179000, Note: "Ventes du comptoir"},
			{Base: stamp(at(1, 17)), UserID: sellers[1], Direction: "out", Category: "depense", Amount: 15000, Note: "Course transport"},
		},
	}
	if e := create("session de caisse", &closed); e != nil {
		return e
	}
	open := models.CashSession{
		Base: stamp(at(0, 8)), UserID: sellers[1], Status: "open", OpeningAmount: 50000,
		ExpectedAmount: 50000, OpenedAt: at(0, 8),
	}
	if e := create("session de caisse", &open); e != nil {
		return e
	}

	// --- Dépenses --------------------------------------------------------------
	expenses := []struct {
		DaysAgo  int
		Category string
		Label    string
		Amount   int64
		Method   string
		Supplier int // -1 si sans fournisseur
	}{
		{58, "loyer", "Loyer boutique — mois écoulé", 450000, "bank_transfer", -1},
		{55, "transport", "Dédouanement conteneur", 640000, "bank_transfer", 2},
		{45, "electricite", "Facture Senelec", 78000, "cash", -1},
		{38, "salaires", "Salaires équipe", 620000, "bank_transfer", -1},
		{31, "marketing", "Campagne réseaux sociaux", 120000, "wave", -1},
		{28, "loyer", "Loyer boutique — mois courant", 450000, "bank_transfer", -1},
		{22, "fournitures", "Sachets et emballages", 45000, "cash", 1},
		{17, "transport", "Livraisons Dakar", 60000, "orange_money", 2},
		{12, "electricite", "Facture eau SDE", 22000, "cash", -1},
		{8, "salaires", "Prime vendeurs", 90000, "wave", -1},
		{4, "fournitures", "Étiquettes et rubans", 18000, "cash", 1},
		{2, "marketing", "Impression affiches", 35000, "cash", -1},
	}
	for i, x := range expenses {
		t := at(x.DaysAgo, 9)
		e := models.Expense{
			Base: stamp(t), Reference: fmt.Sprintf("DEP-%s-%03d", t.Format("200601"), i+1),
			SpentOn: t, Category: x.Category, Label: x.Label, Amount: x.Amount,
			PaymentMethod: x.Method, UserID: manager.ID,
		}
		if x.Supplier >= 0 {
			e.SupplierID = &suppliers[x.Supplier].ID
		}
		if err := create("dépense", &e); err != nil {
			return err
		}
	}

	// --- Messages et vitrine ----------------------------------------------------
	templates := []models.MessageTemplate{
		{Base: stamp(at(60, 9)), Name: "Confirmation de commande", Channel: "whatsapp", Type: "order", Subject: "Votre commande SenValise", Body: "Bonjour {{nom}}, votre commande {{reference}} est confirmée. Merci !"},
		{Base: stamp(at(60, 9)), Name: "Commande prête", Channel: "sms", Type: "delivery", Subject: "Commande prête", Body: "{{nom}}, votre commande {{reference}} est prête au retrait."},
		{Base: stamp(at(60, 9)), Name: "Relance solde", Channel: "email", Type: "billing", Subject: "Solde à régler", Body: "Bonjour {{nom}}, il reste {{montant}} FCFA sur la facture {{reference}}."},
	}
	for i := range templates {
		if e := create("modèle de message", &templates[i]); e != nil {
			return e
		}
	}
	sentAt := at(3, 17)
	messages := []models.Message{
		{Base: stamp(at(3, 17)), CustomerID: &customers[0].ID, Channel: "whatsapp", Type: "order", Status: "sent", Recipient: customers[0].Phone, Subject: "Votre commande SenValise", Body: "Bonjour Fatou, votre commande est confirmée.", SentAt: &sentAt},
		{Base: stamp(at(2, 10)), CustomerID: &customers[2].ID, Channel: "sms", Type: "delivery", Status: "sent", Recipient: customers[2].Phone, Subject: "Commande prête", Body: "Aminata, votre commande est prête au retrait.", SentAt: &sentAt},
		{Base: stamp(at(1, 9)), CustomerID: &customers[4].ID, Channel: "email", Type: "billing", Status: "failed", Recipient: customers[4].Email, Subject: "Solde à régler", Body: "Il reste un solde sur votre facture.", Error: "adresse invalide"},
	}
	for i := range messages {
		if e := create("message", &messages[i]); e != nil {
			return e
		}
	}
	blocks := []models.HomeBlock{
		{Base: stamp(at(60, 9)), Kind: "hero", Title: "Des valises pensées pour vos allers-retours", Body: "Cabine, soute et sets — livrés partout à Dakar.", Link: "/boutique.html", Position: 0, Active: true},
		{Base: stamp(at(60, 9)), Kind: "promo", Title: "Livraison offerte dès 150 000 FCFA", Body: "Sur Dakar et sa banlieue, sous 48 h.", Link: "/boutique.html", Position: 1, Active: true},
		{Base: stamp(at(60, 9)), Kind: "story", Title: "Le coffre SenValise", Body: "Réservez votre valise et payez à votre rythme.", Link: "/mon-coffre.html", Position: 2, Active: true},
	}
	for i := range blocks {
		if e := create("bloc vitrine", &blocks[i]); e != nil {
			return e
		}
	}
	contacts := []models.ContactMessage{
		{Base: stamp(at(4, 15)), Name: "Ndeye Gueye", Email: "ndeye.gueye@example.sn", Phone: "+221 77 300 21 44", Subject: "Disponibilité Saloum 75", Body: "Bonjour, la Saloum 75 est-elle disponible en ivoire ?", Status: "new"},
		{Base: stamp(at(2, 11)), Name: "Papa Sy", Email: "papa.sy@example.sn", Phone: "+221 76 855 12 09", Subject: "Livraison Thiès", Body: "Livrez-vous jusqu'à Thiès sous 48 h ?", Status: "answered"},
	}
	for i := range contacts {
		if e := create("message de contact", &contacts[i]); e != nil {
			return e
		}
	}

	// --- Journal d'activité ------------------------------------------------------
	// Quelques traces correspondant aux données ci-dessus, pour que l'écran de
	// journal ne s'ouvre pas vide sur une installation neuve.
	logs := []models.ActivityLog{
		{Base: stamp(received), UserID: manager.ID, Action: "receive", Entity: "arrival", EntityID: arrival.ID, Details: "Réception " + arrival.Reference},
		{Base: stamp(at(27, 11)), UserID: manager.ID, Action: "create", Entity: "return", EntityID: ret.ID, Details: "Retour " + ret.Reference},
		{Base: stamp(at(3, 16)), UserID: sellers[1], Action: "create", Entity: "sale", EntityID: sales[12].ID, Details: "Vente " + sales[12].Reference},
		{Base: stamp(at(1, 12)), UserID: sellers[1], Action: "create", Entity: "sale", EntityID: last.ID, Details: "Vente " + last.Reference},
		{Base: stamp(at(1, 13)), UserID: last.UserID, Action: "create", Entity: "delivery-note", EntityID: note.ID, Details: "Bon " + note.Reference},
		{Base: stamp(at(1, 19)), UserID: sellers[1], Action: "close", Entity: "cash-session", EntityID: closed.ID, Details: "Clôture de caisse"},
	}
	for i := range logs {
		if e := create("journal", &logs[i]); e != nil {
			return e
		}
	}

	// --- Stock final ------------------------------------------------------------
	for id, qty := range level {
		if e := db.Model(&models.ProductVariant{}).Where("id = ?", id).Update("stock", qty).Error; e != nil {
			return fmt.Errorf("démo stock final: %w", e)
		}
	}
	return nil
}
