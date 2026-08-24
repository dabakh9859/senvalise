package database

import (
	"fmt"
	"os"
	"strings"

	"gorm.io/gorm"
	"senvalise/internal/models"
)

// Alignement du catalogue de gestion sur celui de la vitrine.
//
// La regle est celle demandee : le site fait foi sur le contenu. Deux produits
// portaient ici un autre calibre que sur la vitrine (Ndar 55 contre Ndar 65,
// Baobab 85 contre Baobab 45). Ils sont renommes plutot que recrees, sinon les
// ventes deja enregistrees perdraient leur lien produit.
var legacySlugs = map[string]string{
	"ndar-65":   "ndar-55",
	"baobab-45": "baobab-85",
}

// Seules les images posees par ce peuplement ou par la demonstration Unsplash
// sont remplacees : une photo televersee par le gerant n'est jamais touchee.
func generatedImage(url string) bool {
	if len(url) >= 6 && url[:6] == "/shop/" {
		return true
	}
	return len(url) >= 28 && url[:28] == "https://images.unsplash.com/"
}

// SEED_CATALOG commande la pose du catalogue de demonstration.
//
// seedShop s'executait a chaque demarrage et reecrivait les huit produits, les
// categories, les teintes et les zones de livraison. C'est ce qu'il faut sur
// une installation neuve, qui doit avoir de la matiere immediatement. Mais
// une boutique qui a fait le menage de ce catalogue pour saisir le sien le
// voyait revenir au redemarrage suivant : la suppression ne tenait pas une
// journee, et rien ne disait pourquoi.
//
// La valeur par defaut reste « oui » : une nouvelle installation se comporte
// comme avant. C'est a la boutique qui a pris la main sur son catalogue de
// poser SEED_CATALOG=false.
func seedShop(db *gorm.DB) error {
	if strings.EqualFold(os.Getenv("SEED_CATALOG"), "false") {
		return nil
	}
	for _, c := range shopColorways {
		var row models.Colorway
		if db.Where("slug = ?", c.Slug).First(&row).Error == gorm.ErrRecordNotFound {
			row = models.Colorway{Slug: c.Slug}
		}
		row.Name, row.Hex, row.Position = c.Name, c.Hex, c.Position
		if e := db.Save(&row).Error; e != nil {
			return fmt.Errorf("teinte %s: %w", c.Slug, e)
		}
	}

	categoryID := map[string]uint{}
	for _, c := range shopCategories {
		var row models.Category
		if db.Where("slug = ?", c.Slug).First(&row).Error == gorm.ErrRecordNotFound {
			row = models.Category{Slug: c.Slug}
		}
		row.Name = c.Name
		if e := db.Save(&row).Error; e != nil {
			return fmt.Errorf("categorie %s: %w", c.Slug, e)
		}
		categoryID[c.Slug] = row.ID
	}

	fee, freeFrom := shippingSettings(db)
	for _, z := range shopZones {
		var row models.DeliveryZone
		if db.Where("slug = ?", z.Slug).First(&row).Error == gorm.ErrRecordNotFound {
			row = models.DeliveryZone{Slug: z.Slug, Fee: fee, Active: true}
		}
		row.Name, row.Area, row.Lat, row.Lon, row.Delay = z.Name, z.Area, z.Lat, z.Lon, z.Delay
		if e := db.Save(&row).Error; e != nil {
			return fmt.Errorf("zone %s: %w", z.Slug, e)
		}
	}
	_ = freeFrom

	for _, p := range shopProducts {
		var product models.Product
		err := db.Where("slug = ?", p.Slug).First(&product).Error
		if err == gorm.ErrRecordNotFound {
			if legacy, ok := legacySlugs[p.Slug]; ok {
				err = db.Where("slug = ?", legacy).First(&product).Error
			}
		}
		fresh := err == gorm.ErrRecordNotFound
		if fresh {
			product = models.Product{Slug: p.Slug, Active: true}
		} else if err != nil {
			return fmt.Errorf("produit %s: %w", p.Slug, err)
		}
		id := categoryID[p.Category]
		product.Slug, product.Name, product.Description = p.Slug, p.Name, p.Story
		product.Cabin, product.Volume, product.Weight = p.Cabin, p.Volume, p.Weight
		if fresh {
			// La mise en vitrine — en ligne, mis en avant, ordre, accroches —
			// appartient à la gestion une fois le produit créé. La réécrire à
			// chaque démarrage annulerait tout ce qui est décidé dans l'écran
			// « Catalogue en ligne ».
			product.Blurb, product.Tag, product.Flag = p.Blurb, p.Tag, p.Flag
			product.Position = p.Position
			product.Online, product.Featured = true, p.Flag != ""
		}
		if id != 0 {
			product.CategoryID = &id
		}
		if e := db.Save(&product).Error; e != nil {
			return fmt.Errorf("produit %s: %w", p.Slug, e)
		}

		db.Where("product_id = ?", product.ID).Delete(&models.ProductSpec{})
		for i, s := range p.Specs {
			if e := db.Create(&models.ProductSpec{ProductID: product.ID, Label: s.Label, Value: s.Value, Position: i}).Error; e != nil {
				return e
			}
		}

		db.Where("product_id = ?", product.ID).Delete(&models.ProductColorway{})
		for i, c := range p.Colors {
			if e := db.Create(&models.ProductColorway{ProductID: product.ID, Slug: c, Position: i}).Error; e != nil {
				return e
			}
		}

		var images []models.ProductImage
		db.Where("product_id = ?", product.ID).Find(&images)
		for _, img := range images {
			if generatedImage(img.URL) {
				db.Delete(&models.ProductImage{}, img.ID)
			}
		}
		var remaining int64
		db.Model(&models.ProductImage{}).Where("product_id = ?", product.ID).Count(&remaining)
		for i, url := range p.Gallery {
			if e := db.Create(&models.ProductImage{
				ProductID: product.ID, URL: url, Alt: p.Name,
				Position: i, Primary: i == 0 && remaining == 0,
			}).Error; e != nil {
				return e
			}
		}

		// Un produit sans variante n'a ni prix ni stock : on lui en cree une,
		// au prix de la vitrine. Les variantes existantes ne sont pas touchees,
		// leur stock et leurs ventes leur appartiennent.
		var variants int64
		db.Model(&models.ProductVariant{}).Where("product_id = ?", product.ID).Count(&variants)
		if variants == 0 {
			sku := fmt.Sprintf("SV-%s", product.Slug)
			if e := db.Create(&models.ProductVariant{
				ProductID: product.ID, SKU: sku, Barcode: sku,
				Color: firstOr(p.Colors, ""), Price: p.Price, Active: true,
			}).Error; e != nil {
				return fmt.Errorf("variante %s: %w", p.Slug, e)
			}
		}
	}
	return nil
}

func firstOr(values []string, fallback string) string {
	if len(values) > 0 {
		return values[0]
	}
	return fallback
}

// Frais de livraison : la vitrine appliquait 4 000 F, offerts au-dela de
// 100 000 F. Les valeurs deviennent des reglages modifiables en gestion.
func shippingSettings(db *gorm.DB) (fee int64, freeFrom int64) {
	fee, freeFrom = 4000, 100000
	for key, target := range map[string]*int64{"shipping_fee": &fee, "shipping_free_from": &freeFrom} {
		var row models.Setting
		if db.Where("key = ?", key).First(&row).Error == gorm.ErrRecordNotFound {
			db.Create(&models.Setting{Key: key, Value: fmt.Sprintf("%d", *target)})
			continue
		}
		var parsed int64
		if _, err := fmt.Sscanf(row.Value, "%d", &parsed); err == nil && parsed >= 0 {
			*target = parsed
		}
	}
	return fee, freeFrom
}
