package api

import (
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
	"senvalise/internal/models"
)

// Intégrité des données et messages d'erreur.
//
// Trois besoins se rejoignent ici. Les erreurs PostgreSQL ne doivent jamais
// sortir telles quelles : elles nomment les tables et les contraintes, ce qui
// n'aide pas l'utilisateur et renseigne un attaquant. Les suppressions doivent
// se comporter de façon prévisible plutôt que d'échouer sur une violation de
// clé étrangère. Et les références de document doivent être uniques, y compris
// quand deux caisses enregistrent une vente dans la même milliseconde.

// ---------- traduction des erreurs de base ----------

// dbError transforme une erreur PostgreSQL en message métier. La cause réelle
// part dans les journaux du serveur, seul endroit où elle a sa place.
func dbError(e error, context string) error {
	if e == nil {
		return nil
	}
	var pg *pgconn.PgError
	if errors.As(e, &pg) {
		log.Printf("erreur base (%s) : %s %s %s", context, pg.Code, pg.ConstraintName, pg.Message)
		switch pg.Code {
		case "23505":
			return fiber.NewError(409, "Cette valeur existe déjà : "+uniqueHint(pg.ConstraintName))
		case "23503":
			return fiber.NewError(409, "Cet enregistrement est rattaché à d’autres données et ne peut pas être modifié ainsi.")
		case "23502":
			return fiber.NewError(422, "Un champ obligatoire est vide.")
		case "23514":
			return fiber.NewError(422, "Une valeur saisie est hors des limites autorisées.")
		case "22001":
			return fiber.NewError(422, "Une valeur saisie est trop longue.")
		}
		return fiber.NewError(422, "L’enregistrement a été refusé par la base de données.")
	}
	if errors.Is(e, gorm.ErrRecordNotFound) {
		return fiber.ErrNotFound
	}
	log.Printf("erreur (%s) : %v", context, e)
	return fiber.NewError(422, "L’opération n’a pas pu être enregistrée.")
}

// uniqueHint nomme le champ en cause à partir du nom de l'index, sans révéler
// la structure des tables.
func uniqueHint(constraint string) string {
	switch {
	case contains(constraint, "email"):
		return "cette adresse e-mail est déjà utilisée."
	case contains(constraint, "reference"):
		return "cette référence est déjà attribuée."
	case contains(constraint, "slug"):
		return "cet identifiant d’URL est déjà pris."
	case contains(constraint, "sku"):
		return "ce SKU est déjà utilisé par une autre déclinaison."
	case contains(constraint, "barcode"):
		return "ce code-barres est déjà utilisé."
	case contains(constraint, "key"):
		return "cette clé de réglage existe déjà."
	}
	return "un enregistrement identique est déjà présent."
}

func contains(haystack, needle string) bool {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}

// ---------- références de document ----------

// ref compose une référence unique à partir d'une séquence PostgreSQL.
//
// L'ancienne version n'utilisait qu'un horodatage à la milliseconde : deux
// ventes enregistrées dans la même milliseconde recevaient la même référence,
// et l'index unique en rejetait une — une vente réelle perdue, avec une erreur
// SQL brute au comptoir. Une séquence ne revient jamais en arrière et ne
// participe pas aux transactions, donc un rollback ne peut pas la faire
// rejouer un numéro déjà servi.
func (s *Server) ref(prefix string) string {
	var n int64
	if e := s.DB.Raw("SELECT nextval('document_refs')").Scan(&n).Error; e != nil || n == 0 {
		// Repli défensif : mieux vaut une référence horodatée qu'aucune vente.
		log.Printf("séquence de référence indisponible (%v), repli horodaté", e)
		return fallbackRef(prefix)
	}
	return fmt.Sprintf("%s-%s-%05d", prefix, time.Now().Format("20060102"), n)
}

// fallbackCounter garantit l'unicité du repli. L'horodatage seul, même à la
// microseconde, se répète sur deux appels rapprochés — c'est précisément le
// défaut que la séquence corrige, il ne faut pas le réintroduire ici.
var fallbackCounter atomic.Uint64

func fallbackRef(prefix string) string {
	return fmt.Sprintf("%s-%s-%06d", prefix, time.Now().Format("20060102-150405"), fallbackCounter.Add(1)%1000000)
}

// ---------- verrouillage du stock ----------

