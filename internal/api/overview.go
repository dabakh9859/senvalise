package api

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"senvalise/internal/messaging"
)

// L'ecran d'accueil, ecrit pour quelqu'un qui n'est pas comptable.
//
// Le tableau de bord montrait huit graphiques : ancienneté des creances,
// affluence par jour et par heure, camembert par categorie, classements. Ce
// sont de bons outils d'analyse — ils vivent maintenant dans la page Rapports,
// dont c'est le metier. Mais la personne qui ouvre l'application le matin ne
// pose pas ces questions-la. Elle en pose quatre :
//
//	combien est entre, combien est sorti, ce qu'on me doit, ce qui cloche.
//
// Chaque chiffre part donc avec sa phrase. « Encaisse » seul ne veut rien dire
// pour qui n'a pas l'habitude ; « l'argent que vous avez reellement recu »
// se comprend sans qu'on l'explique.
//
// Le vendeur voit un ecran different, et c'est deliberé : il ne dispose pas
// des couts d'achat, et le benefice de la boutique ne le regarde pas. Il voit
// ce sur quoi il agit — sa caisse, ses ventes du jour, ce qu'il reste a faire.

type overviewFigure struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	// Sentence dit ce que le chiffre signifie, en francais courant. C'est la
	// difference entre un tableau de bord qu'on lit et un qu'on subit.
	Sentence string `json:"sentence"`
	Amount   int64  `json:"amount"`
	// Count sert aux chiffres qui comptent des choses plutot que des francs.
	Count   int64  `json:"count"`
	IsMoney bool   `json:"isMoney"`
	Tone    string `json:"tone"`
	// Warning signale une reserve honnete sur le chiffre — un benefice calcule
	// sans prix d'achat, par exemple, qui vaut alors le chiffre d'affaires.
	Warning string `json:"warning"`
}

type overviewTask struct {
	Key    string `json:"key"`
	Text   string `json:"text"`
	Action string `json:"action"`
	CTA    string `json:"cta"`
	Tone   string `json:"tone"`
}

// dayStart rend minuit du jour courant. Une journee de boutique commence a
// l'ouverture, pas vingt-quatre heures en arriere : le gerant qui regarde a
// neuf heures veut sa matinee, pas la soiree de la veille.
func dayStart() time.Time { return time.Now().Truncate(24 * time.Hour) }

func monthStartTime() time.Time {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
}

type periodFigures struct {
	Collected, Sold, Expenses, Cost, Revenue, Invoices int64
	// PricedLines compte les lignes vendues dont le prix d'achat est renseigne.
	// Sans elles, le benefice affiche serait le chiffre d'affaires deguise.
	PricedLines, TotalLines int64
}

func (s *Server) figuresSince(from time.Time) periodFigures {
	var out periodFigures
	s.DB.Raw(`select
		(select coalesce(sum(amount),0) from sale_payments
		  where created_at >= @from and status <> 'cancelled') collected,
		(select count(*) from sales where created_at >= @from and status <> 'cancelled') invoices,
		(select coalesce(sum(total),0) from sales where created_at >= @from and status <> 'cancelled') revenue,
		(select coalesce(sum(si.quantity),0) from sale_items si join sales s on s.id = si.sale_id
		  where s.created_at >= @from and s.status <> 'cancelled') sold,
		(select coalesce(sum(amount),0) from expenses where spent_on >= @from) expenses,
		(select coalesce(sum(si.unit_cost*si.quantity),0) from sale_items si join sales s on s.id = si.sale_id
		  where s.created_at >= @from and s.status <> 'cancelled') cost,
		(select count(*) from sale_items si join sales s on s.id = si.sale_id
		  where s.created_at >= @from and s.status <> 'cancelled' and si.unit_cost > 0) priced_lines,
		(select count(*) from sale_items si join sales s on s.id = si.sale_id
		  where s.created_at >= @from and s.status <> 'cancelled') total_lines`,
		map[string]any{"from": from}).Scan(&out)
	return out
}

