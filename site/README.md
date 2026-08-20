# Sen Valise

Boutique en ligne de valises et bagages. Pages statiques, sans build ni
dépendance à installer, mais **branchées sur l'API de gestion** : le catalogue,
les comptes clients, le coffre et les commandes viennent de là.

## Lancer le site

La boutique est servie par le même nginx que l'espace de gestion, donc sur la
même origine que l'API — aucun CORS, aucune URL à configurer. Depuis
`senvalise_stock` :

```bash
docker compose up -d --build
```

Puis ouvrir <http://localhost:4000> pour la boutique, <http://localhost:3000>
pour la gestion.

Le site ne fonctionne plus en `file://` ni derrière un simple serveur de
fichiers : sans `/api`, le catalogue reste vide. C'était déjà le cas pour la
géolocalisation, qui exige un contexte sécurisé.

## Pages

| Fichier | Rôle |
| --- | --- |
| `index.html` | Accueil, page longue (voir ci-dessous) |
| `boutique.html` | Catalogue avec filtres par catégorie et tri (`?cat=cabine`) |
| `produit.html` | Fiche produit, lue depuis `?ref=teranga-55` |
| `panier.html` | Panier, récapitulatif et paiement par le coffre |
| `compte.html` | Connexion et création de compte |
| `coffre.html` | Présentation publique du coffre, avec simulateur |
| `mon-coffre.html` | Espace client : solde, objectif, versements, mouvements |
| `parametres.html` | Informations, mot de passe, zones de livraison, commandes |

### Sections de l'accueil, dans l'ordre

1. Bandeau promo, masquable, mémorisé dans `localStorage`
2. Hero, vitrine tournante de quatre modèles
3. Bandeau services (livraison, garantie, retours)
4. Choisir par format, quatre tuiles vers `boutique.html?cat=…`
5. Meilleures ventes, bande défilante avec pastilles de classement
6. Bannière promo Duo Teranga, avec compte à rebours
7. Toute la collection, les six produits
8. Bento « ce qui change vraiment » (`#garantie`)
9. Matière, coque et caractéristiques (`#matiere`)
10. Comparatif des six formats (`#comparatif`)
11. Finitions, bande défilante de teintes (`#finitions`)
12. En voyage, bande de photos en monochrome
13. Avis clients
14. Questions fréquentes
15. Réassort, formulaire e-mail

## Structure

```
assets/
  css/main.css     tokens, composants, responsive
  css/fonts.css    Geist auto-hébergé (généré, ne pas éditer à la main)
  js/api.js        couche réseau : jeton, appels /api/shop (à charger en premier)
  js/data.js       catalogue chargé depuis l'API, expose SV_PRODUCTS et consorts
  js/account.js    comptes, coffre, adresses, commandes, zones (à charger avant app.js)
  js/app.js        thème, navigation, panier, tiroir, révélations, toasts
  js/icons.js      sprite d'icônes Phosphor (généré)
  fonts/           Geist woff2, sous-ensembles latin et latin-ext
  img/             photographies produit et lifestyle
```

## Parti pris de design

- **Palette** : cobalt `#1f3fe0` sur gris froid, plus le jaune de la marque
  (`--gold`). Le bleu reste le seul accent qui porte les actions ; le jaune
  n'apparaît que par touches et jamais en aplat de fond. Il est réservé à cinq
  endroits : la poignée du logo, les pastilles de classement des meilleures
  ventes, les étoiles des avis, la remise de la bannière promo et le trait sous
  le mot qui tourne dans le hero. En ajouter un sixième demande de se poser la
  question, sinon la couleur cesse d'être un signal.
- **Le jaune du logo** est porté par la poignée, pas par la sangle. La sangle
  fait 1,8 unité de haut dans un dessin de 32, soit un peu plus d'un pixel une
  fois le mark ramené à 26 px : le jaune s'y noie dans le bleu et vire à l'ocre.
  La poignée déborde du corps, donc elle tient sur le fond de la page comme sur
  le bleu, en thème clair comme en sombre.
