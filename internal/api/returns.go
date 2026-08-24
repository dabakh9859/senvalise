package api

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// Ce qu'il faut pour enregistrer un retour, vu du comptoir.
//
// Le formulaire de retour demandait un numero de facture, un identifiant de
// declinaison, une quantite et un montant — quatre nombres que personne n'a
// sous la main quand une cliente repose une valise sur le comptoir. Le montant
// remboursable, surtout, se calcule au prorata de la ligne : il etait saisi de
// tete, et il tombait faux.
//
// Ces deux lectures renversent le sens du formulaire. On cherche la facture
// comme on la cherche vraiment — par son numero ou par le nom de la cliente —
// puis on coche des lignes deja chiffrees. Rien n'est a calculer.
//
// Le calcul du retournable est refait ici plutot que devine par l'ecran :
// c'est exactement celui que processReturn applique a l'enregistrement, et un
// ecran qui proposerait davantage se ferait refuser sans que le vendeur
// comprenne pourquoi.

type returnableSale struct {
	ID         uint      `json:"id"`
	Reference  string    `json:"reference"`
	Customer   string    `json:"customer"`
	CreatedAt  time.Time `json:"createdAt"`
	Total      int64     `json:"total"`
	Paid       int64     `json:"paid"`
	Status     string    `json:"status"`
	ItemsCount int64     `json:"itemsCount"`
}

// searchReturnableSales cherche les factures sur lesquelles un retour est
// encore possible. Les factures annulees sont ecartees : processReturn les
// refuse, les proposer serait une impasse.
func (s *Server) searchReturnableSales(c *fiber.Ctx) error {
	q := strings.TrimSpace(c.Query("q"))
	rows := []returnableSale{}
	db := s.DB.Table("sales s").
		Select(`s.id, s.reference, coalesce(cu.name,'Client comptoir') customer,
		        s.created_at, s.total, s.paid, s.status,
		        (select coalesce(sum(quantity),0) from sale_items where sale_id = s.id) items_count`).
		Joins("left join customers cu on cu.id = s.customer_id").
		Where("s.status <> 'cancelled'").
		Order("s.id desc").Limit(12)
	if q != "" {
		db = db.Where("s.reference ILIKE ? OR cu.name ILIKE ? OR cu.phone ILIKE ?", "%"+q+"%", "%"+q+"%", "%"+q+"%")
	}
	if err := db.Scan(&rows).Error; err != nil {
		return err
	}
	return c.JSON(rows)
}

type returnableLine struct {
	VariantID uint   `json:"variantId"`
	Name      string `json:"name"`
	Detail    string `json:"detail"`
	Sold      int64  `json:"sold"`
	Returned  int64  `json:"returned"`
	Remaining int64  `json:"remaining"`
	UnitPrice int64  `json:"unitPrice"`
	MaxRefund int64  `json:"maxRefund"`
	// Bruts de la ligne, gardes pour le calcul du remboursable. Ils sortent
	// aussi vers l'ecran : voir « deja rembourse » evite de croire a une
	// erreur quand le remboursable est plus petit que le prix affiche.
	LineTotal int64 `json:"lineTotal"`
	Refunded  int64 `json:"refunded"`
}

// returnableLines rend les lignes d'une facture avec ce qu'il reste a rendre.
//
// MaxRefund est le remboursement maximal pour la totalite du restant ; l'ecran
// le ramene au prorata des unites reellement cochees, comme le fait le
// serveur a l'enregistrement.
func (s *Server) returnableLines(c *fiber.Ctx) error {
	id := c.Params("id")
	var sale struct {
		ID        uint
		Reference string
		Status    string
		Paid      int64
		Customer  string
	}
	err := s.DB.Table("sales s").
		Select("s.id, s.reference, s.status, s.paid, coalesce(cu.name,'Client comptoir') customer").
		Joins("left join customers cu on cu.id = s.customer_id").
		Where("s.id = ?", id).Scan(&sale).Error
	if err != nil {
		return err
	}
	if sale.ID == 0 {
		return fiber.NewError(404, "Facture introuvable")
	}
	if sale.Status == "cancelled" {
		return fiber.NewError(422, "Cette facture est annulée : aucun retour n'est possible.")
	}

	lines := []returnableLine{}
	// Le nom affiche est celui du produit, complete par la couleur et la
	// taille quand elles distinguent deux lignes. Le SKU ne sert que de
	// dernier recours : il ne se lit pas a voix haute au comptoir.
	err = s.DB.Table("sale_items si").
		Select(`si.variant_id,
		        coalesce(nullif(p.name,''), v.sku, 'Article') name,
		        trim(both ' ·' from coalesce(nullif(v.color,''),'') || ' · ' || coalesce(nullif(v.size,''),'')) detail,
		        si.quantity sold,
		        coalesce((select sum(ri.quantity) from return_items ri
		                  join sale_returns sr on sr.id = ri.sale_return_id
		                 where sr.sale_id = si.sale_id and ri.variant_id = si.variant_id),0) returned,
		        case when si.quantity > 0 then si.total / si.quantity else 0 end unit_price,
		        si.total line_total,
		        coalesce((select sum(ri.amount) from return_items ri
		                  join sale_returns sr on sr.id = ri.sale_return_id
		                 where sr.sale_id = si.sale_id and ri.variant_id = si.variant_id),0) refunded`).
		Joins("left join product_variants v on v.id = si.variant_id").
		Joins("left join products p on p.id = v.product_id").
		Where("si.sale_id = ?", sale.ID).
		Order("si.id").Scan(&lines).Error
	if err != nil {
		return err
	}

	// Le restant et le remboursable se calculent en Go : la requete rend les
	// bruts, ce petit calcul reste plus lisible ici qu'en SQL.
	for i := range lines {
		lines[i].Remaining = lines[i].Sold - lines[i].Returned
		if lines[i].Remaining < 0 {
			lines[i].Remaining = 0
		}
		// Rendre tout le restant vaut le total de la ligne moins ce qui en a
		// déjà été remboursé : c'est exactement le plafond que processReturn
		// applique pour ces unités.
		lines[i].MaxRefund = lines[i].LineTotal - lines[i].Refunded
		if lines[i].MaxRefund < 0 {
			lines[i].MaxRefund = 0
		}
	}

	// Ce qui a deja ete rembourse sur la facture borne le reste : on ne rend
	// jamais plus que ce qui a ete encaisse, et l'ecran doit le savoir avant
	// que le serveur ne refuse.
	// Ce que la boutique détient encore borne le reste : Paid est déjà net des
	// remboursements passés. Le total déjà rendu n'est affiché que pour
	// expliquer un remboursable plus petit que le montant de la facture.
	var refundedTotal int64
	s.DB.Table("return_items ri").
		Joins("join sale_returns sr on sr.id = ri.sale_return_id").
		Where("sr.sale_id = ?", sale.ID).
		Select("coalesce(sum(ri.amount),0)").Scan(&refundedTotal)

	return c.JSON(fiber.Map{
		"id": sale.ID, "reference": sale.Reference, "customer": sale.Customer,
		"paid": sale.Paid, "refunded": refundedTotal, "refundable": sale.Paid,
		"lines": lines,
	})
}
