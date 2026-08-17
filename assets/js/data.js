/* Sen Valise - catalogue.
   Prices in F CFA. Dimensions and weights are illustrative product copy. */

window.SV_COLORWAYS = {
  basalte: { name: "Noir Basalte", hex: "#1a1d24" },
  ndar:    { name: "Bleu Ndar",    hex: "#1f3fe0" },
  ivoire:  { name: "Ivoire",       hex: "#e7e3da" },
  sahel:   { name: "Vert Sahel",   hex: "#2f5d4f" }
};

window.SV_PRODUCTS = [
  {
    ref: "teranga-55",
    cabin: true,
    name: "Teranga 55",
    tag: "Cabine",
    category: "cabine",
    price: 145000,
    weight: 2.6,
    volume: 38,
    img: "assets/img/p-teranga.jpg",
    gallery: ["assets/img/p-teranga.jpg", "assets/img/life-pack.jpg", "assets/img/life-open.jpg", "assets/img/life-walk.jpg"],
    colors: ["ndar", "basalte", "ivoire", "sahel"],
    flag: "La plus vendue",
    blurb: "55 x 40 x 20 cm. Passe en bagage à main sur Air Sénégal, ASKY et Brussels Airlines.",
    desc: "La Teranga est notre format cabine. Coque en polycarbonate recyclé pressé en une seule pièce, quatre roues silencieuses montées sur roulements scellés, poignée en aluminium à cinq positions. Elle a été testée sur les carreaux de l'AIBD comme sur les pavés de Saint-Louis.",
    specs: [
      { v: "2,6 kg", k: "Poids à vide" },
      { v: "38 L", k: "Volume utile" },
      { v: "5 ans", k: "Garantie coque" },
      { v: "4 roues", k: "Rotation 360°" }
    ]
  },
  {
    ref: "ndar-65",
    cabin: false,
    name: "Ndar 65",
    tag: "Soute moyenne",
    category: "soute",
    price: 189000,
    weight: 3.4,
    volume: 68,
    img: "assets/img/p-ndar.jpg",
    gallery: ["assets/img/p-ndar.jpg", "assets/img/detail-shell.jpg", "assets/img/life-stand.jpg", "assets/img/life-set.jpg"],
    colors: ["basalte", "ndar", "sahel"],
    flag: "",
    blurb: "Le format qui couvre deux semaines sans compression. Compartiment humide isolé.",
    desc: "Le Ndar tient la semaine longue. Doublure en toile recyclée, séparateur central compressible et poche déperlante pour les affaires humides. La coque garde une profondeur constante même chargée à plein.",
    specs: [
      { v: "3,4 kg", k: "Poids à vide" },
      { v: "68 L", k: "Volume utile" },
      { v: "5 ans", k: "Garantie coque" },
      { v: "TSA", k: "Serrure intégrée" }
    ]
  },
  {
    ref: "saloum-75",
    cabin: false,
    name: "Saloum 75",
    tag: "Grande soute",
    category: "soute",
    price: 225000,
    weight: 4.1,
    volume: 96,
    img: "assets/img/p-saloum.jpg",
    gallery: ["assets/img/p-saloum.jpg", "assets/img/life-open.jpg", "assets/img/life-airport.jpg", "assets/img/life-pack.jpg"],
    colors: ["basalte", "ivoire", "sahel"],
    flag: "",
    blurb: "Pour les retours au pays chargés. Extension de 5 cm sur la ceinture avant.",
    desc: "Le Saloum est le format long séjour. Il gagne 5 cm de profondeur grâce à une ceinture d'extension zippée, et redescend à sa taille d'origine une fois vidé. Renforts d'angle en TPU sur les quatre coins, les points qui prennent les chocs en soute.",
    specs: [
      { v: "4,1 kg", k: "Poids à vide" },
      { v: "96 L", k: "Volume extensible" },
      { v: "5 ans", k: "Garantie coque" },
      { v: "TPU", k: "Renforts d'angle" }
    ]
  },
  {
    ref: "goree-weekend",
    cabin: true,
    name: "Gorée Weekend",
    tag: "Sac cabine",
    category: "sacs",
    price: 78000,
    weight: 0.9,
    volume: 26,
    img: "assets/img/p-goree.jpg",
    gallery: ["assets/img/p-goree.jpg", "assets/img/life-walk.jpg", "assets/img/life-stand.jpg", "assets/img/p-baobab.jpg"],
    colors: ["basalte", "sahel"],
    flag: "Nouveau",
    blurb: "Toile enduite déperlante, passant dorsal qui se glisse sur la poignée télescopique.",
    desc: "Le Gorée se glisse sur la poignée d'une Teranga ou d'un Ndar et ne bouge plus. Poche ordinateur rembourrée jusqu'à 16 pouces, ouverture large qui se pose à plat, sangle amovible cousue sur des ancrages métalliques.",
    specs: [
      { v: "0,9 kg", k: "Poids à vide" },
      { v: "26 L", k: "Volume utile" },
      { v: "16\"", k: "Poche ordinateur" },
      { v: "3 ans", k: "Garantie coutures" }
    ]
  },
  {
    ref: "duo-teranga",
    cabin: false,
    name: "Duo Teranga",
    tag: "Set de deux",
    category: "sets",
    price: 298000,
    compareAt: 334000,
    weight: 6.0,
    volume: 106,
    img: "assets/img/p-duo.jpg",
    gallery: ["assets/img/p-duo.jpg", "assets/img/p-teranga.jpg", "assets/img/p-ndar.jpg", "assets/img/life-airport.jpg"],
    colors: ["ndar", "basalte", "ivoire"],
    flag: "Set",
    blurb: "La Teranga 55 et le Ndar 65 dans la même finition. La petite se range dans la grande.",
    desc: "Le duo couvre le week-end et le long séjour dans une seule finition. Les deux valises sont emboîtables pour le stockage, ce qui libère la moitié d'un placard. Livré avec deux housses de rangement en coton.",
    specs: [
      { v: "6,0 kg", k: "Poids total" },
      { v: "106 L", k: "Volume cumulé" },
      { v: "36 000 F", k: "Économie" },
      { v: "5 ans", k: "Garantie coque" }
    ]
  },
  {
    ref: "baobab-45",
    cabin: true,
    name: "Baobab 45",
    tag: "Mini cabine",
    category: "cabine",
    price: 118000,
    weight: 2.1,
    volume: 28,
    img: "assets/img/p-baobab.jpg",
    gallery: ["assets/img/p-baobab.jpg", "assets/img/life-walk.jpg", "assets/img/life-pack.jpg", "assets/img/p-teranga.jpg"],
    colors: ["ivoire", "basalte", "ndar"],
    flag: "",
    blurb: "Format sous le siège, accepté sur les tarifs sans bagage cabine payant.",
    desc: "Le Baobab passe sous le siège avant sur la plupart des vols régionaux. C'est le format des allers-retours Dakar Abidjan sans enregistrement. Ouverture frontale sur la poche extérieure pour sortir le passeport sans poser la valise.",
    specs: [
      { v: "2,1 kg", k: "Poids à vide" },
      { v: "28 L", k: "Volume utile" },
      { v: "45 cm", k: "Hauteur totale" },
      { v: "5 ans", k: "Garantie coque" }
    ]
  }
];

window.SV_CATEGORIES = [
  { id: "tout",   label: "Tout" },
  { id: "cabine", label: "Cabine" },
  { id: "soute",  label: "Soute" },
  { id: "sacs",   label: "Sacs" },
  { id: "sets",   label: "Sets" }
];
