package api

import (
	"time"

	"github.com/gofiber/fiber/v2"
)

// Rapports : lecture analytique sur une période libre, pensée pour le contrôle
// de gestion et l'export. Le tableau de bord répond à « où en est-on en ce
// moment » avec des périodes prédéfinies et des courbes ; ici on répond à
// « qu'a produit cette période », ligne à ligne : marge réelle, encaissements
// constatés, résultat après dépenses, créances par client.
//
// Deux écarts de méthode assumés vis-à-vis du tableau de bord :
//   - l'encaissé vient des règlements datés de la période (sale_payments), pas
//     du cumul payé des factures : c'est la trésorerie réellement entrée ;
//   - la marge se calcule sur le coût d'achat figé dans chaque ligne de vente
//     (unit_cost), donc elle ne bouge plus quand le tarif fournisseur change.

type reportTotals struct {
	Revenue       int64 `json:"revenue"`
	Collected     int64 `json:"collected"`
	Receivables   int64 `json:"receivables"`
	Cogs          int64 `json:"cogs"`
	GrossMargin   int64 `json:"grossMargin"`
	Expenses      int64 `json:"expenses"`
	Refunds       int64 `json:"refunds"`
	NetResult     int64 `json:"netResult"`
	Invoices      int64 `json:"invoices"`
	Units         int64 `json:"units"`
	AverageBasket int64 `json:"averageBasket"`
}

type reportDay struct {
	Date      time.Time `json:"date"`
	Billed    int64     `json:"billed"`
	Collected int64     `json:"collected"`
	Margin    int64     `json:"margin"`
	Count     int64     `json:"count"`
}

type reportProduct struct {
	Name     string `json:"name"`
	SKU      string `json:"sku"`
	Category string `json:"category"`
	Units    int64  `json:"units"`
	Revenue  int64  `json:"revenue"`
	Cost     int64  `json:"cost"`
	Margin   int64  `json:"margin"`
}

type reportNamed struct {
	Name    string `json:"name"`
	Count   int64  `json:"count"`
	Amount  int64  `json:"amount"`
	Extra   int64  `json:"extra"`
	Margin  int64  `json:"margin"`
	Percent int64  `json:"percent"`
}

type reportReceivable struct {
	Name       string `json:"name"`
	Phone      string `json:"phone"`
	Invoices   int64  `json:"invoices"`
	Due        int64  `json:"due"`
	OldestDays int64  `json:"oldestDays"`
}

type reportSale struct {
	ID        uint      `json:"id"`
	Date      time.Time `json:"date"`
	Reference string    `json:"reference"`
	Customer  string    `json:"customer"`
	Seller    string    `json:"seller"`
	Channel   string    `json:"channel"`
	Method    string    `json:"method"`
	Status    string    `json:"status"`
	Total     int64     `json:"total"`
	Paid      int64     `json:"paid"`
	Due       int64     `json:"due"`
	Margin    int64     `json:"margin"`
}

type reportStock struct {
	SKU         string `json:"sku"`
	Product     string `json:"product"`
	Stock       int64  `json:"stock"`
	Cost        int64  `json:"cost"`
	Price       int64  `json:"price"`
	CostValue   int64  `json:"costValue"`
	RetailValue int64  `json:"retailValue"`
	Sold        int64  `json:"sold"`
}

// journalLimit borne la table détaillée renvoyée au navigateur. L'export CSV
// est construit à partir de ces mêmes lignes, donc la troncature est signalée
// explicitement au lieu d'être silencieuse.
const journalLimit = 800

