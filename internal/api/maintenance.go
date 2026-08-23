package api

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"

	"senvalise/internal/models"
)

// Mise en maintenance de la boutique en ligne.
//
// Fermer la vitrine — le temps d'un inventaire, d'une rupture generale ou d'une
// refonte du catalogue — demandait d'aller couper nginx a la main. Personne ne
// fait cela depuis un telephone un dimanche matin.
//
// L'etat vit a deux endroits, et c'est voulu :
//
//   - un reglage en base, source de verite, que l'API lit pour refuser les
//     commandes ;
//   - un fichier temoin sur le disque, que nginx teste pour renvoyer la page de
//     maintenance sans reveiller l'application.
//
// Les pages de la vitrine sont des fichiers statiques servis par nginx : une
// verification faite dans l'API ne les couvrirait pas. Le fichier est donc la
// seule facon d'arreter la boutique entiere. Le reglage, lui, survit a un
// disque efface : au demarrage, le fichier est remis en accord avec lui.

const maintenanceSettingKey = "shop_maintenance"

type maintenanceConfig struct {
	Enabled bool   `json:"enabled"`
	Message string `json:"message"`
}

func defaultMaintenance() maintenanceConfig {
	return maintenanceConfig{
		Message: "La boutique est momentanément fermée pour mise à jour. " +
			"Nous rouvrons très vite — écrivez-nous sur WhatsApp en attendant.",
	}
}

// maintenanceFlag est le fichier teste par nginx. Il vit hors du dossier des
// televersements : ce dernier est servi publiquement, et un temoin d'etat n'a
// rien a y faire.
func maintenanceFlag() string {
	if path := os.Getenv("MAINTENANCE_FLAG"); path != "" {
		return path
	}
	return "state/maintenance.on"
}

func (s *Server) readMaintenance() maintenanceConfig {
	config := defaultMaintenance()
	var row models.Setting
	if s.DB.Where("key = ?", maintenanceSettingKey).First(&row).Error == nil {
		_ = json.Unmarshal([]byte(row.Value), &config)
	}
	if strings.TrimSpace(config.Message) == "" {
		config.Message = defaultMaintenance().Message
	}
	return config
}

// syncMaintenanceFlag met le fichier en accord avec le reglage. Il est appele
// a chaque changement et au demarrage : un serveur reinstalle, ou un disque
// remis a neuf, retrouve ainsi l'etat que la base a toujours connu.
func (s *Server) syncMaintenanceFlag(enabled bool) error {
	path := maintenanceFlag()
	if !enabled {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte("boutique fermée\n"), 0o644)
}

// RestoreMaintenance rejoue l'etat enregistre au demarrage du serveur.
func (s *Server) RestoreMaintenance() {
	_ = s.syncMaintenanceFlag(s.readMaintenance().Enabled)
}

func (s *Server) maintenanceStatus(c *fiber.Ctx) error {
	config := s.readMaintenance()
	// Le fichier est rendu tel qu'il est : si nginx et la base divergent — un
	// disque efface, une main sur le serveur — l'ecran doit le montrer plutot
	// que d'affirmer un etat qui n'est pas celui du visiteur.
	_, err := os.Stat(maintenanceFlag())
	return c.JSON(fiber.Map{
		"enabled": config.Enabled, "message": config.Message,
		"flagPresent": err == nil,
	})
}

func (s *Server) updateMaintenance(c *fiber.Ctx) error {
	incoming := s.readMaintenance()
	if c.BodyParser(&incoming) != nil {
		return fiber.NewError(422, "Réglage de maintenance invalide")
	}
	incoming.Message = strings.TrimSpace(incoming.Message)
	if incoming.Message == "" {
		incoming.Message = defaultMaintenance().Message
	}
	raw, err := json.Marshal(incoming)
	if err != nil {
		return err
	}
	var row models.Setting
	if s.DB.Where("key = ?", maintenanceSettingKey).First(&row).Error == nil {
		err = s.DB.Model(&row).Update("value", string(raw)).Error
	} else {
		err = s.DB.Create(&models.Setting{Key: maintenanceSettingKey, Value: string(raw)}).Error
	}
	if err != nil {
		return err
	}
	if err := s.syncMaintenanceFlag(incoming.Enabled); err != nil {
		// Le reglage est enregistre mais la vitrine n'a pas bascule : le dire,
		// plutot que de laisser croire que la boutique est fermee alors qu'elle
		// prend encore des commandes.
		return fiber.NewError(500, "Réglage enregistré, mais la vitrine n’a pas pu basculer : "+err.Error())
	}
	state := "réouverture de la boutique"
	if incoming.Enabled {
		state = "boutique fermée pour maintenance"
	}
	s.log(c, "maintenance", "shop", 0, state)
	return c.JSON(fiber.Map{"enabled": incoming.Enabled, "message": incoming.Message, "flagPresent": incoming.Enabled})
}

// blockDuringMaintenance ferme les points d'entree qui engagent la boutique.
//
// La lecture du catalogue reste ouverte : la page de maintenance affiche le
// logo et le nom de la marque, et un client dont la page etait deja chargee ne
// doit pas voir l'ecran se briser. Ce qui est refuse, c'est ce qui cree quelque
// chose — une commande, un compte, un versement.
func (s *Server) blockDuringMaintenance(c *fiber.Ctx) error {
	if c.Method() == fiber.MethodGet || !s.readMaintenance().Enabled {
		return c.Next()
	}
	return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
		"error": "La boutique est momentanément fermée. Réessayez dans quelques instants.",
	})
}

// publicShopStatus alimente la page de fermeture. Elle est publique par
// necessite : le visiteur qui la lit n'a pas de compte.
func (s *Server) publicShopStatus(c *fiber.Ctx) error {
	config := s.readMaintenance()
	c.Set("Cache-Control", "no-store")
	return c.JSON(fiber.Map{
		"open": !config.Enabled, "message": config.Message,
		"siteName": s.readBranding().SiteName,
	})
}

func (s *Server) registerMaintenance(g fiber.Router) {
	g.Get("/maintenance", s.maintenanceStatus)
	g.Put("/maintenance", s.updateMaintenance)
}