- **Icônes** : les glyphes du sprite ne portent aucun attribut `fill`, et `fill`
  ne suit pas `color` tout seul. `.ico` pose donc `fill: currentColor`. Sans
  cette ligne les icônes retombent sur le noir initial quelle que soit la
  couleur autour, ce qui donnait une flèche noire sur le bouton bleu et des
  étoiles noires sous les avis.
- **Rayons** : surfaces 20 px, champs 12 px, éléments interactifs en pilule.
- **Verre dépoli** : `backdrop-filter` avec bordure interne et reflet, sur la barre de
  navigation, le tiroir panier, la barre de filtres et les encarts posés sur photo.
  Repli opaque sous `prefers-reduced-transparency`.
- **Photographies** : sources hétérogènes ramenées à un seul rendu via un étalonnage
  commun (`saturate(.7) contrast(1.04)`), pour que le catalogue se lise comme une
  seule marque.
- **Thème** : clair et sombre. Suit `prefers-color-scheme`, le bouton de la barre
  écrase ce choix et le retient. Un script en ligne applique le thème avant le
  premier rendu, ce qui évite le flash de thème clair.
- **Mouvement** : entrées du hero, révélations au défilement via `IntersectionObserver`,
  survols. Tout est neutralisé sous `prefers-reduced-motion`.

## Texte du hero

Le titre présente la marque en trois lignes, la dernière se terminant par un mot
qui tourne sur les catégories réelles de la boutique : la cabine, la soute, les
sacs, les sets. Sous le titre, une pastille suit ce mot et donne le nombre de
modèles et le prix d'entrée de la catégorie affichée, avec le lien vers
`boutique.html?cat=…` correspondant. La phrase de présentation, elle, entre mot
à mot.

**Tout ce que le hero avance en chiffres est relu dans `data.js`** au chargement :
le nombre de modèles, les volumes extrêmes, le nombre de finitions, le prix le
plus bas, le compte et le prix par catégorie, et jusqu'au modèle mis en avant en
bas de colonne, choisi parmi ceux qui portent un macaron plutôt qu'écrit en dur.
Les mêmes valeurs figurent dans le HTML pour le rendu sans JavaScript, mais
c'est le script qui fait foi : ajouter un modèle au catalogue met le hero à jour
sans toucher à `index.html`.

Comme pour le carrousel, c'est une animation qui sert de minuteur : le trait
doré sous le mot se dessine, et sa fin d'animation appelle le terme suivant. Le
survol de la colonne met le trait en pause, donc met la rotation en pause, sans
second compteur à synchroniser. Les largeurs de chaque terme sont mesurées une
seule fois au démarrage et posées en pixels, ce qui permet de faire glisser la
ligne d'un mot à l'autre au lieu de la laisser se recomposer d'un coup.

Deux points à ne pas défaire dans `paint()` : le mot sortant se cherche avec
`.rot__w:not(.is-out)`, sinon c'est un ancien mot encore en cours d'animation
que l'on retrouve au tour suivant et les termes s'empilent ; et les restes
marqués `is-out` sont balayés en début de fonction, au cas où leur animation
n'aurait jamais démarré.

Sous `prefers-reduced-motion`, le mot ne tourne pas. Il reste sur la première
catégorie, souligné, la pastille pointe vers elle, et la phrase s'affiche d'un
bloc. La phrase est doublée dans le DOM, une copie découpée en mots pour
l'animation et une copie `sr-only` d'un seul tenant, sans quoi les lecteurs
d'écran l'annonceraient mot par mot.

## Vitrine du hero

La photo du hero enchaîne quatre modèles toutes les 5,5 secondes, en fondu, avec
une lente dérive d'échelle pendant que la diapositive est à l'écran. L'encart en
verre suit : nom, prix, finition et lien produit changent avec l'image.

Les quatre barres en haut à droite du cadre servent à la fois d'indicateur de
progression et de boutons. C'est la barre active qui fait office de minuteur :
la diapositive suivante est déclenchée par son `animationend`. Conséquence
utile, mettre l'animation en pause au survol met aussi la rotation en pause,
sans second compteur à synchroniser.

