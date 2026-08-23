package api

import (
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// Journal de l'activite.
//
// Le gerant devait ouvrir six ecrans pour savoir ce qui s'etait passe dans la
// journee : les ventes ici, les reglements la, les depenses ailleurs, les
// corrections de stock dans un tableau technique ou chaque ligne portait un
// identifiant de declinaison plutot qu'un nom de valise. Rien ne racontait la
// journee.
//
// Cette page rassemble les evenements de toutes les tables qui comptent, dans
// un seul fil, du plus recent au plus ancien. Chaque ligne est une phrase :
// qui, quoi, combien. Aucun identifiant technique n'y apparait — le gerant
// n'en a pas l'usage, et ils rendaient l'ancien journal illisible.
//
// Les evenements ne sont pas lus dans une table d'audit, mais dans les tables
// elles-memes. Un journal d'audit ne consigne que ce que quelqu'un a pense a y
// ecrire ; les ventes, les reglements et les mouvements de stock, eux, sont la
// realite. Une vente ne peut pas manquer au fil : elle est le fil.

type journalEvent struct {
	At     time.Time `json:"at"`
	Kind   string    `json:"kind"`
	Who    string    `json:"who"`
	What   string    `json:"what"`
	Detail string    `json:"detail"`
	Amount int64     `json:"amount"`
	Tone   string    `json:"tone"`
}

// journalQuery rassemble les sources. Chaque bloc rend les memes colonnes, ce
// qui permet de les empiler et de trier l'ensemble par date.
//
// Les mouvements de stock nes d'une vente sont ecartes : la vente figure deja
// au fil, et les repeter doublerait chaque ligne du comptoir. Restent les
// entrees, les corrections et les retours — ceux qu'on cherche justement a
// retrouver quand un compte ne tombe pas juste.
const journalQuery = `
select s.created_at at, 'sale' kind, coalesce(u.name,'—') who,
       'Vente ' || s.reference what,
       coalesce(cu.name,'Client comptoir') detail, s.total amount, 'ok' tone
  from sales s left join users u on u.id = s.user_id
  left join customers cu on cu.id = s.customer_id
 where s.created_at >= @from
union all
select p.created_at, 'payment', coalesce(u.name,'—'),
       'Règlement encaissé', coalesce(s.reference,'') , p.amount,
       case when p.status = 'cancelled' then 'bad' else 'ok' end
  from sale_payments p left join users u on u.id = p.user_id
  left join sales s on s.id = p.sale_id
 where p.created_at >= @from
union all
select r.created_at, 'return', coalesce(u.name,'—'),
       'Retour client ' || r.reference, coalesce(r.reason,''), r.amount, 'warn'
  from sale_returns r left join users u on u.id = r.user_id
 where r.created_at >= @from
union all
select e.created_at, 'expense', coalesce(u.name,'—'),
       'Dépense : ' || e.label, coalesce(nullif(e.category,''),'sans catégorie'), e.amount, 'warn'
  from expenses e left join users u on u.id = e.user_id
 where e.created_at >= @from
union all
select m.created_at, 'stock', coalesce(u.name,'—'),
       case when m.quantity > 0 then 'Entrée de stock' else 'Sortie de stock' end,
       coalesce(p.name, v.sku, '') || ' — ' || abs(m.quantity) || ' pièce(s), ' || coalesce(nullif(m.reason,''),'sans motif'),
       0, case when m.quantity > 0 then 'ok' else 'warn' end
  from stock_movements m
  left join users u on u.id = m.user_id
  left join product_variants v on v.id = m.variant_id
  left join products p on p.id = v.product_id
 where m.created_at >= @from and m.reason not in ('sale','quote_convert','web_order','sale_edit')
union all
select c.opened_at, 'cash-open', coalesce(u.name,'—'),
       'Ouverture de caisse', 'fond de caisse', c.opening_amount, 'info'
  from cash_sessions c left join users u on u.id = c.user_id
 where c.opened_at >= @from
union all
select c.closed_at, 'cash-close', coalesce(u.name,'—'),
       'Clôture de caisse',
       case when c.closing_amount = c.expected_amount then 'caisse juste'
            when c.closing_amount > c.expected_amount then 'excédent de ' || (c.closing_amount - c.expected_amount) || ' F'
            else 'manque ' || (c.expected_amount - c.closing_amount) || ' F' end,
       c.closing_amount,
       case when c.closing_amount = c.expected_amount then 'ok' else 'bad' end
  from cash_sessions c left join users u on u.id = c.user_id
 where c.closed_at is not null and c.closed_at >= @from
union all
select d.created_at, 'vault', '—',
       case when d.amount > 0 then 'Versement au coffre' else 'Retrait du coffre' end,
       coalesce(cu.name,'client'), abs(d.amount), case when d.amount > 0 then 'ok' else 'warn' end
  from vault_deposits d
  left join vaults va on va.id = d.vault_id
  left join customers cu on cu.id = va.customer_id
 where d.created_at >= @from
union all
select o.created_at, 'order', '—',
       'Commande en ligne ' || o.reference, coalesce(cu.name,'client du site'), o.total, 'info'
  from orders o left join customers cu on cu.id = o.customer_id
 where o.created_at >= @from
union all
select coalesce(m.sent_at, m.created_at), 'message', '—',
       case when m.status = 'sent' then 'Message envoyé' else 'Message en échec' end,
       coalesce(nullif(m.recipient,''),'') || case when m.status = 'sent' then '' else ' — ' || coalesce(m.error,'') end,
       0, case when m.status = 'sent' then 'ok' else 'bad' end
  from messages m
 where coalesce(m.sent_at, m.created_at) >= @from and m.status in ('sent','failed')
union all
select a.created_at, 'delete', coalesce(u.name,'—'),
       'Suppression', coalesce(a.details,''), 0, 'bad'
  from activity_logs a left join users u on u.id = a.user_id
 where a.created_at >= @from and a.action = 'delete'
order by at desc
limit 300`

// motifs traduit les etiquettes techniques des mouvements de stock. « sale »
// ou « sales_deleted » ne veulent rien dire pour qui tient une boutique.
var motifs = map[string]string{
	"arrival": "arrivage reçu", "return": "retour d'un client", "inventory": "inventaire",
	"correction": "correction", "casse": "casse ou perte", "offert": "offert",
	"retour_fournisseur": "retour au fournisseur", "sales_deleted": "facture supprimée, marchandise rendue",
	"arrivals_deleted": "arrivage supprimé", "returns_deleted": "retour supprimé",
	"orders_deleted": "commande supprimée", "adjust": "ajustement",
	"initial": "stock de départ à la création",
}

// pieces nomme les tables comme le gerant les appelle. Le journal d'audit note
// « sales #11 » ; personne ne parle ainsi de sa facture.
var pieces = map[string]string{
	"sales": "Facture", "quotes": "Devis", "delivery-notes": "Bon de livraison",
	"products": "Produit", "variants": "Déclinaison", "customers": "Client",
	"expenses": "Dépense", "arrivals": "Arrivage", "returns": "Retour",
	"orders": "Commande", "campaigns": "Campagne", "messages": "Message",
	"categories": "Catégorie", "brands": "Marque", "suppliers": "Fournisseur",
	"users": "Utilisateur", "vaults": "Coffre", "cash-sessions": "Session de caisse",
	"stock-movements": "Mouvement de stock", "message-templates": "Modèle de message",
}

// humaniseDetail remplace ce qui reste de vocabulaire technique. Le travail se
// fait ici plutot qu'en SQL : une cascade de CASE dans la requete aurait ete
// illisible, et la liste des motifs bouge plus souvent que la requete.
func humaniseDetail(kind, detail string) string {
	switch kind {
	case "stock":
		for technical, plain := range motifs {
			if strings.HasSuffix(detail, ", "+technical) {
				return strings.TrimSuffix(detail, ", "+technical) + ", " + plain
			}
		}
	case "delete":
		// La trace d'audit s'ecrit « sales #11 ».
		parts := strings.SplitN(detail, " #", 2)
		if len(parts) == 2 {
			if label, ok := pieces[parts[0]]; ok {
				return label + " n° " + parts[1]
			}
		}
	}
	return detail
}

// journal rend le fil et les quelques chiffres qui le resument.
func (s *Server) journal(c *fiber.Ctx) error {
	days, _ := strconv.Atoi(c.Query("days", "1"))
	if days < 1 || days > 90 {
		days = 1
	}
	// La journee commence a minuit, pas vingt-quatre heures en arriere : un
	// gerant qui ouvre l'ecran a neuf heures veut sa matinee, pas la soiree de
	// la veille.
	from := time.Now().AddDate(0, 0, -(days - 1)).Truncate(24 * time.Hour)

	events := make([]journalEvent, 0)
	if err := s.DB.Raw(journalQuery, map[string]any{"from": from}).Scan(&events).Error; err != nil {
		return err
	}
	for i := range events {
		events[i].Detail = humaniseDetail(events[i].Kind, events[i].Detail)
	}

	var summary struct {
		Sales, Revenue, Collected, Expenses, Returns, Customers int64
	}
	s.DB.Raw(`select
		(select count(*) from sales where created_at >= @from and status <> 'cancelled') sales,
		(select coalesce(sum(total),0) from sales where created_at >= @from and status <> 'cancelled') revenue,
		(select coalesce(sum(amount),0) from sale_payments where created_at >= @from and status <> 'cancelled') collected,
		(select coalesce(sum(amount),0) from expenses where created_at >= @from) expenses,
		(select coalesce(sum(amount),0) from sale_returns where created_at >= @from) returns,
		(select count(*) from customers where created_at >= @from) customers`,
		map[string]any{"from": from}).Scan(&summary)

	// Ce qui demande une action, aujourd'hui, quelle que soit la periode
	// consultee : une rupture de stock ou un impaye ne datent pas.
	var attention struct {
		OutOfStock, LowStock, Debtors, Due, FailedMessages, PendingOrders int64
	}
	s.DB.Raw(`select
		(select count(*) from product_variants where active and stock <= 0) out_of_stock,
		(select count(*) from product_variants where active and stock > 0 and alert_at > 0 and stock <= alert_at) low_stock,
		(select count(distinct customer_id) from sales where status <> 'cancelled' and total > paid and customer_id is not null) debtors,
		(select coalesce(sum(greatest(total - paid, 0)),0) from sales where status <> 'cancelled') due,
		(select count(*) from messages where status = 'failed') failed_messages,
		(select count(*) from orders where status = 'pending') pending_orders`).Scan(&attention)

	return c.JSON(fiber.Map{
		"days": days, "from": from,
		"summary": fiber.Map{
			"sales": summary.Sales, "revenue": summary.Revenue, "collected": summary.Collected,
			"expenses": summary.Expenses, "returns": summary.Returns, "customers": summary.Customers,
		},
		"attention": fiber.Map{
			"outOfStock": attention.OutOfStock, "lowStock": attention.LowStock,
			"debtors": attention.Debtors, "due": attention.Due,
			"failedMessages": attention.FailedMessages, "pendingOrders": attention.PendingOrders,
		},
		"events": events,
	})
}
