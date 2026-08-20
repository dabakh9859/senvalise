package database

// Catalogue de la boutique. Genere depuis assets/js/data.js et account.js du
// site : c'est la vitrine qui fait foi sur le contenu, la gestion s'y aligne.
// Les prix, le stock et les SKU restent la propriete de la gestion.

type shopSpec struct{ Label, Value string }

type shopProduct struct {
	Slug, Name, Category, Tag, Flag, Blurb, Story string
	Price                                         int64
	Volume                                        int
	Weight                                        float64
	Cabin                                         bool
	Position                                      int
	Colors, Gallery                               []string
	Specs                                         []shopSpec
}

type shopColorway struct {
	Slug, Name, Hex string
	Position        int
}

type shopZone struct {
	Slug, Name, Area, Delay string
	Lat, Lon                float64
}

var shopColorways = []shopColorway{
	{Slug: "basalte", Name: "Noir Basalte", Hex: "#1a1d24", Position: 0},
	{Slug: "ndar", Name: "Bleu Ndar", Hex: "#1f3fe0", Position: 1},
	{Slug: "ivoire", Name: "Ivoire", Hex: "#e7e3da", Position: 2},
	{Slug: "sahel", Name: "Vert Sahel", Hex: "#2f5d4f", Position: 3},
}

var shopCategories = []struct{ Slug, Name string }{
	{Slug: "cabine", Name: "Cabine"},
	{Slug: "soute", Name: "Soute"},
	{Slug: "sacs", Name: "Sacs"},
	{Slug: "sets", Name: "Sets"},
}

var shopZones = []shopZone{
	{Slug: "plateau", Name: "Dakar Plateau", Area: "Dakar", Lat: 14.669, Lon: -17.439, Delay: "48 h"},
	{Slug: "medina", Name: "Médina", Area: "Dakar", Lat: 14.68, Lon: -17.452, Delay: "48 h"},
	{Slug: "point-e", Name: "Point E et Fann", Area: "Dakar", Lat: 14.693, Lon: -17.462, Delay: "48 h"},
	{Slug: "mermoz", Name: "Mermoz et Sacré-Cœur", Area: "Dakar", Lat: 14.705, Lon: -17.472, Delay: "48 h"},
	{Slug: "ouakam", Name: "Ouakam", Area: "Dakar", Lat: 14.718, Lon: -17.49, Delay: "48 h"},
	{Slug: "almadies", Name: "Almadies et Ngor", Area: "Dakar", Lat: 14.744, Lon: -17.514, Delay: "48 h"},
	{Slug: "yoff", Name: "Yoff", Area: "Dakar", Lat: 14.753, Lon: -17.474, Delay: "48 h"},
	{Slug: "grand-yoff", Name: "Grand Yoff", Area: "Dakar", Lat: 14.73, Lon: -17.46, Delay: "48 h"},
	{Slug: "parcelles", Name: "Parcelles Assainies", Area: "Dakar", Lat: 14.766, Lon: -17.431, Delay: "48 h"},
	{Slug: "guediawaye", Name: "Guédiawaye", Area: "Banlieue", Lat: 14.776, Lon: -17.406, Delay: "48 h"},
	{Slug: "pikine", Name: "Pikine", Area: "Banlieue", Lat: 14.755, Lon: -17.396, Delay: "48 h"},
	{Slug: "keur-massar", Name: "Keur Massar", Area: "Banlieue", Lat: 14.78, Lon: -17.32, Delay: "72 h"},
	{Slug: "rufisque", Name: "Rufisque", Area: "Banlieue", Lat: 14.716, Lon: -17.274, Delay: "72 h"},
	{Slug: "diamniadio", Name: "Diamniadio", Area: "Banlieue", Lat: 14.728, Lon: -17.184, Delay: "72 h"},
	{Slug: "thies", Name: "Thiès", Area: "Région", Lat: 14.79, Lon: -16.926, Delay: "4 jours"},
	{Slug: "mbour", Name: "Mbour et Saly", Area: "Région", Lat: 14.42, Lon: -16.964, Delay: "4 jours"},
	{Slug: "kaolack", Name: "Kaolack", Area: "Région", Lat: 14.152, Lon: -16.073, Delay: "4 jours"},
	{Slug: "touba", Name: "Touba", Area: "Région", Lat: 14.85, Lon: -15.879, Delay: "4 jours"},
	{Slug: "saint-louis", Name: "Saint-Louis", Area: "Région", Lat: 16.018, Lon: -16.489, Delay: "4 jours"},
	{Slug: "ziguinchor", Name: "Ziguinchor", Area: "Région", Lat: 12.568, Lon: -16.273, Delay: "5 jours"},
}