func (s *Server) reports(c *fiber.Ctx) error {
	from, to := reportRange(c)
	span := to.Sub(from)
	previousFrom, previousTo := from.Add(-span), from

	current := s.reportTotals(from, to)
	previous := s.reportTotals(previousFrom, previousTo)

	days := make([]reportDay, 0)
	s.DB.Raw(`select d.date, coalesce(b.billed,0) billed, coalesce(p.collected,0) collected,
		coalesce(b.margin,0) margin, coalesce(b.count,0) count
		from generate_series(date_trunc('day',?::timestamptz), date_trunc('day',?::timestamptz), interval '1 day') d(date)
		left join (
			select date_trunc('day',s.created_at) date, sum(s.total) billed, count(*) count,
				sum(s.total) - coalesce(sum((select sum(si.unit_cost*si.quantity) from sale_items si where si.sale_id=s.id)),0) margin
			from sales s where s.created_at >= ? and s.created_at <= ? and s.status <> 'cancelled' group by 1
		) b on b.date = d.date
		left join (
			select date_trunc('day',created_at) date, sum(amount) collected
			from sale_payments where status='active' and created_at >= ? and created_at <= ? group by 1
		) p on p.date = d.date
		order by d.date`, from, to, from, to, from, to).Scan(&days)

	products := make([]reportProduct, 0)
	s.DB.Raw(`select coalesce(p.name,pv.sku) name, pv.sku, coalesce(c.name,'Sans catégorie') category,
		coalesce(sum(si.quantity),0) units, coalesce(sum(si.total),0) revenue,
		coalesce(sum(si.unit_cost*si.quantity),0) cost,
		coalesce(sum(si.total),0) - coalesce(sum(si.unit_cost*si.quantity),0) margin
		from sale_items si join sales s on s.id=si.sale_id
		join product_variants pv on pv.id=si.variant_id
		left join products p on p.id=pv.product_id
		left join categories c on c.id=p.category_id
		where s.created_at >= ? and s.created_at <= ? and s.status <> 'cancelled'
		group by p.name, pv.sku, c.name order by revenue desc`, from, to).Scan(&products)

	categories := make([]reportNamed, 0)
	s.DB.Raw(`select coalesce(c.name,'Sans catégorie') name, coalesce(sum(si.quantity),0) count,
		coalesce(sum(si.total),0) amount,
		coalesce(sum(si.total),0) - coalesce(sum(si.unit_cost*si.quantity),0) margin
		from sale_items si join sales s on s.id=si.sale_id
		join product_variants pv on pv.id=si.variant_id
		left join products p on p.id=pv.product_id
		left join categories c on c.id=p.category_id
		where s.created_at >= ? and s.created_at <= ? and s.status <> 'cancelled'
		group by c.name order by amount desc`, from, to).Scan(&categories)

	sellers := make([]reportNamed, 0)
	s.DB.Raw(`select coalesce(u.name,'Compte supprimé') name, count(*) count, coalesce(sum(s.total),0) amount,
		coalesce(sum(least(s.paid,s.total)),0) extra,
		coalesce(sum(s.total),0) - coalesce(sum((select sum(si.unit_cost*si.quantity) from sale_items si where si.sale_id=s.id)),0) margin
		from sales s left join users u on u.id=s.user_id
		where s.created_at >= ? and s.created_at <= ? and s.status <> 'cancelled'
		group by u.name order by amount desc`, from, to).Scan(&sellers)

	methods := make([]reportNamed, 0)
	s.DB.Raw(`select method name, count(*) count, coalesce(sum(amount),0) amount
		from sale_payments where status='active' and created_at >= ? and created_at <= ?
		group by method order by amount desc`, from, to).Scan(&methods)

	expenses := make([]reportNamed, 0)
	s.DB.Raw(`select coalesce(nullif(category,''),'Sans catégorie') name, count(*) count, coalesce(sum(amount),0) amount
		from expenses where spent_on >= ? and spent_on <= ?
		group by 1 order by amount desc`, from, to).Scan(&expenses)

	receivables := make([]reportReceivable, 0)
	s.DB.Raw(`select coalesce(cu.name,'Client de passage') name, coalesce(cu.phone,'') phone,
		count(*) invoices, coalesce(sum(s.total - least(s.paid,s.total)),0) due,
		max(extract(day from now() - s.created_at))::bigint oldest_days
		from sales s left join customers cu on cu.id=s.customer_id
		where s.status <> 'cancelled' and s.total > s.paid and s.created_at <= ?
		group by cu.name, cu.phone order by due desc`, to).Scan(&receivables)

	journal := make([]reportSale, 0)
	s.DB.Raw(`select s.id, s.created_at date, s.reference,
		coalesce(cu.name,'Client de passage') customer, coalesce(u.name,'—') seller,
		s.channel, s.payment_method method, s.status, s.total,
		least(s.paid,s.total) paid, greatest(s.total-s.paid,0) due,
		s.total - coalesce((select sum(si.unit_cost*si.quantity) from sale_items si where si.sale_id=s.id),0) margin
		from sales s left join customers cu on cu.id=s.customer_id left join users u on u.id=s.user_id
		where s.created_at >= ? and s.created_at <= ?
		order by s.created_at desc limit ?`, from, to, journalLimit+1).Scan(&journal)
	truncated := len(journal) > journalLimit
	if truncated {
		journal = journal[:journalLimit]
	}

	stock := make([]reportStock, 0)
	s.DB.Raw(`select pv.sku, coalesce(p.name,pv.sku) product, greatest(pv.stock,0) stock,
		pv.cost, pv.price, greatest(pv.stock,0)*pv.cost cost_value, greatest(pv.stock,0)*pv.price retail_value,
		coalesce((select sum(si.quantity) from sale_items si join sales s on s.id=si.sale_id
			where si.variant_id=pv.id and s.created_at >= ? and s.created_at <= ? and s.status <> 'cancelled'),0) sold
		from product_variants pv left join products p on p.id=pv.product_id
		where pv.active = true order by cost_value desc`, from, to).Scan(&stock)

	var stockCost, stockRetail, stockUnits int64
	for _, row := range stock {
		stockCost += row.CostValue
		stockRetail += row.RetailValue
		stockUnits += row.Stock
	}

	return c.JSON(fiber.Map{
		"from": from, "to": to,
		"previousFrom": previousFrom, "previousTo": previousTo,
		"totals": current, "previous": previous,
		"days": days, "products": products, "categories": categories,
		"sellers": sellers, "methods": methods, "expenses": expenses,
		"receivables": receivables, "journal": journal, "journalTruncated": truncated,
		"stock": stock,
		"stockTotals": fiber.Map{"units": stockUnits, "cost": stockCost, "retail": stockRetail, "margin": stockRetail - stockCost},
	})
}

