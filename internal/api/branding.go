package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"senvalise/internal/auth"
	"senvalise/internal/models"
)

// Identite visuelle.
//
// Le logo etait dessine en dur a trois endroits : un « SV » dans la barre de
// gestion, un SVG de valise dans l'en-tete de la boutique, et rien du tout
// dans l'onglet du navigateur ni dans les apercus de partage. Changer de logo
// demandait donc de modifier du code a trois endroits, et le referencement
// n'en voyait aucun.
//
// Ici, un seul reglage sert de source : la gestion, la boutique, l'onglet du
// navigateur, les documents PDF et les balises de partage lisent tous le meme
// enregistrement. Les pages HTML pointent vers une adresse stable
// (/api/public/branding/logo) plutot que vers le fichier televerse : changer
// de logo ne demande alors de retoucher aucune page.

const brandingSettingKey = "branding_config"

type brandingConfig struct {
	SiteName    string `json:"siteName"`
	Tagline     string `json:"tagline"`
	LogoURL     string `json:"logoUrl"`
	FaviconURL  string `json:"faviconUrl"`
	ThemeColor  string `json:"themeColor"`
	Description string `json:"description"`
}

func defaultBranding() brandingConfig {
	return brandingConfig{
		SiteName:   "Sen Valise",
		Tagline:    "Solutions de voyage",
		ThemeColor: "#1529d6",
		Description: "Valises et bagages conçus pour vos allers-retours. " +
			"Garantie 5 ans, réparation à Dakar, livraison 48 h.",
	}
}

func (s *Server) readBranding() brandingConfig {
	config := defaultBranding()
	var row models.Setting
	if s.DB.Where("key = ?", brandingSettingKey).First(&row).Error == nil {
		_ = json.Unmarshal([]byte(row.Value), &config)
	}
	if strings.TrimSpace(config.SiteName) == "" {
		config.SiteName = defaultBranding().SiteName
	}
	// Le favicon retombe sur le logo : demander deux fichiers pour afficher la
	// meme image serait une corvee sans contrepartie.
	if strings.TrimSpace(config.FaviconURL) == "" {
		config.FaviconURL = config.LogoURL
	}
	return config
}

func (s *Server) brandingHandler(c *fiber.Ctx) error { return c.JSON(s.readBranding()) }

// publicBranding sert la vitrine et l'ecran de connexion, qui doivent afficher
// le logo avant toute authentification.
func (s *Server) publicBranding(c *fiber.Ctx) error {
	config := s.readBranding()
	c.Set("Cache-Control", "public, max-age=120")
	return c.JSON(fiber.Map{
		"siteName": config.SiteName, "tagline": config.Tagline,
		"logoUrl": brandingAssetPath(config.LogoURL, "logo"), "themeColor": config.ThemeColor,
		"description": config.Description,
	})
}

// brandingAssetPath rend l'adresse stable plutot que le chemin du fichier :
// les pages HTML n'ont ainsi jamais a etre reecrites quand le logo change.
func brandingAssetPath(stored, kind string) string {
	if strings.TrimSpace(stored) == "" {
		return ""
	}
	return "/api/public/branding/" + kind
}

func (s *Server) updateBranding(c *fiber.Ctx) error {
	incoming := s.readBranding()
	if c.BodyParser(&incoming) != nil {
		return fiber.NewError(422, "Identité visuelle invalide")
	}
	incoming.SiteName = strings.TrimSpace(incoming.SiteName)
	incoming.Tagline = strings.TrimSpace(incoming.Tagline)
	incoming.Description = strings.TrimSpace(incoming.Description)
	incoming.ThemeColor = strings.TrimSpace(incoming.ThemeColor)
	if incoming.SiteName == "" {
		return fiber.NewError(422, "Le nom de la marque est obligatoire.")
	}
	if incoming.ThemeColor != "" && !isHexColor(incoming.ThemeColor) {
		return fiber.NewError(422, "La couleur doit être au format #1529d6.")
	}
	raw, err := json.Marshal(incoming)
	if err != nil {
		return err
	}
	var row models.Setting
	if s.DB.Where("key = ?", brandingSettingKey).First(&row).Error == nil {
		err = s.DB.Model(&row).Update("value", string(raw)).Error
	} else {
		err = s.DB.Create(&models.Setting{Key: brandingSettingKey, Value: string(raw)}).Error
	}
	if err != nil {
		return err
	}
	s.log(c, "update", "branding", 0, "Identité visuelle")
	return c.JSON(s.readBranding())
}

func isHexColor(value string) bool {
	if len(value) != 7 || value[0] != '#' {
		return false
	}
	for _, r := range value[1:] {
		if !strings.ContainsRune("0123456789abcdefABCDEF", r) {
			return false
		}
	}
	return true
}

// brandingImageExtension complete le controle des images par le SVG. Un logo
// vectoriel reste net dans l'onglet du navigateur comme sur une facture
// imprimee, ce qu'aucun PNG de taille fixe ne garantit.
func brandingImageExtension(f *multipart.FileHeader) (string, error) {
	if ext, err := imageExtension(f); err == nil {
		return ext, nil
	}
	handle, err := f.Open()
	if err != nil {
		return "", fiber.NewError(400, "Fichier illisible")
	}
	defer handle.Close()
	head := make([]byte, 256)
	n, _ := io.ReadFull(handle, head)
	trimmed := bytes.TrimSpace(bytes.ToLower(head[:n]))
	if bytes.HasPrefix(trimmed, []byte("<svg")) || bytes.HasPrefix(trimmed, []byte("<?xml")) {
		return ".svg", nil
	}
	return "", fiber.NewError(415, "Ce fichier n’est pas une image PNG, JPG, WebP ou SVG.")
}