// profitFigure assemble le benefice et dit franchement ce qu'il vaut.
//
// Sans prix d'achat saisis, « benefice » egale le chiffre d'affaires moins les
// depenses : le chiffre s'affiche quand meme — le taire n'aiderait personne —
// mais accompagne de la raison pour laquelle il est trop beau.
func profitFigure(f periodFigures, label string) overviewFigure {
	profit := f.Revenue - f.Cost - f.Expenses
	figure := overviewFigure{
		Key: "profit", Label: label, Amount: profit, IsMoney: true,
		Sentence: "ce qui reste une fois la marchandise et les dépenses payées",
		Tone:     "good",
	}
	if profit < 0 {
		figure.Tone = "bad"
		figure.Sentence = "vous avez dépensé plus que ce que la boutique a rapporté"
	}
	if f.TotalLines > 0 && f.PricedLines == 0 {
		figure.Warning = "Aucun prix d’achat n’est renseigné sur vos produits : ce montant ne déduit pas le coût de la marchandise, il est donc trop élevé."
	} else if f.PricedLines < f.TotalLines {
		figure.Warning = "Certains produits vendus n’ont pas de prix d’achat renseigné : le montant réel est un peu plus bas."
	}
	return figure
}

// managerOverview repond aux quatre questions du gerant.
func (s *Server) managerOverview(c *fiber.Ctx) error {
	today := s.figuresSince(dayStart())
	month := s.figuresSince(monthStartTime())

	figures := []overviewFigure{
		{Key: "collected", Label: "Argent encaissé aujourd’hui", Amount: today.Collected, IsMoney: true,
			Sentence: "l’argent réellement reçu, tous moyens de paiement confondus", Tone: "good"},
		{Key: "sales", Label: "Ventes aujourd’hui", Count: today.Invoices, Tone: "neutral",
			Sentence: pluralSentence(today.Sold, "article vendu", "articles vendus")},
		{Key: "expenses", Label: "Dépenses aujourd’hui", Amount: today.Expenses, IsMoney: true,
			Sentence: "l’argent sorti de la boutique aujourd’hui", Tone: "spend"},
	}
	figures = append(figures, profitFigure(today, "Bénéfice aujourd’hui"))

	monthFigures := []overviewFigure{
		{Key: "collected", Label: "Encaissé ce mois-ci", Amount: month.Collected, IsMoney: true,
			Sentence: "depuis le 1er du mois", Tone: "good"},
		{Key: "sales", Label: "Ventes ce mois-ci", Count: month.Invoices, Tone: "neutral",
			Sentence: pluralSentence(month.Sold, "article vendu", "articles vendus")},
		{Key: "expenses", Label: "Dépenses ce mois-ci", Amount: month.Expenses, IsMoney: true,
			Sentence: "depuis le 1er du mois", Tone: "spend"},
	}
	monthFigures = append(monthFigures, profitFigure(month, "Bénéfice ce mois-ci"))

	return c.JSON(fiber.Map{
		"role": "manager", "today": figures, "month": monthFigures,
		"tasks": s.overviewTasks(true), "best": s.bestSellers(monthStartTime()),
		"cash": s.cashSnapshot(),
	})
}

// pluralSentence evite « 1 articles ». Le detail parait mince ; il fait la
// difference entre un ecran soigne et un ecran genere.
func pluralSentence(count int64, singular, plural string) string {
	if count == 1 {
		return "1 " + singular
	}
	return itoa64(count) + " " + plural
}

func itoa64(v int64) string {
	if v == 0 {
		return "0"
	}
	negative := v < 0
	if negative {
		v = -v
	}
	digits := ""
	for v > 0 {
		digits = string(rune('0'+v%10)) + digits
		v /= 10
	}
	if negative {
		return "-" + digits
	}
	return digits
}

