package api

import (
	"fmt"
	"html"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// Referencement de la vitrine.
//
// Tout le catalogue vivait sur une seule adresse, « produit.html?ref=… »,
// remplie par le navigateur. Google n'avait donc qu'une page a indexer pour
// huit valises, avec un titre unique — « Produit | Sen Valise » — et aucune
// mention de prix. Une boutique invisible dans les resultats de recherche.
//
// Chaque produit a desormais son adresse, /p/<reference>, servie par l'API :
//
//   - le <head> est reecrit avec le nom, l'accroche, la photo et le lien
//     canonique du produit ;
//   - un bloc de contenu est pose dans la page — nom, prix, description,
//     caracteristiques — pour que le robot lise la fiche sans executer de
//     JavaScript. Le script de la page le remplace par la version interactive
//     des qu'il s'execute, donc le visiteur voit exactement ce qu'il voyait
//     avant, et le robot voit enfin quelque chose ;
//   - un bloc JSON-LD « Product » porte le prix et la disponibilite, ce qui
//     autorise l'affichage enrichi dans les resultats.
//
// La page reste un fichier statique modifiable sans toucher au Go : le serveur
// se contente d'y injecter. Une divergence entre les deux rendus est ainsi
// impossible sur la structure, seulement sur le contenu — qui vient de la meme
// base dans les deux cas.

// siteDir localise la vitrine sur le disque. Le service tourne depuis
// /srv/senvalise, ou le dossier est monte a cote du binaire ; en developpement
// il est a la racine du depot.
func siteDir() string {
	if dir := os.Getenv("SITE_DIR"); dir != "" {
		return dir
	}
	return "site"
}

const productPlaceholder = `<div class="wrap pdp" data-pdp></div>`

// canonicalBase donne l'adresse publique du site, celle qui doit figurer dans
// les liens canoniques. Une adresse absente rendrait les canoniques relatifs,
// que Google accepte mal.
func (s *Server) canonicalBase() string {
	base := strings.TrimRight(s.readMessagingConfig().PublicURL, "/")
	if base == "" {
		base = "https://senvalise.online"
	}
	return base
}

func escape(value string) string { return html.EscapeString(value) }

// productPage sert la fiche d'un produit a son adresse propre.
func (s *Server) productPage(c *fiber.Ctx) error {
	slug := strings.TrimSpace(c.Params("slug"))
	if slug == "" {
		return c.Redirect("/boutique.html", fiber.StatusMovedPermanently)
	}
	catalog, _, err := s.shopCatalogProducts()
	if err != nil {
		return err
	}
	var product *shopProductOut
	for i := range catalog {
		if catalog[i].Ref == slug {
			product = &catalog[i]
			break
		}
	}
	if product == nil {
		// Une reference retiree du catalogue doit rendre un 404 franc : un 200
		// sur une page vide ferait indexer des fiches fantomes.
		return c.Status(fiber.StatusNotFound).SendString("Modèle introuvable")
	}
	raw, readErr := os.ReadFile(filepath.Join(siteDir(), "produit.html"))
	if readErr != nil {
		return fiber.NewError(500, "page produit indisponible")
	}
	page := string(raw)
	base := s.canonicalBase()
	branding := s.readBranding()

	title := fmt.Sprintf("%s — %s | %s", product.Name, product.Tag, branding.SiteName)
	description := product.Blurb
	if strings.TrimSpace(description) == "" {
		description = product.Desc
	}
	if len(description) > 300 {
		description = description[:297] + "…"
	}
	image := base + "/api/public/branding/logo"
	if len(product.Gallery) > 0 {
		image = base + product.Gallery[0]
	}
	canonical := fmt.Sprintf("%s/p/%s", base, slug)

	// Le gabarit porte des balises generiques : on remplace le bloc entier
	// plutot que de dupliquer les balises, deux <title> valant mieux qu'un
	// seul mais faux.
	page = replaceTag(page, "<title>", "</title>", escape(title))
	page = replaceMeta(page, `<meta name="description" content="`, escape(description))
	page = replaceMeta(page, `<link rel="canonical" href="`, canonical)
	page = replaceMeta(page, `<meta property="og:url" content="`, canonical)
	page = replaceMeta(page, `<meta property="og:title" content="`, escape(title))
	page = replaceMeta(page, `<meta property="og:description" content="`, escape(description))
	page = replaceMeta(page, `<meta property="og:image" content="`, image)
	page = replaceMeta(page, `<meta property="og:type" content="`, "product")
	page = replaceMeta(page, `<meta name="twitter:title" content="`, escape(title))
	page = replaceMeta(page, `<meta name="twitter:description" content="`, escape(description))
	page = replaceMeta(page, `<meta name="twitter:image" content="`, image)

	page = strings.Replace(page, "</head>", productJSONLD(base, canonical, image, product)+"</head>", 1)
	page = strings.Replace(page, productPlaceholder, productFallback(product), 1)

	c.Set("Content-Type", "text/html; charset=utf-8")
	// Cache court : un changement de prix doit se voir dans la journee, pas la
	// semaine suivante.
	c.Set("Cache-Control", "public, max-age=300")
	return c.SendString(page)
}

// replaceTag remplace le contenu d'une balise ouvrante/fermante unique.
func replaceTag(page, open, close, value string) string {
	start := strings.Index(page, open)
	if start < 0 {
		return page
	}
	end := strings.Index(page[start:], close)
	if end < 0 {
		return page
	}
	return page[:start+len(open)] + value + page[start+end:]
}

// replaceMeta remplace la valeur d'un attribut content= ou href= repere par
// son prefixe. Le gabarit etant ecrit par nous, le prefixe est stable.
func replaceMeta(page, prefix, value string) string {
	start := strings.Index(page, prefix)
	if start < 0 {
		return page
	}
	rest := page[start+len(prefix):]
	end := strings.Index(rest, `"`)
	if end < 0 {
		return page
	}
	return page[:start+len(prefix)] + value + rest[end:]
}

// productJSONLD decrit le produit pour les resultats enrichis. Le prix est en
// francs CFA, sans decimale : schema.org attend une chaine, pas un nombre
// formate a la francaise.
func productJSONLD(base, canonical, image string, product *shopProductOut) string {
	availability := "https://schema.org/InStock"
	if product.Stock <= 0 {
		availability = "https://schema.org/OutOfStock"
	}
	description := product.Desc
	if strings.TrimSpace(description) == "" {
		description = product.Blurb
	}
	images := make([]string, 0, len(product.Gallery))
	for _, item := range product.Gallery {
		images = append(images, jsonString(base+item))
	}
	if len(images) == 0 {
		images = append(images, jsonString(image))
	}
	return fmt.Sprintf(`<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":%s,"sku":%s,"category":%s,
 "description":%s,"image":[%s],"brand":{"@type":"Brand","name":"Sen Valise"},
 "offers":{"@type":"Offer","url":%s,"priceCurrency":"XOF","price":"%d",
   "availability":%s,"itemCondition":"https://schema.org/NewCondition",
   "seller":{"@type":"Organization","name":"Sen Valise"}}}
</script>
`, jsonString(product.Name), jsonString(product.Ref), jsonString(product.Category),
		jsonString(description), strings.Join(images, ","), jsonString(canonical),
		product.Price, jsonString(availability))
}

// jsonString echappe une valeur pour un litteral JSON. On ne passe pas par
// encoding/json pour garder le bloc lisible dans la source de la page.
func jsonString(value string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", " ", "\r", " ", "\t", " ",
		"<", `\u003c`, ">", `\u003e`, "&", `\u0026`)
	return `"` + replacer.Replace(value) + `"`
}