// lockVariants prend un verrou exclusif sur chaque déclinaison concernée, par
// identifiant croissant, avant toute écriture.
//
// L'ordre et l'antériorité comptent tous les deux. Insérer d'abord la ligne de
// vente posait un verrou partagé sur la déclinaison via la clé étrangère, que
// le verrou exclusif demandé ensuite devait faire monter en grade : deux
// caisses simultanées se bloquaient mutuellement et PostgreSQL en tuait une.
// Verrouiller en premier supprime la promotion ; verrouiller dans un ordre
// stable supprime l'interblocage croisé entre deux paniers multi-lignes.
func lockVariants(tx *gorm.DB, ids []uint) (map[uint]models.ProductVariant, error) {
	seen := map[uint]bool{}
	ordered := make([]uint, 0, len(ids))
	for _, id := range ids {
		if id != 0 && !seen[id] {
			seen[id] = true
			ordered = append(ordered, id)
		}
	}
	sort.Slice(ordered, func(a, b int) bool { return ordered[a] < ordered[b] })
	out := make(map[uint]models.ProductVariant, len(ordered))
	for _, id := range ordered {
		var v models.ProductVariant
		if e := tx.Clauses(lockForUpdate()).First(&v, id).Error; e != nil {
			return nil, fmt.Errorf("déclinaison introuvable (%d)", id)
		}
		out[id] = v
	}
	return out, nil
}

// ---------- suppressions ----------

type relation struct{ table, column string }

type blocker struct {
	rel     relation
	message string
}

// deleteChildren liste ce qui doit disparaître avec l'enregistrement parent :
// des lignes qui n'ont aucune existence propre.
var deleteChildren = map[string][]relation{
	"sales":          {{"sale_payments", "sale_id"}, {"sale_items", "sale_id"}},
	"returns":        {{"return_items", "sale_return_id"}},
	"quotes":         {{"quote_items", "quote_id"}},
	"delivery-notes": {{"delivery_note_items", "delivery_note_id"}},
	"arrivals":       {{"arrival_items", "arrival_id"}},
	"orders":         {{"order_items", "order_id"}},
	"vaults":         {{"vault_deposits", "vault_id"}},
	"cash-sessions":  {{"cash_movements", "cash_session_id"}},
	"customers":      {{"customer_addresses", "customer_id"}},
	// Les declinaisons partent avec leur produit. Elles etaient un obstacle a
	// sa suppression, du temps ou l'ecran permettait de les gerer une a une ;
	// depuis qu'elles n'y sont plus, ce refus etait sans issue — le produit
	// devenait indestructible. Leur histoire commerciale reste protegee : voir
	// productVariantBlockers.
	"products": {{"product_specs", "product_id"}, {"product_colorways", "product_id"}, {"product_images", "product_id"}},
	"variants": {{"stock_movements", "variant_id"}},
}