Seule la première image est chargée au départ ; les trois autres arrivent après
l'événement `load`, pour ne pas concurrencer l'affichage initial. Une
diapositive précharge toujours la suivante.

Les sources sont volontairement toutes en portrait. Le cadre est en 4/5 et une
photo en paysage y perdrait la moitié du produit au recadrage : c'est pourquoi
la Teranga 55, dont le visuel est en 1200x800, n'est pas dans la vitrine.

Sous `prefers-reduced-motion`, la rotation ne démarre pas, les barres restent
pleines et cliquables, et les quatre images sont chargées d'emblée.

## Bandes défilantes

Meilleures ventes et Finitions défilent en continu de la gauche vers la droite.

Le groupe d'origine est cloné au chargement jusqu'à couvrir deux fois la largeur
de la fenêtre, puis la piste est translatée d'exactement une largeur de groupe :
la boucle se referme sur elle-même, sans raccord visible. La vitesse est
exprimée en pixels par seconde dans `startMarquee()`, donc une bande large et
une bande étroite avancent au même rythme.

Trois façons d'arrêter le défilement :

- le survol à la souris et le focus clavier le mettent en pause, sinon un lien
  serait impossible à cliquer ;
- le bouton **Pause** dans l'en-tête de section, pour le clavier et le tactile ;
- `prefers-reduced-motion` désactive l'animation. La bande redevient alors un
  rail que l'on fait défiler à la main, les clones sont retirés et le bouton
  Pause disparaît.

Les clones portent `aria-hidden` et leurs liens passent en `tabindex="-1"` :
ils restent cliquables mais ne sont ni annoncés deux fois, ni atteignables au
clavier.

Un détail à connaître si vous modifiez la largeur des items : elle doit être
déclarée en `width`, pas en `flex-basis`. La piste est en `width: max-content`
et, sous ce dimensionnement intrinsèque, Firefox mesure les items sur leur
contenu et ignore le `flex-basis`, ce qui fausse le calcul de la boucle.

## Animations de la boutique

Les cartes entrent en cascade, la grille se fond au changement de filtre ou de
tri, l'en-tête et la barre de filtres montent à l'ouverture, et le compteur de
résultats se rejoue quand il change.

Un piège à connaître : poser la classe `is-in` juste après avoir écrit le
`innerHTML` ne déclenche **aucune** transition, les deux états tombant dans la
même frame. Le rendu force donc un reflow (`void grid.offsetHeight`) entre les
deux, ce qui fige l'état initial avant la bascule. C'est ce qui manquait, et
pourquoi les cartes apparaissaient d'un bloc.

## Comptes et coffre

Les comptes vivent désormais côté serveur. Le mot de passe est haché en bcrypt
par l'API, jamais stocké en clair ni transmis au-delà de la requête de
connexion. Le navigateur ne garde qu'un jeton signé, valable 24 heures, sous la
clé `sv.token`. Un client retrouve donc son coffre et ses commandes depuis
n'importe quel appareil, et le gérant les voit dans le back-office.

Ce qui n'est **pas** encore branché : l'encaissement des versements. Wave,
Orange Money et le virement sont proposés comme moyens, mais aucun opérateur
n'est appelé — c'est la boutique qui crédite le coffre après réception. Le
paiement d'une commande par le coffre, lui, est bien réel : il débite le solde,
crée la commande et décrémente le stock.

Tout est dans `assets/js/account.js`, qui expose `SV.Auth`, `SV.Account` et
`SV.Geo`.

Deux pages, à ne pas confondre : `coffre.html` est la **vitrine**, visible sans
compte, avec un simulateur de versements ; `mon-coffre.html` est l'**espace
client**, protégé par `SV.Auth.guard()`. Un visiteur déjà connecté voit les
boutons de la vitrine pointer directement vers son espace.