var shopProducts = []shopProduct{
	{
		Slug: "teranga-55", Name: "Teranga 55", Category: "cabine",
		Tag: "Cabine", Flag: "La plus vendue",
		Blurb: "55 x 40 x 20 cm. Passe en bagage à main sur Air Sénégal, ASKY et Brussels Airlines.",
		Story: "La Teranga est notre format cabine. Coque en polycarbonate recyclé pressé en une seule pièce, quatre roues silencieuses montées sur roulements scellés, poignée en aluminium à cinq positions. Elle a été testée sur les carreaux de l'AIBD comme sur les pavés de Saint-Louis.",
		Price: 145000, Volume: 38, Weight: 2.6, Cabin: true, Position: 0,
		Colors:  []string{"ndar", "basalte", "ivoire", "sahel"},
		Gallery: []string{"/shop/assets/img/p-teranga.jpg", "/shop/assets/img/life-pack.jpg", "/shop/assets/img/life-open.jpg", "/shop/assets/img/life-walk.jpg"},
		Specs: []shopSpec{
			{Label: "Poids à vide", Value: "2,6 kg"},
			{Label: "Volume utile", Value: "38 L"},
			{Label: "Garantie coque", Value: "5 ans"},
			{Label: "Rotation 360°", Value: "4 roues"},
		},
	},
	{
		Slug: "ndar-65", Name: "Ndar 65", Category: "soute",
		Tag: "Soute moyenne", Flag: "",
		Blurb: "Le format qui couvre deux semaines sans compression. Compartiment humide isolé.",
		Story: "Le Ndar tient la semaine longue. Doublure en toile recyclée, séparateur central compressible et poche déperlante pour les affaires humides. La coque garde une profondeur constante même chargée à plein.",
		Price: 189000, Volume: 68, Weight: 3.4, Cabin: false, Position: 1,
		Colors:  []string{"basalte", "ndar", "sahel"},
		Gallery: []string{"/shop/assets/img/p-ndar.jpg", "/shop/assets/img/detail-shell.jpg", "/shop/assets/img/life-stand.jpg", "/shop/assets/img/life-set.jpg"},
		Specs: []shopSpec{
			{Label: "Poids à vide", Value: "3,4 kg"},
			{Label: "Volume utile", Value: "68 L"},
			{Label: "Garantie coque", Value: "5 ans"},
			{Label: "Serrure intégrée", Value: "TSA"},
		},
	},
	{
		Slug: "saloum-75", Name: "Saloum 75", Category: "soute",
		Tag: "Grande soute", Flag: "",
		Blurb: "Pour les retours au pays chargés. Extension de 5 cm sur la ceinture avant.",
		Story: "Le Saloum est le format long séjour. Il gagne 5 cm de profondeur grâce à une ceinture d'extension zippée, et redescend à sa taille d'origine une fois vidé. Renforts d'angle en TPU sur les quatre coins, les points qui prennent les chocs en soute.",
		Price: 225000, Volume: 96, Weight: 4.1, Cabin: false, Position: 2,
		Colors:  []string{"basalte", "ivoire", "sahel"},
		Gallery: []string{"/shop/assets/img/p-saloum.jpg", "/shop/assets/img/life-open.jpg", "/shop/assets/img/life-airport.jpg", "/shop/assets/img/life-pack.jpg"},
		Specs: []shopSpec{
			{Label: "Poids à vide", Value: "4,1 kg"},
			{Label: "Volume extensible", Value: "96 L"},
			{Label: "Garantie coque", Value: "5 ans"},
			{Label: "Renforts d'angle", Value: "TPU"},
		},
	},
	{
		Slug: "goree-weekend", Name: "Gorée Weekend", Category: "sacs",
		Tag: "Sac cabine", Flag: "Nouveau",
		Blurb: "Toile enduite déperlante, passant dorsal qui se glisse sur la poignée télescopique.",
		Story: "Le Gorée se glisse sur la poignée d'une Teranga ou d'un Ndar et ne bouge plus. Poche ordinateur rembourrée jusqu'à 16 pouces, ouverture large qui se pose à plat, sangle amovible cousue sur des ancrages métalliques.",
		Price: 78000, Volume: 26, Weight: 0.9, Cabin: true, Position: 3,
		Colors:  []string{"basalte", "sahel"},
		Gallery: []string{"/shop/assets/img/p-goree.jpg", "/shop/assets/img/life-walk.jpg", "/shop/assets/img/life-stand.jpg", "/shop/assets/img/p-baobab.jpg"},
		Specs: []shopSpec{
			{Label: "Poids à vide", Value: "0,9 kg"},
			{Label: "Volume utile", Value: "26 L"},
			{Label: "Poche ordinateur", Value: "16\""},
			{Label: "Garantie coutures", Value: "3 ans"},
		},
	},
	{
		Slug: "duo-teranga", Name: "Duo Teranga", Category: "sets",
		Tag: "Set de deux", Flag: "Set",
		Blurb: "La Teranga 55 et le Ndar 65 dans la même finition. La petite se range dans la grande.",
		Story: "Le duo couvre le week-end et le long séjour dans une seule finition. Les deux valises sont emboîtables pour le stockage, ce qui libère la moitié d'un placard. Livré avec deux housses de rangement en coton.",
		Price: 298000, Volume: 106, Weight: 6.0, Cabin: false, Position: 4,
		Colors:  []string{"ndar", "basalte", "ivoire"},
		Gallery: []string{"/shop/assets/img/p-duo.jpg", "/shop/assets/img/p-teranga.jpg", "/shop/assets/img/p-ndar.jpg", "/shop/assets/img/life-airport.jpg"},
		Specs: []shopSpec{
			{Label: "Poids total", Value: "6,0 kg"},
			{Label: "Volume cumulé", Value: "106 L"},
			{Label: "Économie", Value: "36 000 F"},
			{Label: "Garantie coque", Value: "5 ans"},
		},
	},
	{
		Slug: "baobab-45", Name: "Baobab 45", Category: "cabine",
		Tag: "Mini cabine", Flag: "",
		Blurb: "Format sous le siège, accepté sur les tarifs sans bagage cabine payant.",
		Story: "Le Baobab passe sous le siège avant sur la plupart des vols régionaux. C'est le format des allers-retours Dakar Abidjan sans enregistrement. Ouverture frontale sur la poche extérieure pour sortir le passeport sans poser la valise.",
		Price: 118000, Volume: 28, Weight: 2.1, Cabin: true, Position: 5,
		Colors:  []string{"ivoire", "basalte", "ndar"},
		Gallery: []string{"/shop/assets/img/p-baobab.jpg", "/shop/assets/img/life-walk.jpg", "/shop/assets/img/life-pack.jpg", "/shop/assets/img/p-teranga.jpg"},
		Specs: []shopSpec{
			{Label: "Poids à vide", Value: "2,1 kg"},
			{Label: "Volume utile", Value: "28 L"},
			{Label: "Hauteur totale", Value: "45 cm"},
			{Label: "Garantie coque", Value: "5 ans"},
		},
	},
	{
		Slug: "sac-horizon", Name: "Sac Horizon", Category: "sacs",
		Tag: "Sac cabine", Flag: "",
		Blurb: "Le sac qui passe partout, sous le siege comme sur l'epaule.",
		Story: "L'Horizon tient le format admis sous le siege sur la plupart des compagnies. Toile enduite deperlante, fond renforce, sangle arriere qui vient se glisser sur la poignee d'une valise. Une poche matelassee prend un ordinateur de quinze pouces, une autre garde les papiers a portee de main.",
		Price: 29000, Volume: 20, Weight: 0.7, Cabin: true, Position: 6,
		Colors:  []string{"basalte", "sahel"},
		Gallery: []string{"/shop/assets/img/p-goree.jpg", "/shop/assets/img/life-airport.jpg", "/shop/assets/img/life-walk.jpg"},
		Specs: []shopSpec{
			{Label: "Poids a vide", Value: "0,7 kg"},
			{Label: "Volume utile", Value: "20 L"},
			{Label: "Compartiment ordinateur", Value: "15\""},
			{Label: "Garantie coutures", Value: "2 ans"},
		},
	},
	{
		Slug: "trousse-nomade", Name: "Trousse Nomade", Category: "sacs",
		Tag: "Accessoire", Flag: "",
		Blurb: "La trousse de toilette qui se suspend et ne se renverse pas.",
		Story: "La Nomade se deplie sur un crochet et laisse tout visible d'un coup d'oeil. Doublure etanche essuyable, fermeture a glissiere sur trois cotes, poche filet pour ce qui doit secher. Elle rentre a plat dans une cabine deja pleine.",
		Price: 9500, Volume: 4, Weight: 0.2, Cabin: true, Position: 7,
		Colors:  []string{"basalte", "ivoire"},
		Gallery: []string{"/shop/assets/img/detail-shell.jpg", "/shop/assets/img/life-pack.jpg"},
		Specs: []shopSpec{
			{Label: "Poids a vide", Value: "0,2 kg"},
			{Label: "Volume utile", Value: "4 L"},
			{Label: "Doublure essuyable", Value: "Etanche"},
			{Label: "Suspension integree", Value: "Crochet"},
		},
	},
}