// deleteBlockers liste ce qui interdit la suppression : des données qui ont
// une valeur comptable ou historique propre. Mieux vaut un refus explicite
// qu'un effacement silencieux de l'historique.
var deleteBlockers = map[string][]blocker{
	"sales": {
		{relation{"sale_returns", "sale_id"}, "Cette facture a fait l’objet d’un retour. Annulez le retour avant de la supprimer."},
		{relation{"delivery_notes", "sale_id"}, "Un bon de livraison est rattaché à cette facture. Supprimez-le d’abord."},
	},
	"customers": {
		{relation{"sales", "customer_id"}, "Ce client a des factures. Désactivez sa fiche plutôt que de la supprimer."},
		{relation{"quotes", "customer_id"}, "Ce client a des devis. Désactivez sa fiche plutôt que de la supprimer."},
		{relation{"orders", "customer_id"}, "Ce client a des commandes en ligne. Désactivez sa fiche plutôt que de la supprimer."},
		{relation{"vaults", "customer_id"}, "Ce client possède un coffre. Clôturez le coffre avant de supprimer la fiche."},
	},
	"variants": {
		{relation{"sale_items", "variant_id"}, "Cette déclinaison figure sur des factures. Désactivez-la plutôt que de la supprimer."},
		{relation{"quote_items", "variant_id"}, "Cette déclinaison figure sur des devis. Désactivez-la plutôt que de la supprimer."},
		{relation{"delivery_note_items", "variant_id"}, "Cette déclinaison figure sur des bons de livraison. Désactivez-la."},
		{relation{"return_items", "variant_id"}, "Cette déclinaison figure sur des retours. Désactivez-la."},
		{relation{"arrival_items", "variant_id"}, "Cette déclinaison figure sur des arrivages. Désactivez-la."},
		{relation{"order_items", "variant_id"}, "Cette déclinaison figure sur des commandes en ligne. Désactivez-la."},
	},
	"products": {},
	"categories": {
		{relation{"products", "category_id"}, "Des produits utilisent cette catégorie. Reclassez-les avant de la supprimer."},
	},
	"brands": {
		{relation{"products", "brand_id"}, "Des produits utilisent cette marque. Reclassez-les avant de la supprimer."},
	},
	"suppliers": {
		{relation{"arrivals", "supplier_id"}, "Ce fournisseur a des arrivages. Son historique doit être conservé."},
		{relation{"expenses", "supplier_id"}, "Ce fournisseur apparaît dans les dépenses. Son historique doit être conservé."},
	},
	"users": {
		{relation{"sales", "user_id"}, "Cet utilisateur a enregistré des ventes. Désactivez son compte plutôt que de le supprimer."},
		{relation{"quotes", "user_id"}, "Cet utilisateur a établi des devis. Désactivez son compte plutôt que de le supprimer."},
		{relation{"stock_movements", "user_id"}, "Cet utilisateur a réalisé des mouvements de stock. Désactivez son compte."},
	},
	"quotes": {
		{relation{"sales", "quote_id"}, "Ce devis a été converti en facture. Supprimez la facture d’abord."},
	},
	"arrivals": {},
}

// countRelated compte les lignes qui pointent vers l'enregistrement.
func countRelated(db *gorm.DB, rel relation, id string) (int64, error) {
	var n int64
	e := db.Table(rel.table).Where(rel.column+" = ?", id).Count(&n).Error
	return n, e
}

// deleteWithChildren applique les règles ci-dessus dans une transaction :
// refus motivé si l'enregistrement porte de l'histoire, sinon suppression des
// lignes filles puis du parent.
// stockDocuments liste les pieces dont la suppression doit rendre le stock.
//
// Supprimer une facture retirait la piece, ses lignes et ses reglements, mais
// laissait la marchandise sortie : les articles disparaissaient du stock sans
// avoir ete vendus ni etre revenus. Le meme trou existait pour les trois
// autres pieces qui deplacent du stock — un arrivage supprime laissait des
// unites jamais recues, un retour supprime laissait des unites jamais rendues,
// une commande web supprimee laissait de la marchandise partie.
var stockDocuments = map[string]bool{"sales": true, "returns": true, "arrivals": true, "orders": true}

// reverseStock annule l'effet d'une piece sur le stock avant sa suppression.
//
// La compensation se calcule sur le journal des mouvements, et non sur les
// lignes de la piece : c'est le journal qui dit ce qui a reellement bouge. Une
// facture modifiee apres coup porte des mouvements « sale_edit » que ses lignes
// actuelles ne refletent plus, et une commande web jamais convertie n'a rien
// sorti du tout — repartir des lignes rendrait du stock fantome dans un cas et
// pas assez dans l'autre.
//
// Le mouvement inverse est enregistre plutot que l'original efface : deux
// ecritures qui s'annulent racontent ce qui s'est passe, une ligne effacee ne
// raconte rien.
func (s *Server) reverseStock(tx *gorm.DB, name, id string, userID uint) error {
	if !stockDocuments[name] {
		return nil
	}
	var reference string
	if e := tx.Model(modelFor(name)).Where("id = ?", id).Pluck("reference", &reference).Error; e != nil {
		return dbError(e, "lecture de la référence")
	}
	if strings.TrimSpace(reference) == "" {
		return nil
	}
	type move struct {
		VariantID uint
		Qty       int64
	}
	var moves []move
	// Par identifiant croissant, comme partout ailleurs : deux suppressions
	// simultanees qui toucheraient les memes declinaisons s'interbloqueraient
	// si elles les verrouillaient dans un ordre different.
	if e := tx.Raw(`select variant_id, sum(quantity) qty from stock_movements
		where reference = ? group by variant_id having sum(quantity) <> 0
		order by variant_id asc`, reference).Scan(&moves).Error; e != nil {
		return dbError(e, "lecture des mouvements de stock")
	}
	for _, m := range moves {
		// Un stock qui passerait sous zero fait echouer toute la suppression :
		// supprimer un arrivage dont la marchandise est deja vendue reviendrait
		// a retirer des unites qui ne sont plus la.
		if e := s.adjust(tx, m.VariantID, -m.Qty, userID, name+"_deleted", reference); e != nil {
			return fiber.NewError(409, e.Error())
		}
	}
	return nil
}

