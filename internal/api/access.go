package api

import (
	"encoding/json"

	"github.com/gofiber/fiber/v2"
)

// Cloisonnement des rôles.
//
// Le gérant pilote, le vendeur tient le comptoir. Le menu portait déjà cette
// distinction, mais elle s'arrêtait à l'affichage : l'API, elle, répondait à
// tout le monde. Un menu masqué n'a jamais protégé une donnée — un appel direct
// suffisait à lire les dépenses, les coûts d'achat ou la boutique. Les règles
// ci-dessous sont appliquées côté serveur, seul endroit qui compte.

// Ressources dont la lecture est réservée au gérant : les achats et les
// fournisseurs (ils révèlent les marges), les comptes et réglages, le journal
// d'audit, et tout ce qui relève de la boutique en ligne.
var managerRead = map[string]bool{
	"suppliers": true, "arrivals": true, "vaults": true, "orders": true,
	"home-blocks": true, "contact-messages": true, "messages": true,
	"message-templates": true, "settings": true, "delivery-zones": true,
	"users": true, "activity-logs": true,
}

// Champs qui exposent le prix d'achat, donc la marge. Ils sont retirés des
// réponses faites à un vendeur où qu'ils apparaissent dans la charge utile :
// une déclinaison, une ligne de vente, un arrivage imbriqué.
var costFields = map[string]bool{
	"cost": true, "unitCost": true, "landedCost": true,
	"shipping": true, "customs": true, "otherFees": true, "exchangeRate": true,
}

func isManager(c *fiber.Ctx) bool { return c.Locals("role") == "manager" }

// respond renvoie la charge utile, débarrassée des champs de coût lorsque
// l'appelant n'est pas gérant. Le passage par une forme générique coûte une
// sérialisation supplémentaire, mais évite d'oublier un champ imbriqué au fil
// des évolutions du modèle — ce qu'une liste de champs par ressource ne
// garantirait pas.
func (s *Server) respond(c *fiber.Ctx, payload any) error {
	if isManager(c) {
		return c.JSON(payload)
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	var tree any
	if err := json.Unmarshal(raw, &tree); err != nil {
		return err
	}
	return c.JSON(scrubCosts(tree))
}

func scrubCosts(node any) any {
	switch value := node.(type) {
	case map[string]any:
		for key, child := range value {
			if costFields[key] {
				delete(value, key)
				continue
			}
			value[key] = scrubCosts(child)
		}
		return value
	case []any:
		for index, child := range value {
			value[index] = scrubCosts(child)
		}
		return value
	}
	return node
}