func (s *Server) reportTotals(from, to time.Time) reportTotals {
	var t reportTotals
	s.DB.Raw(`select coalesce(sum(s.total),0) revenue,
		coalesce(sum(greatest(s.total-s.paid,0)),0) receivables,
		count(*) invoices,
		coalesce(sum((select sum(si.unit_cost*si.quantity) from sale_items si where si.sale_id=s.id)),0) cogs,
		coalesce(sum((select sum(si.quantity) from sale_items si where si.sale_id=s.id)),0) units
		from sales s where s.created_at >= ? and s.created_at <= ? and s.status <> 'cancelled'`, from, to).Scan(&t)
	s.DB.Raw(`select coalesce(sum(amount),0) from sale_payments where status='active' and created_at >= ? and created_at <= ?`, from, to).Scan(&t.Collected)
	s.DB.Raw(`select coalesce(sum(amount),0) from expenses where spent_on >= ? and spent_on <= ?`, from, to).Scan(&t.Expenses)
	s.DB.Raw(`select coalesce(sum(amount),0) from sale_returns where created_at >= ? and created_at <= ?`, from, to).Scan(&t.Refunds)
	t.GrossMargin = t.Revenue - t.Cogs
	t.NetResult = t.GrossMargin - t.Expenses - t.Refunds
	if t.Invoices > 0 {
		t.AverageBasket = t.Revenue / t.Invoices
	}
	return t
}

// reportRange lit from/to au format AAAA-MM-JJ. Par défaut le mois en cours.
// La borne haute est inclusive : une journée entière, pas minuit pile.
func reportRange(c *fiber.Ctx) (time.Time, time.Time) {
	now := time.Now()
	loc := now.Location()
	from := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc)
	to := now
	if raw := c.Query("from"); raw != "" {
		if parsed, err := time.ParseInLocation("2006-01-02", raw, loc); err == nil {
			from = parsed
		}
	}
	if raw := c.Query("to"); raw != "" {
		if parsed, err := time.ParseInLocation("2006-01-02", raw, loc); err == nil {
			to = parsed.Add(24*time.Hour - time.Nanosecond)
		}
	}
	if to.Before(from) {
		from, to = to, from
	}
	return from, to
}