func (s *Server) deleteWithChildren(name, id string, userID uint) error {
	for _, b := range deleteBlockers[name] {
		n, e := countRelated(s.DB, b.rel, id)
		if e != nil {
			return dbError(e, "vérification avant suppression")
		}
		if n > 0 {
			return fiber.NewError(409, b.message)
		}
	}
	if name == "products" {
		if e := checkProductVariants(s.DB, id); e != nil {
			return e
		}
	}
	out := modelFor(name)
	return s.DB.Transaction(func(tx *gorm.DB) error {
		if name == "products" {
			if e := deleteProductVariants(tx, id); e != nil {
				return e
			}
		}
		// Le stock est rendu avant que les lignes ne disparaissent : c'est la
		// meme transaction, donc un echec ici laisse la piece intacte.
		if e := s.reverseStock(tx, name, id, userID); e != nil {
			return e
		}
		for _, child := range deleteChildren[name] {
			if e := tx.Exec("DELETE FROM "+child.table+" WHERE "+child.column+" = ?", id).Error; e != nil {
				return dbError(e, "suppression des lignes rattachées")
			}
		}
		// Un devis converti garde un lien vers sa facture, et inversement :
		// on desserre le lien avant de retirer l'une des deux extrémités.
		switch name {
		case "sales":
			if e := tx.Exec("UPDATE quotes SET converted_sale_id = NULL WHERE converted_sale_id = ?", id).Error; e != nil {
				return dbError(e, "détachement du devis")
			}
		case "quotes":
			if e := tx.Exec("UPDATE sales SET quote_id = NULL WHERE quote_id = ?", id).Error; e != nil {
				return dbError(e, "détachement de la facture")
			}
		}
		result := tx.Delete(out, id)
		if result.Error != nil {
			return dbError(result.Error, "suppression")
		}
		if result.RowsAffected == 0 {
			return fiber.ErrNotFound
		}
		return nil
	})
}

// ---------- recherche ----------

// searchColumns décrit ce sur quoi porte le paramètre ?q= de chaque ressource.
// Il ne cherchait auparavant que dans l'identifiant, ce qui rendait la barre
// de recherche inopérante dès qu'on tapait un nom.
var searchColumns = map[string][]string{
	"categories":        {"name", "slug", "description"},
	"brands":            {"name", "slug"},
	"suppliers":         {"name", "phone", "email", "address"},
	"customers":         {"name", "phone", "email", "address", "zone"},
	"products":          {"name", "slug", "description", "blurb", "tag"},
	"variants":          {"sku", "barcode", "color", "size"},
	"stock-movements":   {"reference", "reason", "note", "type"},
	"arrivals":          {"reference", "status", "currency"},
	"sales":             {"reference", "status", "payment_method", "channel"},
	"returns":           {"reference", "reason", "refund_method"},
	"quotes":            {"reference", "status", "notes"},
	"delivery-notes":    {"reference", "status", "notes"},
	"orders":            {"reference", "status", "payment_method", "delivery_zone", "address"},
	"vaults":            {"status", "goal_ref"},
	"cash-sessions":     {"status"},
	"cash-movements":    {"direction", "category", "note"},
	"messages":          {"recipient", "channel", "type", "subject", "body", "status"},
	"message-templates": {"name", "channel", "type", "subject", "body"},
	"home-blocks":       {"kind", "title", "body", "link"},
	"activity-logs":     {"action", "entity", "details"},
	"delivery-zones":    {"name", "slug", "area"},
	"contact-messages":  {"name", "email", "phone", "subject", "body", "status"},
	"expenses":          {"reference", "label", "category", "payment_method", "note"},
	"users":             {"name", "email", "role"},
	"product-images":    {"url", "alt"},
}

// searchCustomer liste les pieces qu'on cherche par le nom de leur client.
//
// La recherche ne portait que sur le numero et le statut : taper « Adji » dans
// les factures ne rendait rien, et il fallait connaitre la reference par coeur
// pour retrouver une piece. C'est pourtant le geste le plus frequent de la
// journee — on cherche la facture de quelqu'un, pas le numero 00048.
var searchCustomer = map[string]bool{
	"sales": true, "quotes": true, "delivery-notes": true, "orders": true,
}

