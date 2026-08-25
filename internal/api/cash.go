package api

import (
	"time"

	"github.com/gofiber/fiber/v2"

	"senvalise/internal/models"
)

// La caisse du jour, vue du comptoir.
//
// Ouvrir une caisse demandait de remplir une fiche complete : utilisateur,
// statut, date d'ouverture, montant attendu, montant de cloture. Quatre de ces
// cinq champs n'ont qu'une valeur possible au moment ou l'on ouvre le tiroir —
// c'est moi, c'est maintenant, c'est ouvert, et l'attendu vaut le fond. Seul
// le fond initial est une vraie question. Le reste est desormais deduit, et la
// fiche complete reste accessible a part pour rattraper une caisse de la
// veille qu'on avait oublie de saisir.
//
// A la cloture, ce qui compte est le montant attendu. Il ne se recalcule pas
// ici : il est tenu a jour mouvement par mouvement par trackCashAs, seule
// facon d'etre juste quand un reglement est annule ou un remboursement rendu.
// Cette lecture ne fait que l'expliquer — d'ou vient chaque franc — pour que
// le vendeur puisse chercher l'ecart au lieu de le subir.

type cashBreakdown struct {
	Label  string `json:"label"`
	Amount int64  `json:"amount"`
}

// cashCategories nomme les mouvements dans la langue du comptoir, et fixe leur
// ordre d'affichage : ce qui entre d'abord, ce qui sort ensuite.
var cashCategories = []struct{ key, label string }{
	{"vente", "Ventes et règlements encaissés"},
	{"coffre", "Versements des clients au coffre"},
	{"dépense", "Dépenses réglées en espèces"},
	{"remboursement", "Remboursements rendus"},
}

// currentCash rend la caisse ouverte du vendeur connecte, avec le detail de
// son montant attendu. Sans caisse ouverte, elle rend un objet vide plutot
// qu'une erreur : ne pas avoir ouvert son tiroir est un etat normal.
func (s *Server) currentCash(c *fiber.Ctx) error {
	uid := c.Locals("userID").(uint)
	var session models.CashSession
	if s.DB.Where("user_id = ? AND status = 'open'", uid).First(&session).Error != nil {
		return c.JSON(fiber.Map{"open": false})
	}

	sums := map[string]int64{}
	var rows []struct {
		Category string
		Amount   int64
	}
	s.DB.Table("cash_movements").
		Select("category, coalesce(sum(amount),0) amount").
		Where("cash_session_id = ?", session.ID).
		Group("category").Scan(&rows)
	for _, row := range rows {
		sums[row.Category] = row.Amount
	}

	detail := []cashBreakdown{{Label: "Fond de caisse à l’ouverture", Amount: session.OpeningAmount}}
	var known int64
	for _, item := range cashCategories {
		if sums[item.key] != 0 {
			detail = append(detail, cashBreakdown{Label: item.label, Amount: sums[item.key]})
		}
		known += sums[item.key]
		delete(sums, item.key)
	}
	// Un mouvement d'une categorie inconnue existerait sans etre montre, et
	// l'attendu ne tomberait plus juste. On le rend sous son nom brut plutot
	// que de le taire.
	for category, amount := range sums {
		if amount != 0 {
			detail = append(detail, cashBreakdown{Label: category, Amount: amount})
		}
	}

	return c.JSON(fiber.Map{
		"open": true, "id": session.ID, "openedAt": session.OpenedAt,
		"openingAmount": session.OpeningAmount, "expectedAmount": session.ExpectedAmount,
		"detail": detail,
	})
}

// Le detail d'une caisse, une fois qu'elle est fermee.
//
// La liste ne disait que trois montants : fond, attendu, compte. Quand l'ecart
// tombait a moins mille francs, rien ne permettait de chercher d'ou il venait
// — ni quelles ventes avaient alimente le tiroir, ni quelles depenses en
// etaient sorties. Le gerant n'avait plus qu'a croire ou soupconner.
//
// Cette lecture rend le tiroir ligne par ligne : chaque mouvement avec son
// heure, son motif et son montant, et le rapprochement entre le fond de depart
// et le montant compte.

type cashMovementRow struct {
	At       time.Time `json:"at"`
	Category string    `json:"category"`
	Note     string    `json:"note"`
	Amount   int64     `json:"amount"`
	Who      string    `json:"who"`
}

func (s *Server) cashDetail(c *fiber.Ctx) error {
	id := c.Params("id")
	var session models.CashSession
	if s.DB.First(&session, id).Error != nil {
		return fiber.NewError(404, "Session de caisse introuvable")
	}
	// Un vendeur ne consulte que ses propres caisses : celle d'un collegue ne
	// le regarde pas, et l'ecart qu'elle porte encore moins.
	if !isManager(c) {
		if uid, _ := c.Locals("userID").(uint); session.UserID != uid {
			return fiber.NewError(403, "Cette caisse est celle d’un autre vendeur.")
		}
	}

	movements := []cashMovementRow{}
	s.DB.Raw(`select m.created_at at, m.category, coalesce(m.note,'') note, m.amount,
	                 coalesce(u.name,'—') who
	    from cash_movements m left join users u on u.id = m.user_id
	   where m.cash_session_id = ? order by m.created_at asc, m.id asc`, session.ID).Scan(&movements)

	// Le resume par motif repond a « d'ou vient l'argent » sans qu'on ait a
	// additionner soi-meme trente lignes.
	sums := map[string]int64{}
	counts := map[string]int64{}
	for _, m := range movements {
		sums[m.Category] += m.Amount
		counts[m.Category]++
	}
	detail := []fiber.Map{{"label": "Fond de caisse à l’ouverture", "amount": session.OpeningAmount, "count": 0}}
	for _, item := range cashCategories {
		if counts[item.key] > 0 {
			detail = append(detail, fiber.Map{"label": item.label, "amount": sums[item.key], "count": counts[item.key]})
		}
		delete(sums, item.key)
		delete(counts, item.key)
	}
	for category, amount := range sums {
		detail = append(detail, fiber.Map{"label": category, "amount": amount, "count": counts[category]})
	}

	var holder string
	s.DB.Table("users").Where("id = ?", session.UserID).Pluck("name", &holder)
	gap := int64(0)
	if session.Status == "closed" {
		gap = session.ClosingAmount - session.ExpectedAmount
	}
	return c.JSON(fiber.Map{
		"id": session.ID, "status": session.Status, "holder": holder,
		"openedAt": session.OpenedAt, "closedAt": session.ClosedAt,
		"openingAmount": session.OpeningAmount, "expectedAmount": session.ExpectedAmount,
		"closingAmount": session.ClosingAmount, "gap": gap,
		"detail": detail, "movements": movements,
	})
}