// overviewTasks liste ce qui demande une action, en phrases.
//
// « lowStock: 3 » n'est pas une information pour qui tient une boutique :
// « 3 produits vont bientôt manquer » en est une, et le bouton a cote mene la
// ou il faut agir. Rien ne s'affiche quand tout va bien : un bandeau toujours
// present finit par ne plus etre lu.
func (s *Server) overviewTasks(manager bool) []overviewTask {
	var counts struct {
		OutOfStock, LowStock, Debtors, Due, PendingOrders, FailedMessages, OpenCash int64
	}
	s.DB.Raw(`select
		(select count(*) from product_variants where active and stock <= 0) out_of_stock,
		(select count(*) from product_variants where active and stock > 0 and alert_at > 0 and stock <= alert_at) low_stock,
		(select count(distinct customer_id) from sales where status <> 'cancelled' and total > paid and customer_id is not null) debtors,
		(select coalesce(sum(greatest(total - paid, 0)),0) from sales where status <> 'cancelled') due,
		(select count(*) from orders where status = 'pending') pending_orders,
		(select count(*) from messages where status = 'failed') failed_messages,
		(select count(*) from cash_sessions where status = 'open') open_cash`).Scan(&counts)

	tasks := []overviewTask{}
	add := func(condition bool, task overviewTask) {
		if condition {
			tasks = append(tasks, task)
		}
	}
	add(counts.OutOfStock > 0, overviewTask{Key: "out", Tone: "bad", Action: "products", CTA: "Voir les produits",
		Text: plural(counts.OutOfStock, "Un produit est en rupture : il ne peut plus être vendu.",
			"%d produits sont en rupture : ils ne peuvent plus être vendus.")})
	add(counts.LowStock > 0, overviewTask{Key: "low", Tone: "warn", Action: "products", CTA: "Voir les produits",
		Text: plural(counts.LowStock, "Un produit va bientôt manquer.", "%d produits vont bientôt manquer.")})
	add(counts.Debtors > 0, overviewTask{Key: "debt", Tone: "warn", Action: "debts", CTA: "Voir les créances",
		Text: plural(counts.Debtors, "Un client doit encore de l’argent : "+moneyText(counts.Due)+" au total.",
			"%d clients doivent encore de l’argent : "+moneyText(counts.Due)+" au total.")})
	add(counts.PendingOrders > 0, overviewTask{Key: "orders", Tone: "warn", Action: "shop-orders", CTA: "Voir les commandes",
		Text: plural(counts.PendingOrders, "Une commande du site attend d’être traitée.",
			"%d commandes du site attendent d’être traitées.")})
	if manager {
		add(counts.FailedMessages > 0, overviewTask{Key: "msg", Tone: "warn", Action: "messages", CTA: "Voir les messages",
			Text: plural(counts.FailedMessages, "Un message n’est pas parti.", "%d messages ne sont pas partis.")})
	}
	add(counts.OpenCash > 0, overviewTask{Key: "cash", Tone: "info", Action: "cash-sessions", CTA: "Voir la caisse",
		Text: plural(counts.OpenCash, "Une caisse est encore ouverte.", "%d caisses sont encore ouvertes.")})
	return tasks
}

type overviewBest struct {
	Name  string `json:"name"`
	Units int64  `json:"units"`
	Total int64  `json:"total"`
}

// bestSellers rend les cinq produits qui rapportent le plus sur la periode.
// C'est la seule statistique gardee sur cet ecran : elle se lit sans savoir
// lire un graphique.
func (s *Server) bestSellers(from time.Time) []overviewBest {
	rows := []overviewBest{}
	s.DB.Raw(`select coalesce(nullif(p.name,''), v.sku, 'Article') name,
	                 sum(si.quantity) units, sum(si.total) total
	    from sale_items si
	    join sales s on s.id = si.sale_id
	    left join product_variants v on v.id = si.variant_id
	    left join products p on p.id = v.product_id
	   where s.created_at >= @from and s.status <> 'cancelled'
	   group by 1 order by total desc limit 5`, map[string]any{"from": from}).Scan(&rows)
	return rows
}