// applySearch ajoute la clause de recherche. La casse et les accents sont
// ignorés côté SQL pour que « Fatou » trouve « fatou » et « FATOU ».
func applySearch(db *gorm.DB, name, q string) *gorm.DB {
	// Une piece se cherche aussi par son client. La sous-requete evite une
	// jointure : le compteur de resultats et la pagination continuent de
	// porter sur les pieces, pas sur des lignes dupliquees.
	if searchCustomer[name] {
		like := "%" + q + "%"
		clause := "CAST(id AS TEXT) LIKE ? OR customer_id IN (SELECT id FROM customers WHERE name ILIKE ? OR phone ILIKE ?)"
		args := []any{like, like, like}
		for _, column := range searchColumns[name] {
			clause += " OR " + column + " ILIKE ?"
			args = append(args, like)
		}
		return db.Where("("+clause+")", args...)
	}
	columns := searchColumns[name]
	if len(columns) == 0 {
		return db.Where("CAST(id AS TEXT) LIKE ?", "%"+q+"%")
	}
	clause := "CAST(id AS TEXT) LIKE ?"
	args := []any{"%" + q + "%"}
	for _, column := range columns {
		clause += " OR " + column + " ILIKE ?"
		args = append(args, "%"+q+"%")
	}
	return db.Where("("+clause+")", args...)
}

// productVariantBlockers protege l'histoire commerciale d'un produit.
//
// Les declinaisons ne bloquent plus la suppression du produit — elles partent
// avec lui. Mais ce qu'elles portent, lui, doit rester : une declinaison citee
// sur une facture ne peut pas s'effacer sans rendre cette facture illisible.
//
// Le refus est formule au niveau du produit, pas de la declinaison. Le mot
// « declinaison » n'existe plus dans l'ecran : renvoyer « cette declinaison
// figure sur des factures » a quelqu'un qui essaie de supprimer un produit ne
// lui dirait rien de ce qu'il doit faire.
var productVariantBlockers = []struct {
	table, message string
}{
	{"sale_items", "Ce produit figure sur des factures. Désactivez-le plutôt que de le supprimer : son historique de ventes doit être conservé."},
	{"quote_items", "Ce produit figure sur des devis. Désactivez-le plutôt que de le supprimer."},
	{"delivery_note_items", "Ce produit figure sur des bons de livraison. Désactivez-le plutôt que de le supprimer."},
	{"return_items", "Ce produit figure sur des retours client. Désactivez-le plutôt que de le supprimer."},
	{"arrival_items", "Ce produit figure sur des arrivages. Désactivez-le plutôt que de le supprimer."},
	{"order_items", "Ce produit figure sur des commandes en ligne. Désactivez-le plutôt que de le supprimer."},
}

// checkProductVariants refuse la suppression d'un produit dont une declinaison
// est citee sur une piece commerciale.
func checkProductVariants(db *gorm.DB, id string) error {
	for _, guard := range productVariantBlockers {
		var count int64
		e := db.Table(guard.table).
			Where(guard.table+".variant_id IN (SELECT id FROM product_variants WHERE product_id = ?)", id).
			Count(&count).Error
		if e != nil {
			return dbError(e, "vérification avant suppression")
		}
		if count > 0 {
			return fiber.NewError(409, guard.message)
		}
	}
	return nil
}

// deleteProductVariants retire les declinaisons d'un produit et le journal de
// stock qui leur est attache.
//
// Le journal part avec elles : il ne designe plus rien une fois la declinaison
// disparue, et le garder ferait echouer la contrainte de cle etrangere. Les
// mouvements lies a une piece commerciale ne sont jamais concernes — un
// produit qui en porte a deja ete refuse plus haut.
func deleteProductVariants(tx *gorm.DB, id string) error {
	if e := tx.Exec(`DELETE FROM stock_movements
	    WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = ?)`, id).Error; e != nil {
		return dbError(e, "suppression du journal de stock")
	}
	if e := tx.Exec("DELETE FROM product_variants WHERE product_id = ?", id).Error; e != nil {
		return dbError(e, "suppression des déclinaisons")
	}
	return nil
}