**Le coffre.** Le client verse ce qu'il veut, quand il veut, entre 1 000 F et
2 000 000 F par versement. Il peut fixer un objectif, soit un modèle du
catalogue, soit un montant libre, et suit sa progression. Quand le solde couvre
le total du panier, le bouton « Payer avec le coffre » apparaît dans le panier :
il débite le coffre, crée la commande et vide le panier. C'est le seul moyen de
paiement réellement fonctionnel de la maquette, les autres passerelles n'étant
pas branchées. Un client non connecté voit à la place une invitation à se
connecter.

Les lignes de la commande sont photographiées au moment de l'achat : si un prix
du catalogue change ensuite, les commandes déjà passées gardent le leur.

**Les zones de livraison.** Vingt zones sont décrites dans `account.js`, avec
leur centroïde et leur délai. Le bouton « Repérer ma position » demande la
permission de géolocalisation, puis compare les coordonnées obtenues aux
centroïdes pour proposer la zone la plus proche. Le calcul est local : aucun
service de cartographie n'est appelé, la position ne quitte pas le navigateur.
Au-delà de 40 km du centroïde le plus proche, le point est signalé hors
couverture et la zone reste à choisir à la main. La géolocalisation exige un
contexte sécurisé : elle fonctionne en `https` et sur `localhost`, pas en
`file://` sous Firefox.

**Le suivi de commande** est déduit du temps écoulé depuis l'achat (reçue,
préparation, livraison, livrée). C'est une simulation assumée, indiquée comme
telle sur la page : sans transporteur branché, il n'y a rien de réel à
interroger.

**Le mot de passe** est haché en SHA-256 avec un sel aléatoire par compte, via
`crypto.subtle`, pour ne pas dormir en clair dans le stockage. Cela ne remplace
pas une vérification côté serveur. Si `crypto.subtle` n'est pas disponible, les
formulaires refusent l'inscription avec un message explicite plutôt que de
basculer sur un hachage factice.

## Ordre de chargement des scripts

`account.js` doit être chargé **avant** `app.js`. `app.js` démarre dès son
exécution et appelle `SV_PAGE()` dans la foulée : un module chargé après lui
n'existerait pas encore quand les pages s'initialisent. `app.js` complète
l'objet `SV` au lieu de le remplacer, pour ne pas écraser ce qu'`account.js` y a
déjà posé.

## État des données

Le catalogue vit en base et se modifie dans le back-office ; `assets/js/data.js` ne fait plus que le charger. Chaque produit porte un champ
`cabin` : il ne se déduit pas de la catégorie, puisque le Gorée Weekend est
rangé dans « sacs » tout en passant en cabine. C'est ce champ qui alimente la
colonne Cabine du comparatif.

Clés dans `localStorage` :

| Clé | Rôle |
| --- | --- |
| `sv.cart` | Contenu du panier, seul état encore purement local |
| `sv.theme` | `light` ou `dark`, écrase la préférence système |
| `sv.announce` | `off` quand le bandeau promo a été masqué |
| `sv.token` | Jeton de session, remis par l'API à la connexion |

Comptes, coffre, adresses et commandes ne sont plus dans le navigateur : ils
sont servis par `/api/shop` et rechargés à chaque ouverture de page.

L'offre du mois court toujours jusqu'au dernier jour du mois en cours : la date
et le compte à rebours sont calculés au chargement, la page n'affiche donc
jamais une échéance dépassée.

## Cache des assets

Les feuilles de style et les scripts sont appelés avec `?v=11`. Firefox garde
sinon l'ancienne version en cache pendant plusieurs heures et les modifications
n'apparaissent pas. **Après toute modification de `main.css` ou d'un fichier de
`assets/js/`, incrémentez ce numéro dans les huit pages HTML.**

Le bouton « Passer commande » reste non branché pour les paiements hors coffre :
c'est le point d'accroche à remplacer par une vraie passerelle (Wave, Orange
Money, carte). Le paiement par le coffre, lui, est fonctionnel de bout en bout.

## Crédits

- Photographies : Unsplash.
- Icônes : [Phosphor Icons](https://phosphoricons.com) (MIT).
- Typographie : [Geist](https://vercel.com/font) (SIL OFL 1.1), auto-hébergée.