// cashSnapshot dit si un tiroir est ouvert et ce qu'il devrait contenir.
func (s *Server) cashSnapshot() fiber.Map {
	var row struct {
		ID             int64
		Name           string
		ExpectedAmount int64
		OpenedAt       *time.Time
	}
	s.DB.Raw(`select c.id, coalesce(u.name,'—') name, c.expected_amount, c.opened_at
	    from cash_sessions c left join users u on u.id = c.user_id
	   where c.status = 'open' order by c.opened_at asc limit 1`).Scan(&row)
	if row.ID == 0 {
		return fiber.Map{"open": false}
	}
	return fiber.Map{"open": true, "holder": row.Name, "expected": row.ExpectedAmount, "openedAt": row.OpenedAt}
}

// vendorOverview montre au vendeur ce sur quoi il agit.
//
// Ni benefice, ni cout d'achat, ni chiffre d'affaires de la boutique : il n'y
// a pas acces, et les afficher serait a la fois une fuite et un bruit. Restent
// sa caisse, ses ventes du jour, et ce qui l'empechera de vendre — une rupture
// de stock, un client qui doit encore.
func (s *Server) vendorOverview(c *fiber.Ctx) error {
	uid := c.Locals("userID").(uint)
	from := dayStart()
	var mine struct {
		Sales, Units, Collected int64
	}
	s.DB.Raw(`select
		(select count(*) from sales where user_id = @uid and created_at >= @from and status <> 'cancelled') sales,
		(select coalesce(sum(si.quantity),0) from sale_items si join sales s on s.id = si.sale_id
		  where s.user_id = @uid and s.created_at >= @from and s.status <> 'cancelled') units,
		(select coalesce(sum(amount),0) from sale_payments
		  where user_id = @uid and created_at >= @from and status <> 'cancelled') collected`,
		map[string]any{"uid": uid, "from": from}).Scan(&mine)

	figures := []overviewFigure{
		{Key: "sales", Label: "Mes ventes aujourd’hui", Count: mine.Sales, Tone: "neutral",
			Sentence: pluralSentence(mine.Units, "article vendu", "articles vendus")},
		{Key: "collected", Label: "Encaissé par moi aujourd’hui", Amount: mine.Collected, IsMoney: true,
			Sentence: "les règlements que vous avez enregistrés", Tone: "good"},
	}

	// La caisse du vendeur, pas celle de la boutique : c'est la sienne qu'il
	// doit fermer le soir, et l'ecart lui sera impute.
	var drawer struct {
		ID             int64
		OpeningAmount  int64
		ExpectedAmount int64
		OpenedAt       *time.Time
	}
	s.DB.Raw(`select id, opening_amount, expected_amount, opened_at from cash_sessions
	   where user_id = ? and status = 'open' limit 1`, uid).Scan(&drawer)
	cash := fiber.Map{"open": false}
	if drawer.ID != 0 {
		cash = fiber.Map{"open": true, "id": drawer.ID, "expected": drawer.ExpectedAmount,
			"opening": drawer.OpeningAmount, "openedAt": drawer.OpenedAt}
	}

	return c.JSON(fiber.Map{
		"role": "vendor", "today": figures, "month": []overviewFigure{},
		"tasks": s.overviewTasks(false), "best": []overviewBest{}, "cash": cash,
	})
}

// overview aiguille selon le role. Un seul chemin cote ecran, deux reponses :
// l'application n'a pas a deviner quel appel faire, et le serveur reste seul
// juge de ce que chacun voit.
func (s *Server) overview(c *fiber.Ctx) error {
	if isManager(c) {
		return s.managerOverview(c)
	}
	return s.vendorOverview(c)
}

// plural rend la phrase au singulier ou au pluriel. Les deux formes sont
// ecrites en toutes lettres plutot que bricolees avec un « (s) » : l'ecran est
// lu par quelqu'un qui n'aime pas les ordinateurs, et « 1 produit(s) » est
// exactement le genre de detail qui donne l'impression d'une machine.
func plural(count int64, one, many string) string {
	if count == 1 {
		return one
	}
	return strings.Replace(many, "%d", itoa64(count), 1)
}

// moneyText met en forme un montant comme le reste de l'application.
func moneyText(amount int64) string { return messaging.Money(amount) }