// productFallback est la fiche vue par un robot — ou par un visiteur dont le
// JavaScript n'a pas encore repondu. Le script de la page ecrase ce bloc des
// qu'il s'execute : ce n'est donc pas du contenu cache, c'est le meme contenu,
// rendu deux fois par deux chemins.
func productFallback(product *shopProductOut) string {
	var out strings.Builder
	out.WriteString(`<div class="wrap pdp" data-pdp>`)
	if len(product.Gallery) > 0 {
		out.WriteString(`<div class="pdp__gallery"><div class="pdp__main"><img src="` + escape(product.Gallery[0]) +
			`" alt="` + escape(product.Name) + `" width="1200" height="900" fetchpriority="high"></div></div>`)
	}
	out.WriteString(`<div class="pdp__info">`)
	out.WriteString(`<p class="body-sm">` + escape(product.Tag) + `</p>`)
	out.WriteString(`<h1 class="h2">` + escape(product.Name) + `</h1>`)
	out.WriteString(`<div class="pdp__price num">` + escape(formatCFA(product.Price)) + `</div>`)
	if product.Blurb != "" {
		out.WriteString(`<p class="lede">` + escape(product.Blurb) + `</p>`)
	}
	if product.Desc != "" {
		out.WriteString(`<p>` + escape(product.Desc) + `</p>`)
	}
	if len(product.Specs) > 0 {
		out.WriteString(`<dl class="pdp__specs">`)
		for _, spec := range product.Specs {
			out.WriteString(`<dt>` + escape(spec.K) + `</dt><dd>` + escape(spec.V) + `</dd>`)
		}
		out.WriteString(`</dl>`)
	}
	out.WriteString(`<p><a class="btn btn--primary" href="/panier.html">Ajouter au panier</a></p>`)
	out.WriteString(`</div></div>`)
	return out.String()
}

