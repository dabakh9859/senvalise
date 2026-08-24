package api

import (
	"strconv"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"senvalise/internal/models"
)

// Les postes de depense de la boutique.
//
// Ils etaient une liste figee dans le code de l'ecran. Une boutique paie son
// livreur, une autre son gardien : personne ne pouvait ajouter un poste, et
// « divers » finissait par tout absorber — ce qui rendait le suivi des
// depenses inutile.
//
// Ils vivent maintenant en base, avec une image. Au comptoir, on reconnait le
// pictogramme d'un compteur electrique plus vite qu'on ne lit « electricite »,
// et saisir une depense devient un choix plutot qu'une frappe.

// defaultExpenseTypes reprend les postes qui etaient codes en dur. Ils sont
// semes une seule fois, au premier demarrage qui suit la mise a jour : sans
// eux, la boutique se retrouverait devant un ecran de saisie vide et les
// depenses deja enregistrees pointeraient vers des postes inexistants.
var defaultExpenseTypes = []struct{ slug, name string }{
	{"achats", "Achats et marchandises"},
	{"transport", "Transport et livraison"},
	{"carburant", "Carburant"},
	{"loyer", "Loyer"},
	{"salaires", "Salaires et primes"},
	{"electricite", "Électricité"},
	{"eau", "Eau"},
	{"telecom", "Téléphone et internet"},
	{"fournitures", "Fournitures"},
	{"entretien", "Entretien et réparations"},
	{"marketing", "Publicité et marketing"},
	{"taxes", "Taxes et impôts"},
	{"banque", "Frais bancaires"},
	{"restauration", "Restauration"},
	{"divers", "Divers"},
}

// SeedExpenseTypes pose les postes par defaut si la table est vide. Elle ne
// touche a rien ensuite : une boutique qui a supprime « carburant » ne doit
// pas le voir revenir a chaque redemarrage.
func (s *Server) SeedExpenseTypes() {
	var count int64
	if s.DB.Model(&models.ExpenseType{}).Count(&count); count > 0 {
		return
	}
	for index, item := range defaultExpenseTypes {
		s.DB.Create(&models.ExpenseType{Name: item.name, Slug: item.slug, Position: index, Active: true})
	}
}

// createExpenseType pose le slug lui-meme : saisi a la main, il finirait par
// contenir des accents et des espaces, et la colonne category des depenses
// deviendrait illisible.
func (s *Server) createExpenseType(c *fiber.Ctx) error {
	var in models.ExpenseType
	if c.BodyParser(&in) != nil {
		return fiber.ErrBadRequest
	}
	if in.Name == "" {
		return fiber.NewError(422, "Donnez un nom à ce type de dépense.")
	}
	in.ID = 0
	in.Slug = uniqueExpenseSlug(s.DB, slugify(in.Name))
	if in.Position == 0 {
		var last int64
		s.DB.Model(&models.ExpenseType{}).Count(&last)
		in.Position = int(last)
	}
	if e := s.DB.Create(&in).Error; e != nil {
		return dbError(e, "création du type de dépense")
	}
	s.log(c, "create", "expense-types", in.ID, in.Name)
	return c.Status(201).JSON(in)
}

// updateExpenseType ne touche pas au slug : les depenses deja enregistrees le
// portent dans leur colonne category, et le changer les detacherait toutes de
// leur poste. Renommer « Courant » en « Électricité » doit rester sans effet
// sur l'historique.
func (s *Server) updateExpenseType(c *fiber.Ctx) error {
	var row models.ExpenseType
	if s.DB.First(&row, c.Params("id")).Error != nil {
		return fiber.ErrNotFound
	}
	var in models.ExpenseType
	if c.BodyParser(&in) != nil {
		return fiber.ErrBadRequest
	}
	if in.Name == "" {
		return fiber.NewError(422, "Donnez un nom à ce type de dépense.")
	}
	row.Name, row.ImageURL, row.Position, row.Active = in.Name, in.ImageURL, in.Position, in.Active
	if e := s.DB.Save(&row).Error; e != nil {
		return dbError(e, "modification du type de dépense")
	}
	return c.JSON(row)
}

// uploadExpenseTypeImage attache un pictogramme au poste.
func (s *Server) uploadExpenseTypeImage(c *fiber.Ctx) error {
	var row models.ExpenseType
	if s.DB.First(&row, c.Params("id")).Error != nil {
		return fiber.ErrNotFound
	}
	url, err := saveInvoiceImage(c, "expense-type")
	if err != nil {
		return err
	}
	if e := s.DB.Model(&row).Update("image_url", url).Error; e != nil {
		return e
	}
	return c.Status(201).JSON(fiber.Map{"url": url})
}

// deleteExpenseType retire le poste de la liste de saisie. Les depenses qui le
// portent gardent leur slug : elles restent lisibles dans les rapports, et
// aucune ligne d'historique n'est reecrite.
func (s *Server) deleteExpenseType(c *fiber.Ctx) error {
	var row models.ExpenseType
	if s.DB.First(&row, c.Params("id")).Error != nil {
		return fiber.ErrNotFound
	}
	if e := s.DB.Delete(&models.ExpenseType{}, row.ID).Error; e != nil {
		return dbError(e, "suppression du type de dépense")
	}
	s.log(c, "delete", "expense-types", row.ID, row.Name)
	return c.SendStatus(204)
}

func (s *Server) listExpenseTypes(c *fiber.Ctx) error {
	rows := []models.ExpenseType{}
	if e := s.DB.Order("position asc, id asc").Find(&rows).Error; e != nil {
		return e
	}
	return c.JSON(rows)
}

// uniqueExpenseSlug evite deux postes du meme identifiant : les depenses ne
// sauraient plus auquel des deux elles se rattachent.
func uniqueExpenseSlug(db *gorm.DB, base string) string {
	if base == "" {
		base = "poste"
	}
	candidate, suffix := base, 2
	for {
		var count int64
		db.Model(&models.ExpenseType{}).Where("slug = ?", candidate).Count(&count)
		if count == 0 {
			return candidate
		}
		candidate = base + "-" + strconv.Itoa(suffix)
		suffix++
	}
}
