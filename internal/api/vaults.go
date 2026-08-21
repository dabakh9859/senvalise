package api

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"senvalise/internal/auth"
	"senvalise/internal/models"
)

// Coffres clients.
//
// Le coffre est une epargne : le client verse au comptoir ou depuis la
// boutique, et paie plus tard avec ce qu'il a mis de cote. Jusqu'ici la
// gestion n'en montrait qu'une liste brute — solde et objectif, sans
// historique ni moyen d'enregistrer un versement recu au comptoir. L'argent
// entrait donc dans le tiroir sans passer par l'application.
//
// Deux regles gouvernent ce fichier :
//
//  1. le solde ne bouge qu'a l'interieur d'une transaction qui verrouille la
//     ligne. Deux versements simultanes sur le meme coffre s'ajouteraient
//     sinon l'un a la place de l'autre ;
//
//  2. un mouvement en especes alimente la session de caisse ouverte. Un
//     versement recu au comptoir est de l'argent dans le tiroir : sans cette
//     ecriture, l'ecart constate a la cloture serait celui du versement.

type vaultRow struct {
	ID          uint    `json:"id"`
	CustomerID  uint    `json:"customerId"`
	Name        string  `json:"name"`
	Phone       string  `json:"phone"`
	Balance     int64   `json:"balance"`
	Goal        int64   `json:"goal"`
	GoalRef     string  `json:"goalRef"`
	Status      string  `json:"status"`
	Deposits    int64   `json:"deposits"`
	LastMoveAt  *string `json:"lastMoveAt"`
	OpenedAt    string  `json:"openedAt"`
	OrdersPaid  int64   `json:"ordersPaid"`
	OrdersTotal int64   `json:"ordersTotal"`
}

// vaults liste les coffres avec le client en face. Sans la jointure, l'ecran
// n'affichait qu'un identifiant : impossible de savoir a qui appartient un
// solde de 250 000 F.
func (s *Server) vaults(c *fiber.Ctx) error {
	rows := make([]vaultRow, 0)
	query := `
		select v.id, v.customer_id, coalesce(cu.name,'Client supprimé') name,
		       coalesce(cu.phone,'') phone, v.balance, v.goal, coalesce(v.goal_ref,'') goal_ref,
		       coalesce(nullif(v.status,''),'open') status,
		       (select count(*) from vault_deposits d where d.vault_id = v.id) deposits,
		       to_char((select max(d.created_at) from vault_deposits d where d.vault_id = v.id),
		               'YYYY-MM-DD"T"HH24:MI:SSTZH:TZM') last_move_at,
		       to_char(v.created_at,'YYYY-MM-DD"T"HH24:MI:SSTZH:TZM') opened_at,
		       (select count(*) from orders o where o.customer_id = v.customer_id and o.payment_method = 'vault') orders_paid,
		       (select coalesce(sum(o.total),0) from orders o where o.customer_id = v.customer_id and o.payment_method = 'vault') orders_total
		  from vaults v
		  left join customers cu on cu.id = v.customer_id`
	if search := strings.TrimSpace(c.Query("q")); search != "" {
		query += ` where cu.name ilike @q or cu.phone ilike @q`
		s.DB.Raw(query+` order by v.balance desc`, map[string]any{"q": "%" + search + "%"}).Scan(&rows)
	} else {
		s.DB.Raw(query + ` order by v.balance desc`).Scan(&rows)
	}
	var totals struct {
		Balance, Open, Closed, MonthIn, MonthOut int64
	}
	s.DB.Raw(`select
		coalesce(sum(balance),0) balance,
		count(*) filter (where coalesce(nullif(status,''),'open') = 'open') open,
		count(*) filter (where status = 'closed') closed,
		(select coalesce(sum(amount),0) from vault_deposits where amount > 0 and created_at >= date_trunc('month', now())) month_in,
		(select coalesce(-sum(amount),0) from vault_deposits where amount < 0 and created_at >= date_trunc('month', now())) month_out
		from vaults`).Scan(&totals)
	return c.JSON(fiber.Map{"rows": rows, "totals": fiber.Map{
		"balance": totals.Balance, "open": totals.Open, "closed": totals.Closed,
		"monthIn": totals.MonthIn, "monthOut": totals.MonthOut}})
}