// uploadBrandingImage enregistre le logo ou le favicon et met a jour le
// reglage dans la foulee : televerser sans enregistrer laisserait l'ecran
// afficher une image que personne d'autre ne verrait.
func (s *Server) uploadBrandingImage(c *fiber.Ctx) error {
	kind := c.Params("kind")
	if kind != "logo" && kind != "favicon" {
		return fiber.ErrNotFound
	}
	f, err := c.FormFile("image")
	if err != nil {
		return fiber.NewError(400, "Image requise")
	}
	if f.Size > 4<<20 {
		return fiber.NewError(413, "Image limitée à 4 Mo")
	}
	ext, err := brandingImageExtension(f)
	if err != nil {
		return err
	}
	if err = os.MkdirAll("uploads", 0o755); err != nil {
		return err
	}
	now := time.Now()
	name := fmt.Sprintf("%s-%s-%09d%s", kind, now.Format("20060102-150405"), now.Nanosecond(), ext)
	if err = c.SaveFile(f, filepath.Join("uploads", name)); err != nil {
		return err
	}
	config := s.readBranding()
	if kind == "logo" {
		config.LogoURL = "/uploads/" + name
		// Un favicon qui suivait le logo continue de le suivre ; un favicon
		// choisi expressement n'est pas ecrase.
		if config.FaviconURL == "" || config.FaviconURL == config.LogoURL {
			config.FaviconURL = ""
		}
	} else {
		config.FaviconURL = "/uploads/" + name
	}
	raw, err := json.Marshal(config)
	if err != nil {
		return err
	}
	var row models.Setting
	if s.DB.Where("key = ?", brandingSettingKey).First(&row).Error == nil {
		err = s.DB.Model(&row).Update("value", string(raw)).Error
	} else {
		err = s.DB.Create(&models.Setting{Key: brandingSettingKey, Value: string(raw)}).Error
	}
	if err != nil {
		return err
	}
	s.log(c, "upload", "branding", 0, "Nouveau "+kind)
	return c.Status(201).JSON(s.readBranding())
}

var brandingMimes = map[string]string{
	".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
}

// defaultFavicon evite l'onglet vide tant qu'aucun logo n'est televerse. Il
// reprend la marque de la boutique, en une seule couleur pour rester lisible
// a seize pixels.
const defaultFavicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
	`<rect width="32" height="32" rx="7" fill="#1529d6"/>` +
	`<rect x="7" y="11" width="18" height="14" rx="4" fill="#fff"/>` +
	`<path d="M13 11V9.6A2 2 0 0 1 15 7.6h2a2 2 0 0 1 2 2V11h-2V9.4h-2V11Z" fill="#fff"/>` +
	`</svg>`

// brandingAsset sert l'image. L'adresse est stable, le fichier derriere ne
// l'est pas : le cache est donc court, sans quoi un changement de logo mettrait
// une journee a se voir dans les onglets deja ouverts.
func (s *Server) brandingAsset(c *fiber.Ctx) error {
	kind := c.Params("kind")
	config := s.readBranding()
	stored := config.LogoURL
	if kind == "favicon" {
		stored = config.FaviconURL
	} else if kind != "logo" {
		return fiber.ErrNotFound
	}
	c.Set("Cache-Control", "public, max-age=300")
	if strings.TrimSpace(stored) == "" {
		c.Set("Content-Type", "image/svg+xml")
		return c.SendString(defaultFavicon)
	}
	// Seul le nom de fichier est retenu : le reglage est ecrit par le gerant,
	// mais un chemin relatif glisse dans la valeur ne doit pas pouvoir sortir
	// du dossier des televersements.
	name := filepath.Base(stored)
	raw, err := os.ReadFile(filepath.Join("uploads", name))
	if err != nil {
		c.Set("Content-Type", "image/svg+xml")
		return c.SendString(defaultFavicon)
	}
	mime := brandingMimes[strings.ToLower(filepath.Ext(name))]
	if mime == "" {
		mime = "application/octet-stream"
	}
	c.Set("Content-Type", mime)
	return c.Send(raw)
}

// brandingLogoFile rend le logo tel qu'il est sur le disque, pour le rendu des
// PDF. Le PDF est compose dans le processus : il lit le fichier, pas l'URL.
func (s *Server) brandingLogoFile() (string, []byte) {
	config := s.readBranding()
	if strings.TrimSpace(config.LogoURL) == "" {
		return "", nil
	}
	name := filepath.Base(config.LogoURL)
	ext := strings.ToLower(filepath.Ext(name))
	// fpdf ne dessine pas de SVG : un logo vectoriel s'affiche partout
	// ailleurs, mais l'en-tete du PDF garde son bandeau de couleur.
	if ext != ".png" && ext != ".jpg" && ext != ".jpeg" {
		return "", nil
	}
	raw, err := os.ReadFile(filepath.Join("uploads", name))
	if err != nil {
		return "", nil
	}
	format := "PNG"
	if ext != ".png" {
		format = "JPG"
	}
	return format, raw
}

func (s *Server) registerBranding(a fiber.Router) {
	a.Get("/branding", auth.Manager, s.brandingHandler)
	a.Put("/branding", auth.Manager, s.updateBranding)
	a.Post("/branding/:kind", auth.Manager, s.uploadBrandingImage)
}
