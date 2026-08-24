package api

import (
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