// vaultDetail rend l'historique d'un coffre. Versements et retraits vivent
// dans la meme table, distingues par le signe du montant : une operation
// n'existe donc jamais qu'a moitie, et le solde se recalcule a partir d'elle.
func (s *Server) vaultDetail(c *fiber.Ctx) error {
	var vault models.Vault
	if s.DB.First(&vault, c.Params("id")).Error != nil {
		return fiber.ErrNotFound
	}
	var customer models.Customer
	s.DB.First(&customer, vault.CustomerID)
	var moves []models.VaultDeposit
	s.DB.Where("vault_id = ?", vault.ID).Order("id desc").Limit(200).Find(&moves)
	var orders []models.Order
	s.DB.Where("customer_id = ? and payment_method = 'vault'", vault.CustomerID).Order("id desc").Limit(50).Find(&orders)
	return c.JSON(fiber.Map{"vault": vault, "customer": customer, "moves": moves, "orders": orders})
}

// vaultsWithoutAccount liste les clients qui n'ont pas encore de coffre. Sans
// cette liste, ouvrir un coffre au comptoir supposerait de connaitre par coeur
// l'identifiant du client.
func (s *Server) vaultCandidates(c *fiber.Ctx) error {
	type candidate struct {
		ID    uint   `json:"id"`
		Name  string `json:"name"`
		Phone string `json:"phone"`
	}
	rows := make([]candidate, 0)
	s.DB.Raw(`select cu.id, cu.name, coalesce(cu.phone,'') phone
		from customers cu
		where cu.active = true
		  and not exists (select 1 from vaults v where v.customer_id = cu.id)
		order by cu.name asc limit 500`).Scan(&rows)
	return c.JSON(rows)
}

func (s *Server) openVault(c *fiber.Ctx) error {
	var in struct {
		CustomerID uint   `json:"customerId"`
		Goal       int64  `json:"goal"`
		GoalRef    string `json:"goalRef"`
	}
	if c.BodyParser(&in) != nil || in.CustomerID == 0 {
		return fiber.NewError(422, "Sélectionnez un client.")
	}
	var customer models.Customer
	if s.DB.First(&customer, in.CustomerID).Error != nil {
		return fiber.NewError(404, "Client introuvable.")
	}
	// La contrainte d'unicite existe en base ; on la double d'un message clair
	// plutot que de laisser remonter une erreur PostgreSQL.
	var existing models.Vault
	if s.DB.Where("customer_id = ?", in.CustomerID).First(&existing).Error == nil {
		return fiber.NewError(422, "Ce client a déjà un coffre.")
	}
	if in.Goal < 0 {
		return fiber.NewError(422, "L'objectif ne peut pas être négatif.")
	}
	vault := models.Vault{CustomerID: in.CustomerID, Goal: in.Goal, GoalRef: strings.TrimSpace(in.GoalRef), Status: "open"}
	if err := s.DB.Create(&vault).Error; err != nil {
		return fiber.NewError(422, err.Error())
	}
	s.log(c, "vault-open", "vaults", vault.ID, "Ouverture du coffre de "+customer.Name)
	return c.Status(201).JSON(vault)
}

