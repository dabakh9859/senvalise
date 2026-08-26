package api

import (
	"time"

	"github.com/gofiber/fiber/v2"
)

// L'accueil du vendeur.
//
// Il ouvrait l'application directement sur la caisse, son poste de travail —
// ce qui est juste, mais rien ne lui disait ce qu'il restait a faire : une
// caisse laissee ouverte la veille, un client a relancer, un produit en
// rupture qu'il proposera pour rien.
//
// Cet ecran est le sien, et il n'est que le sien : le gerant garde son tableau
// de bord d'analyse, intact. Le vendeur n'y voit ni benefice, ni cout d'achat,
// ni chiffre d'affaires de la boutique — il n'y a pas acces, et ce serait
// autant une fuite qu'un bruit. Il voit ce sur quoi il agit.

type vendorTask struct {
	Key    string `json:"key"`
	Text   string `json:"text"`
	Action string `json:"action"`
	CTA    string `json:"cta"`
	Tone   string `json:"tone"`
}

func (s *Server) vendorHome(c *fiber.Ctx) error {
	uid := c.Locals("userID").(uint)
	// La journee commence a minuit, pas vingt-quatre heures en arriere : un
	// vendeur qui ouvre a neuf heures veut sa matinee, pas la soiree d'hier.
	from := time.Now().Truncate(24 * time.Hour)

	var mine struct{ Sales, Units, Collected int64 }
	s.DB.Raw(`select
		(select count(*) from sales where user_id = @uid and created_at >= @from and status <> 'cancelled') sales,
		(select coalesce(sum(si.quantity),0) from sale_items si join sales s on s.id = si.sale_id
		  where s.user_id = @uid and s.created_at >= @from and s.status <> 'cancelled') units,
		(select coalesce(sum(amount),0) from sale_payments
		  where user_id = @uid and created_at >= @from and status <> 'cancelled') collected`,
		map[string]any{"uid": uid, "from": from}).Scan(&mine)

	// Sa caisse, pas celle de la boutique : c'est la sienne qu'il ferme le
	// soir, et l'ecart lui sera impute.
	var drawer struct {
		ID                            int64
		OpeningAmount, ExpectedAmount int64
		OpenedAt                      *time.Time
	}
	s.DB.Raw(`select id, opening_amount, expected_amount, opened_at from cash_sessions
	   where user_id = ? and status = 'open' limit 1`, uid).Scan(&drawer)
	cash := fiber.Map{"open": false}
	if drawer.ID != 0 {
		cash = fiber.Map{"open": true, "id": drawer.ID, "expected": drawer.ExpectedAmount,
			"opening": drawer.OpeningAmount, "openedAt": drawer.OpenedAt}
	}

	var counts struct{ OutOfStock, LowStock, Debtors, Due, PendingOrders int64 }
	s.DB.Raw(`select
		(select count(*) from product_variants where active and stock <= 0) out_of_stock,
		(select count(*) from product_variants where active and stock > 0 and alert_at > 0 and stock <= alert_at) low_stock,
		(select count(distinct customer_id) from sales where status <> 'cancelled' and total > paid and customer_id is not null) debtors,
		(select coalesce(sum(greatest(total - paid, 0)),0) from sales where status <> 'cancelled') due,
		(select count(*) from orders where status = 'pending') pending_orders`).Scan(&counts)

	// Ce qui demande une action, ecrit en francais. « lowStock: 3 » n'est pas
	// une information pour qui tient un comptoir ; « 3 produits vont bientot
	// manquer » en est une, et le bouton a cote mene la ou l'on agit.
	tasks := []vendorTask{}
	add := func(when bool, task vendorTask) {
		if when {
			tasks = append(tasks, task)
		}
	}
	add(drawer.ID != 0 && drawer.OpenedAt != nil && drawer.OpenedAt.Before(from),
		vendorTask{Key: "cash", Tone: "warn", Action: "cash-sessions", CTA: "Voir la caisse",
			Text: "Votre caisse d’hier est encore ouverte : pensez à la clôturer."})
	add(counts.OutOfStock > 0, vendorTask{Key: "out", Tone: "bad", Action: "products", CTA: "Voir les produits",
		Text: plural(counts.OutOfStock, "Un produit est en rupture : ne le proposez plus.",
			"%d produits sont en rupture : ne les proposez plus.")})
	add(counts.LowStock > 0, vendorTask{Key: "low", Tone: "warn", Action: "products", CTA: "Voir les produits",
		Text: plural(counts.LowStock, "Un produit va bientôt manquer.", "%d produits vont bientôt manquer.")})
	add(counts.Debtors > 0, vendorTask{Key: "debt", Tone: "warn", Action: "debts", CTA: "Voir les créances",
		Text: plural(counts.Debtors, "Un client doit encore "+moneyText(counts.Due)+".",
			"%d clients doivent encore "+moneyText(counts.Due)+" au total.")})
	add(counts.PendingOrders > 0, vendorTask{Key: "orders", Tone: "warn", Action: "shop-orders", CTA: "Voir les commandes",
		Text: plural(counts.PendingOrders, "Une commande du site attend d’être traitée.",
			"%d commandes du site attendent d’être traitées.")})

	return c.JSON(fiber.Map{
		"sales": mine.Sales, "units": mine.Units, "collected": mine.Collected,
		"cash": cash, "tasks": tasks,
	})
}