func formatCFA(amount int64) string {
	raw := fmt.Sprintf("%d", amount)
	var parts []string
	for len(raw) > 3 {
		parts = append([]string{raw[len(raw)-3:]}, parts...)
		raw = raw[:len(raw)-3]
	}
	parts = append([]string{raw}, parts...)
	return strings.Join(parts, " ") + " F"
}

// sitemap liste ce que Google doit connaitre. Il est calcule et non ecrit a la
// main : une valise ajoutee au catalogue y figure sans que personne y pense.
func (s *Server) sitemap(c *fiber.Ctx) error {
	base := s.canonicalBase()
	today := time.Now().Format("2006-01-02")
	var out strings.Builder
	out.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	out.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	entry := func(loc, priority, frequency string) {
		out.WriteString(fmt.Sprintf("  <url><loc>%s</loc><lastmod>%s</lastmod><changefreq>%s</changefreq><priority>%s</priority></url>\n",
			loc, today, frequency, priority))
	}
	entry(base+"/", "1.0", "weekly")
	entry(base+"/boutique.html", "0.9", "weekly")
	entry(base+"/coffre.html", "0.7", "monthly")
	products, _, err := s.shopCatalogProducts()
	if err == nil {
		for _, product := range products {
			entry(fmt.Sprintf("%s/p/%s", base, product.Ref), "0.8", "weekly")
		}
	}
	// Panier, compte et parametres sont exclus : ce sont des pages de session,
	// sans interet pour un moteur et sources de contenu duplique.
	out.WriteString(`</urlset>` + "\n")
	c.Set("Content-Type", "application/xml; charset=utf-8")
	c.Set("Cache-Control", "public, max-age=3600")
	return c.SendString(out.String())
}

// robots autorise l'exploration de la vitrine et ferme ce qui ne doit jamais
// s'indexer : l'API, l'espace client et l'espace de gestion.
func (s *Server) robots(c *fiber.Ctx) error {
	base := s.canonicalBase()
	body := strings.Join([]string{
		"User-agent: *",
		"Allow: /",
		"Disallow: /api/",
		"Disallow: /panier.html",
		"Disallow: /compte.html",
		"Disallow: /parametres.html",
		"Disallow: /mon-coffre.html",
		"",
		"Sitemap: " + base + "/sitemap.xml",
		"",
	}, "\n")
	c.Set("Content-Type", "text/plain; charset=utf-8")
	c.Set("Cache-Control", "public, max-age=3600")
	return c.SendString(body)
}

func (s *Server) registerSEO(app *fiber.App) {
	// Ces pages lisent le catalogue a chaque appel : sans plafond, un robot mal
	// eleve les demanderait en boucle et occuperait la base.
	app.Get("/p/:slug", publicLimiter(), s.productPage)
	app.Get("/sitemap.xml", publicLimiter(), s.sitemap)
	app.Get("/robots.txt", s.robots)
}