// vaultMove enregistre un versement ou un retrait. Les deux passent par le
// meme chemin : c'est la seule facon de garantir qu'un retrait subisse les
// memes verrous et la meme ecriture de caisse qu'un versement.
func (s *Server) vaultMove(c *fiber.Ctx, sign int64) error {
	var in struct {
		Amount int64  `json:"amount"`
		Method string `json:"method"`
		Note   string `json:"note"`
	}
	if c.BodyParser(&in) != nil || in.Amount <= 0 {
		return fiber.NewError(422, "Le montant doit être supérieur à zéro.")
	}
	if strings.TrimSpace(in.Method) == "" {
		in.Method = "cash"
	}
	userID, _ := c.Locals("userID").(uint)
	id64, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return fiber.ErrBadRequest
	}
	amount := sign * in.Amount

	var vault models.Vault
	e := s.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(lockForUpdate()).First(&vault, id64).Error; err != nil {
			return fmt.Errorf("coffre introuvable")
		}
		if vault.Status == "closed" {
			return fmt.Errorf("ce coffre est clôturé")
		}
		if vault.Balance+amount < 0 {
			// Un coffre a decouvert n'a pas de sens : l'argent retire est celui
			// que le client a verse.
			return fmt.Errorf("solde insuffisant : le coffre contient %d F", vault.Balance)
		}
		if err := tx.Model(&vault).Update("balance", gorm.Expr("balance + ?", amount)).Error; err != nil {
			return err
		}
		prefix := "DEP"
		if amount < 0 {
			prefix = "RET"
		}
		move := models.VaultDeposit{VaultID: vault.ID, Amount: amount, Method: in.Method,
			Reference: s.ref(prefix), Note: strings.TrimSpace(in.Note)}
		if err := tx.Create(&move).Error; err != nil {
			return err
		}
		// Especes : le tiroir bouge, la session ouverte doit le savoir. La
		// categorie distingue l'epargne d'une vente : l'argent entre, mais il
		// appartient toujours au client.
		return s.trackCashAs(tx, userID, in.Method, amount, "coffre")
	})
	if e != nil {
		return fiber.NewError(422, e.Error())
	}
	action, label := "vault-deposit", "versement"
	if amount < 0 {
		action, label = "vault-withdraw", "retrait"
	}
	s.log(c, action, "vaults", vault.ID, fmt.Sprintf("%s de %d F (%s)", label, in.Amount, in.Method))
	s.DB.First(&vault, vault.ID)
	return c.Status(201).JSON(vault)
}

// vaultStatus cloture ou rouvre un coffre. Un coffre au solde non nul ne se
// cloture pas : il faudrait d'abord rendre l'argent, sinon la somme disparait
// de la vue du client sans avoir quitte la caisse.
func (s *Server) vaultStatus(c *fiber.Ctx) error {
	var in struct {
		Status string `json:"status"`
	}
	if c.BodyParser(&in) != nil || (in.Status != "open" && in.Status != "closed" && in.Status != "suspended") {
		return fiber.NewError(422, "Statut inconnu.")
	}
	var vault models.Vault
	if s.DB.First(&vault, c.Params("id")).Error != nil {
		return fiber.ErrNotFound
	}
	if in.Status == "closed" && vault.Balance != 0 {
		return fiber.NewError(422, fmt.Sprintf("Le coffre contient encore %d F : remboursez le solde avant de le clôturer.", vault.Balance))
	}
	if err := s.DB.Model(&vault).Update("status", in.Status).Error; err != nil {
		return err
	}
	s.log(c, "vault-status", "vaults", vault.ID, "Coffre : "+in.Status)
	return c.JSON(fiber.Map{"status": in.Status})
}

// vaultGoal fixe l'objectif d'epargne, celui que la boutique affiche au client
// sous forme de jauge.
func (s *Server) vaultGoal(c *fiber.Ctx) error {
	var in struct {
		Goal    int64  `json:"goal"`
		GoalRef string `json:"goalRef"`
	}
	if c.BodyParser(&in) != nil || in.Goal < 0 {
		return fiber.NewError(422, "Objectif invalide.")
	}
	var vault models.Vault
	if s.DB.First(&vault, c.Params("id")).Error != nil {
		return fiber.ErrNotFound
	}
	if err := s.DB.Model(&vault).Updates(map[string]any{"goal": in.Goal, "goal_ref": strings.TrimSpace(in.GoalRef)}).Error; err != nil {
		return err
	}
	return c.JSON(fiber.Map{"goal": in.Goal, "goalRef": in.GoalRef})
}

// registerVaults accroche le module. Le versement reste ouvert au vendeur :
// c'est un geste de comptoir. La cloture et l'objectif relevent du gerant.
func (s *Server) registerVaults(a fiber.Router) {
	a.Get("/vaults-overview", auth.Manager, s.vaults)
	a.Get("/vaults-candidates", auth.Manager, s.vaultCandidates)
	a.Get("/vaults/:id/detail", auth.Manager, s.vaultDetail)
	a.Post("/vaults/open", auth.Manager, s.openVault)
	a.Post("/vaults/:id/withdraw", s.withdrawVault)
	a.Post("/vaults/:id/status", auth.Manager, s.vaultStatus)
	a.Post("/vaults/:id/goal", auth.Manager, s.vaultGoal)
}

func (s *Server) withdrawVault(c *fiber.Ctx) error { return s.vaultMove(c, -1) }
