# SenValise — Gestion de stock

Application de gestion pour la boutique de valises et bagages **SenValise**.
Elle couvre le catalogue, le stock, la caisse, les arrivages fournisseur, les
documents commerciaux et les rapports — et sert de socle au futur site de vente
en ligne.

---

## Démarrer

```bash
composer dev
```

Cette commande lance en parallèle le serveur PHP, la file d'attente, les logs et
Vite. L'application est alors disponible sur <http://localhost:8000>.

### Comptes de démarrage

| Rôle    | E-mail                  | Mot de passe    |
| ------- | ----------------------- | --------------- |
| Gérant  | `gerant@senvalise.sn`   | `mot-de-passe-retire` |
| Vendeur | `vendeur@senvalise.sn`  | `mot-de-passe-retire` |

> **À changer dès la mise en service**, depuis _Réglages → Utilisateurs_.

### Repartir d'une base vierge

```bash
php artisan migrate:fresh --seed          # tables + réglages + 2 comptes
php artisan db:seed --class=DemoSeeder    # catalogue et ventes de démonstration
```

Le `DemoSeeder` est facultatif : il remplit la base d'un catalogue de valises,
d'un arrivage réceptionné et d'une trentaine de ventes, pour voir tout de suite
à quoi ressemble l'application remplie.

---

## Le menu

Dix entrées au maximum, dans l'ordre d'une journée de travail. Le vendeur n'en
voit que sept.

Trois groupes : le quotidien, la marchandise, le pilotage.

| Entrée | À quoi ça sert |
| --- | --- |
| Accueil | Le tableau de bord : chiffres, courbes, alertes |
| Caisse | Vendre |
| Ventes | Ce qui a été vendu |
| Factures & devis | Les papiers clients |
| Commandes | Ce qui est commandé sur le site |
| Coffres | La mise de côté des clients |
| Messages reçus | Le formulaire de contact du site |
| Messages | Publicités, promotions, rappels de paiement |
| Clients | Le fichier client |
| Produits | Le catalogue |
| Stock | Ce qu'il reste en rayon |
| Étiquettes | Imprimer les codes-barres |
| Arrivages | Ce qui arrive du fournisseur |
| Rapports | L'analyse |
| Doublons | Nettoyer les fiches saisies deux fois |
| Réglages | Boutique, catégories, marques, fournisseurs, utilisateurs, intégrations |

L'historique des mouvements de stock s'ouvre depuis _Stock_.

## Ce que fait l'application

### Accueil

Un tableau de bord sur la période choisie — **7 jours, 30 jours, 90 jours ou
12 mois** — le choix se garde dans l'adresse, la page se partage donc telle
qu'on la voit.

En tête, le chiffre d'affaires en grand avec l'écart face à la période
précédente : un montant seul ne dit pas si la période est bonne. Puis les
chiffres clés — encaissé, reste à encaisser, nombre de ventes et panier moyen,
stock en alerte, et pour le gérant la marge dégagée et la valeur du stock.

En dessous, six lectures complémentaires :

| Carte | Ce qu'elle répond |
| --- | --- |
| Évolution des ventes | Le chiffre d'affaires et la marge dans le temps ; l'écart entre les deux courbes, c'est le coût des articles vendus |
| Créances par ancienneté | Qui doit de l'argent depuis combien de temps (1–30 j, 31–60 j, 61–90 j, plus de 90 j) |
| Statut d'encaissement | Les factures payées, partiellement payées, en attente |
| Meilleurs produits · Meilleurs clients · Ventes par catégorie | Où se fait le chiffre |
| Affluence | À quelles heures et quels jours la boutique se remplit |

Enfin les articles à réapprovisionner, avec leur jauge stock/seuil.

Au-delà de quatre mois la courbe passe au pas mensuel : 365 points ne se lisent
pas. Les créances, elles, ignorent la période — un impayé de l'an dernier reste
dû aujourd'hui, il doit rester visible même en affichage « 7 jours ».

Chaque graphique a son **tableau jumeau** (« Voir les valeurs ») : un chiffre ne
doit jamais dépendre de la souris pour être lisible. Les couleurs sont validées
pour le daltonisme et le contraste dans les deux thèmes ; ni un état de stock ni
un statut de facture n'est porté par la couleur seule (icône + texte
l'accompagnent toujours).

Le vendeur ne reçoit ni la marge ni la valeur du stock — elles ne sont pas
seulement masquées à l'écran, elles ne sont pas envoyées au navigateur.

### Caisse

Écran de vente rapide. Le catalogue vendable est chargé d'un bloc dans le
navigateur : la recherche et le **scan de code-barres** sont instantanés, sans
aller-retour serveur. La douchette tape le code puis valide — l'article tombe
directement dans le panier.

Remises par ligne ou globales, modes de paiement locaux (espèces, Wave, Orange
Money, Free Money, carte, virement, crédit), calcul de la monnaie à rendre, et
ticket imprimable au format thermique 80 mm.

### Photos des produits

Jusqu'à dix photos par produit, dans la section _Boutique en ligne_ de la fiche.
Glisser-déposer ou sélection classique, avec aperçu avant enregistrement et
choix de la photo principale.

Les fichiers arrivent d'un téléphone : plusieurs méga-octets, et souvent
pivotés par le capteur. À l'enregistrement ils sont **redressés d'après leurs
données EXIF**, ramenés à 1400 px de large et ré-encodés en WebP — une photo de
4 Mo tombe autour de 100 Ko. La vignette apparaît ensuite dans la liste des
produits, et les photos seront reprises telles quelles par le site de vente.

#### Chercher des photos en ligne

Un bouton « Rechercher des photos en ligne » ouvre une fenêtre dont le champ est
déjà rempli avec le nom du produit : il suffit de cliquer sur _Rechercher_. Les
propositions s'affichent en grille avec leur source et leurs dimensions ; on
coche celles qu'on veut, et elles sont téléchargées puis allégées à
l'enregistrement de la fiche.

La clé se saisit dans **Réglages → Intégrations**. Elle est chiffrée en base et
n'est jamais renvoyée au navigateur — l'écran n'en affiche que les quatre
derniers caractères, et c'est le serveur qui appelle SerpAPI. Sans clé, le
bouton reste simplement inactif.

> **Attention aux droits.** Les images trouvées appartiennent à leurs auteurs.
> C'est pratique pour préparer une fiche en interne ; pour les photos publiées
> sur la boutique en ligne, utilisez vos propres clichés ou ceux du fabricant.

### Stock

Chaque **déclinaison** d'un produit (un modèle dans une taille et une couleur)
est un article vendable avec son propre stock et son propre code-barres.

Toute variation de quantité passe par un point unique et laisse une trace
horodatée et attribuée : entrées, sorties, retours, casse, perte, vol,
inventaire. On ne corrige jamais un mouvement, on en ajoute un — l'historique
reste vrai.

L'écran d'inventaire permet de compter au scan (+1 par passage) ou à la saisie,
et ne génère un mouvement que sur les écarts réels.

### Arrivages

C'est là que se joue la justesse des marges. On saisit la marchandise dans sa
devise d'achat (yuan, euro, dirham…) avec son taux de change, puis les frais de
**transport, de douane et divers**.

Ces frais sont **répartis sur chaque article au prorata de sa valeur** pour
obtenir le prix de revient réellement rendu boutique. Sans cette répartition,
une valise achetée 24 000 F paraît coûter 24 000 F alors qu'elle en coûte
32 800 une fois le conteneur payé — et toutes les marges affichées sont fausses.

Un arrivage reste en brouillon tant qu'il n'est pas réceptionné. La réception
fait entrer le stock et recalcule le prix de revient en **moyenne pondérée**.

### Étiquettes code-barres

Recherche, sélection multiple, quantité d'étiquettes par article, puis
génération d'une planche imprimable. Quatre formats : trois planches A4
(24, 40 ou 14 étiquettes) et le rouleau thermique 40 × 30 mm.

Les codes sont des **EAN-13 valides** générés en interne avec le préfixe 200–299,
réservé par la norme GS1 à la circulation interne : aucun risque de collision
avec le code d'un fabricant.

### Documents commerciaux

Devis, factures et bons de livraison, avec chaînage : un devis accepté devient
une facture, qui engendre un bon de livraison — les lignes sont recopiées et les
documents restent liés. Impression directe ou export PDF (pratique pour l'envoi
par WhatsApp). Une facture peut aussi être éditée d'un clic depuis une vente.

Un document ne touche jamais au stock : seule la caisse fait bouger les
quantités, ce qui évite tout double décompte.

### Messages

Un seul endroit pour tout ce que la boutique envoie à ses clients : publicités,
promotions, remerciements et **rappels de paiement**.

**Modèles.** On écrit le texte une fois, avec des variables — `{client}`,
`{facture}`, `{montant}`, `{reste}`, `{echeance}`, `{boutique}` — remplacées
pour chaque destinataire à l'envoi. Cinq modèles prêts à l'emploi sont fournis.

**Destinataires.** Soit tous les clients, soit ceux qui ont une **facture non
soldée** : dans ce cas la facture concernée est rattachée au message, et
`{reste}` affiche le bon montant pour chacun. Les clients sans la coordonnée du
canal choisi sont écartés d'office, avec le compte affiché.

**Historique.** Recherche libre, filtres par type, canal, statut et dates. Le
texte réellement envoyé est conservé : modifier le modèle ensuite ne réécrit pas
le passé. Un échec affiche sa raison et se relance d'un clic.

Les envois passent par une file d'attente : une campagne de deux cents clients
ne bloque pas l'écran, et un numéro invalide n'empêche pas les autres de partir.

### Canaux d'envoi

**E-mail.** Serveur SMTP réglé dans _Réglages → Intégrations_ : hôte, port,
chiffrement, identifiants, adresse et nom d'expédition. Un bouton « M'envoyer un
test » envoie un vrai message au gérant connecté — le seul test qui prouve
quelque chose. Avec Gmail, utiliser un mot de passe d'application.

**WhatsApp** par l'[API officielle de Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
(Cloud API). C'est la seule voie autorisée pour écrire à des clients depuis un
logiciel — et donc la seule qui ne finit pas par un numéro banni. Voir
[Ne pas se faire bannir sur WhatsApp](#ne-pas-se-faire-bannir-sur-whatsapp).

Ce qu'il faut recopier depuis _developers.facebook.com_ vers _Réglages →
Intégrations_ : l'identifiant du numéro, celui du compte professionnel, un
**jeton permanent** créé depuis un utilisateur système (celui du tableau de bord
expire en 24 h), la clé secrète de l'application et un jeton de vérification que
vous inventez. L'application affiche en retour l'adresse du webhook à coller
chez Meta.

Un mode **WAHA** reste disponible pour les essais. Il pilote un compte WhatsApp
ordinaire en imitant WhatsApp Web, ce que les conditions d'utilisation de Meta
interdisent : à réserver aux tests, jamais au numéro de la boutique.

Les numéros sont normalisés à l'envoi : `77 885 83 74`, `778858374` ou
`+221 77 885 83 74` aboutissent tous au même contact. L'indicatif par défaut
(221) est réglable.

Les mots de passe, jetons et clés d'API sont chiffrés en base et ne sont jamais
renvoyés au navigateur.

### Ne pas se faire bannir sur WhatsApp

Un numéro professionnel se fait couper vite, et sans grand recours. Meta note la
qualité du numéro à partir de ce que font les destinataires : s'ils bloquent ou
signalent, la note passe au jaune puis au rouge, le palier d'envoi gèle puis
retombe, et le numéro finit suspendu. Cinq garde-fous sont donc câblés dans
l'application, pas laissés à la vigilance du gérant :

| Garde-fou | Ce que ça empêche |
| --- | --- |
| **Consentement obligatoire pour la publicité** | Une case sur la fiche client, datée. Sans elle, aucune publicité ni promotion ne part vers ce client. C'est la première cause de bannissement |
| **Fenêtre de 24 heures** | Hors des 24 h qui suivent un message du client, seul un **modèle approuvé par Meta** peut partir. L'application refuse avant l'API : un envoi rejeté compte quand même contre la réputation |
| **Désinscription automatique** | Un client qui répond « stop » est désinscrit par le webhook, immédiatement. Un refus prime toujours sur un accord antérieur |
| **Étalement des campagnes** | Six secondes entre deux envois. Meta regarde la vitesse autant que le volume : 200 messages en dix secondes ressemblent à du spam, les mêmes sur vingt minutes à une boutique qui travaille |
| **Note de qualité affichée** | Lue chez Meta à chaque ouverture des réglages, avec le palier d'envoi. Au rouge, un avertissement explicite conseille d'arrêter les publicités quelques jours |

Le **webhook** (`/webhooks/whatsapp`) fait le reste du travail : il note l'heure
de chaque message reçu — c'est lui qui ouvre la fenêtre de service —, enregistre
les demandes de désinscription, et suit les accusés de réception (remis, lu,
échec). Chaque appel est vérifié par signature HMAC : sans cela, n'importe qui
connaissant l'adresse pourrait fabriquer de fausses fenêtres de 24 heures.

Les erreurs de Meta sont traduites en français utile plutôt qu'en codes : « la
fenêtre de 24 h est fermée », « ce modèle a été suspendu », « le jeton a
expiré ».

### Doublons

Trois onglets — produits, clients, catégories. Les fiches sont rapprochées sur
une forme normalisée (sans accents, sans majuscules, sans ponctuation) ; les
clients le sont d'abord par leur téléphone, plus fiable que le nom.

On désigne la fiche à conserver, on coche celles à absorber, et :

- **Produits** — les déclinaisons identiques (même taille, même couleur) sont
  regroupées : les quantités s'additionnent et le prix de revient est recalculé
  en moyenne pondérée. Les autres sont rattachées au produit conservé. Le
  transfert passe par deux mouvements de stock, donc le journal reste équilibré
  et la fusion se relit dans l'historique.
- **Clients** — ventes, devis, factures, bons de livraison et messages basculent
  sur la fiche conservée, dont les champs vides sont complétés depuis les
  doublons.
- **Catégories** — les produits sont transférés.

Un test vérifie que le total en stock est identique avant et après une fusion :
rien ne se crée, rien ne se perd.

### Rapports

Chiffre d'affaires, marge et taux de marge sur la période choisie, évolution
jour par jour, répartition par catégorie, par mode de paiement et par vendeur,
meilleures ventes, et **stock dormant** (en rayon mais sans vente depuis 60
jours — de l'argent immobilisé). Export CSV lisible directement dans Excel.

---

## Rôles

| | Gérant | Vendeur |
| --- | :---: | :---: |
| Caisse, ventes, clients, documents, étiquettes | ✅ | ✅ |
| Consultation du catalogue et du stock | ✅ | ✅ |
| Prix d'achat, marges, valeur du stock | ✅ | ❌ |
| Arrivages, fournisseurs, rapports | ✅ | ❌ |
| Inventaire, ajustements de stock | ✅ | ❌ |
| Création de produits, utilisateurs, réglages | ✅ | ❌ |
| Annulation d'une vente | ✅ | ❌ |

L'inscription publique est désactivée : les comptes sont créés par le gérant.

---

## Choix techniques

**Laravel 13 · Inertia 3 · React 19 · TypeScript · Tailwind 4 · shadcn/ui · SQLite**

Quelques décisions qui méritent une explication :

- **Les montants sont des entiers.** Le franc CFA n'a pas de décimales. Stocker
  et calculer en entiers supprime toute erreur d'arrondi flottant.
- **Un produit, des déclinaisons.** Le stock et le code-barres vivent sur la
  déclinaison, pas sur le produit — c'est ce qui permet de gérer « cabine noire »
  et « grande bleue » séparément tout en gardant une fiche produit unique, prête
  pour une page produit avec sélecteurs sur le site de vente.
- **Prix figés à la vente.** Chaque ligne de vente conserve son libellé, son prix
  et son prix de revient. Changer un tarif demain ne réécrit pas l'historique.
- **Un seul point d'écriture du stock** (`StockService`). Rien d'autre ne touche
  aux quantités, ce qui garantit qu'un mouvement est tracé à chaque variation.
- **Devis, factures et BL dans une seule table.** Ces trois documents partagent
  95 % de leur structure ; les séparer aurait donné trois modules quasi
  identiques à maintenir.
- **SQLite.** Un fichier unique, facile à sauvegarder (copier
  `database/database.sqlite`). Le passage à PostgreSQL ou MySQL ne demande qu'un
  changement dans `.env`, sans toucher au code.

### Téléphone et tablette

La boutique se tient debout : l'application doit être utilisable sur le téléphone
du gérant et sur une tablette au comptoir, pas seulement sur un écran de bureau.

**Les listes changent de forme, pas de contenu.** Sous 1024 px — téléphone,
tablette en portrait — un tableau de sept colonnes se lit à la loupe ou déborde.
La même donnée devient une tuile : un titre, une ligne de contexte, le chiffre
qui compte, et la carte entière est cliquable. Au-delà, le tableau reprend sa
place, avec ses colonnes secondaires masquées jusqu'à 1280 px. Les deux rendus
vivent dans le DOM et l'un est masqué en CSS : basculer en JavaScript sur la
largeur ferait clignoter la liste au chargement et à chaque rotation.

**La caisse met le panier dans un tiroir.** Sur un écran de six pouces, une
colonne posée sous soixante articles obligerait à faire défiler tout le
catalogue pour encaisser. Une barre reste donc sous le pouce, avec le nombre
d'articles et le total ; elle ouvre le panier par le bas. Les tuiles produits
passent à deux colonnes et s'enfoncent au toucher — sur un écran tactile, c'est
la seule preuve que l'article a bien été pris.

**Ce qui déborde a été repris** : la recherche prend toute la largeur et les
filtres se rangent deux par deux, les boutons d'en-tête s'étalent sur la ligne,
les sous-titres explicatifs cèdent la place au contenu, et les cibles de touche
font au moins 44 px de haut — la taille d'un doigt, pas celle d'un curseur.

### Le mouvement

L'interface est animée partout, mais brièvement : 150 à 300 ms, une seule
courbe de sortie, aucun rebond. Une animation doit dire « ceci vient d'arriver »
ou « ceci a changé » — au-delà, sur un écran de caisse, on attend le logiciel au
lieu de servir le client.

Ce qui bouge et pourquoi :

| Endroit | Mouvement |
| --- | --- |
| Changement d'écran | La page monte de 6 px en fondu. La clé est le composant, pas l'adresse : filtrer ou paginer ne rejoue rien, sinon le champ de recherche perdrait le focus à chaque lettre |
| Lignes de tableau | Arrivée en cascade, plafonnée à 140 ms — sur cinquante lignes, une cascade complète ferait attendre |
| Boutons, onglets, pagination | Enfoncement au clic ; sur l'écran tactile de la caisse, c'est la seule preuve que l'article a été pris |
| Chiffre d'affaires | Le montant défile jusqu'à sa valeur ; en changeant de période il part de l'ancien chiffre, le sens du changement se voit avant même de lire l'écart |
| Courbes | Le tracé se dessine, le remplissage suit. Le repère de survol glisse d'un point à l'autre |
| Barres | Elles poussent depuis leur point d'ancrage — à gauche pour un classement, depuis la ligne de base pour une tranche d'âge |
| Panier | La ligne ajoutée glisse en place, la pastille du compteur se rejoue à chaque article |
| Thème clair / sombre | Fondu de toute la page (API View Transitions ; bascule instantanée là où le navigateur ne la connaît pas) |

**Le système d'exploitation a le dernier mot.** Si l'utilisateur a activé
« réduire les animations » — vertiges, migraines, troubles de l'attention — tout
est neutralisé, y compris ce que les bibliothèques ajoutent de leur côté, et le
compteur affiche directement son résultat.

---

## La boutique en ligne

Le site de vente vit dans la même application : même catalogue, même stock,
mêmes clients. Il s'ouvre sur `/boutique` et n'emprunte rien à l'interface de
gestion — un acheteur n'est pas un utilisateur du logiciel.

### Deux registres assumés

Le logiciel de gestion est sobre et arrondi : on y passe la journée, rien ne
doit fatiguer. La vitrine, elle, a trois secondes pour accrocher — angles vifs,
images à fond perdu, titres lourds, capitales espacées, bandeau d'annonces qui
défile. Deux registres différents parce que ce sont deux métiers différents, et
un même jeu de couleurs pour que ça reste la même maison.

Concrètement : la boutique n'emprunte ni le bouton, ni la carte, ni le cadre du
back-office. Elle a ses propres pièces dans
[components/boutique/](resources/js/components/boutique/) — en-tête de section
(surtitre → titre → sous-titre), bouton rectangulaire en capitales, rail de
produits — et trois classes de lettrage dans [app.css](resources/css/app.css).

Le **héros est un diptyque** : les deux premières bannières se placent côte à
côte, la première portant le texte. Avec une seule elle occupe toute la largeur,
avec aucune le titre tient seul sur du noir — la page d'accueil ne casse jamais.

Les **vignettes de catégorie** reprennent l'image du premier produit publié de
la catégorie : aucune photo de plus à fournir, et la vitrine suit le catalogue
toute seule.

Les **meilleures ventes sont réelles** — le classement vient de ce qui est
sorti du rayon, pas d'une sélection à la main. Tant que rien n'a été vendu, la
rangée retombe sur les nouveautés plutôt que de rester vide.

### Ce que voit le client

**Une page d'accueil qui se pilote depuis l'application.** Bannière, vidéos de
publicité, promotions, arguments de réassurance : le gérant les compose dans
_Réglages → Accueil boutique_. Chaque bloc peut porter une date de début et de
fin — une opération se prépare à l'avance et s'éteint toute seule, personne
n'a à penser à la retirer le lundi matin.

**Un catalogue épuré.** Seuls les produits explicitement publiés sortent :
la publication est une décision, pas un effet de bord. La fiche produit montre
les déclinaisons disponibles, le prix barré quand il y a vraiment une remise,
et ce qu'il reste en stock quand il n'en reste plus beaucoup.

**Commander sans compte.** Obliger un visiteur à s'inscrire pour acheter une
valise revient à perdre la vente. Le client laisse son nom, son téléphone et
son adresse, choisit sa zone de livraison — le montant s'ajuste devant lui — et
valide. Il reçoit un lien de suivi qui fonctionne sans compte, porteur d'un
jeton aléatoire : le numéro de commande seul ne donne pas accès, puisqu'il se
devine. Le lien perdu se retrouve avec le numéro et le téléphone.

**Un espace personnel** pour ceux qui créent un compte : commandes en cours et
passées, coffres, coordonnées. S'inscrire en ligne quand on a déjà acheté au
comptoir **rattache le mot de passe à la fiche existante** plutôt que de créer
un doublon — l'historique reste d'un seul tenant.

### Le coffre

Une valise à 180 000 F ne se paie pas toujours d'un coup. Le client ouvre un
coffre — vers un article précis ou vers un simple montant —, y verse ce qu'il
peut quand il peut, et commande le jour où l'objectif est atteint. C'est le
carnet de mise de côté que les boutiques tiennent déjà, sauf que les deux
parties voient le même solde.

- **Les versements se font au comptoir.** L'application n'encaisse pas
  d'argent, elle enregistre ce que la boutique a reçu — avec la date, le moyen
  de paiement et le nom de qui a saisi. Un solde contesté doit pouvoir se
  remonter jusqu'à la personne qui a pris les billets.
- **Le solde n'est jamais stocké** : c'est la somme des versements, recalculée
  à chaque lecture. Un total tenu à part finirait par diverger de son
  historique, et c'est l'historique qu'on montre au client.
- **Un remboursement est un versement négatif**, pas un effacement. Le carnet
  reste lisible de bout en bout, y compris quand ça se passe mal.
- L'objectif atteint **bascule le coffre tout seul**, et le client peut alors
  régler une commande avec — frais de livraison compris, sinon rien ne part.
- Côté gérant, l'écran _Coffres_ rappelle en tête que l'argent détenu est une
  **dette envers les clients**, remboursable, et n'entre pas dans le chiffre
  d'affaires.

### Une commande n'est pas une vente

C'est la décision qui structure tout le reste. Trois moments, trois effets sur
le stock :

| Moment | Ce qui se passe |
| --- | --- |
| **À la commande** | La marchandise est **réservée** : elle reste au rayon mais n'est plus vendable au comptoir. Rien ne sort, parce que rien n'est encore payé ni vérifié |
| **À la confirmation** | La réserve devient une **vente** : le stock sort avec son mouvement, un ticket est créé, le montant rejoint le chiffre d'affaires. C'est ce passage qui relie la boutique en ligne à la caisse |
| **À l'annulation** | On défait exactement ce qui avait été fait — la réserve seule avant confirmation, la vente entière après |

Sans ce partage, une commande annulée aurait déjà fait disparaître la
marchandise du rayon et faussé la marge du mois.

### Trouver la porte, pas le quartier

Au Sénégal, une adresse écrite mène rarement à une porte : « Sacré-Cœur 3,
villa 128 » envoie le livreur dans le bon quartier et l'y laisse tourner. Le
client peut donc **partager sa position** au moment de commander, ou une fois
pour toutes depuis son espace.

Ce que ça change concrètement :

- La **zone de livraison se présélectionne** toute seule. Chaque zone porte un
  centre et un rayon (réglables dans _Réglages → Livraison_) ; l'application
  cherche celle qui couvre réellement le point, à défaut la plus proche. Au-delà
  de 150 km, elle ne propose rien plutôt que de se tromper avec aplomb.
- La commande garde le point **figé** : le client peut déménager ensuite, le
  livreur de l'époque retrouve la bonne porte.
- Le **livreur ouvre la carte d'un clic** depuis la fiche commande, avec la
  précision annoncée (« à 12 m près » n'a pas la même valeur qu'« à 2 km près »).

Quatre garde-fous, dans cet ordre :

| Garde-fou | Ce que ça donne |
| --- | --- |
| **On explique avant de demander** | La fenêtre du navigateur ne dit que « ce site veut connaître votre position ». Le pourquoi et le devenir de la donnée sont écrits juste au-dessus du bouton — une fois la demande refusée, elle ne se rouvre plus |
| **C'est facultatif** | Aucun bouton bloqué, aucune commande empêchée. Un refus s'affiche sans reproche, avec la marche à suivre pour revenir dessus |
| **Le consentement est daté** | Sans date, impossible de prouver qu'il a été donné. Des coordonnées sans consentement daté ne comptent pas |
| **C'est réversible** | Un bouton efface la position *et* la date d'accord. La prochaine fois, l'autorisation repart de zéro |

**Aucun service extérieur n'est appelé.** Le calcul de proximité tient en dix
lignes de trigonométrie ; envoyer la position d'un client à Google ou Mapbox
pour retrouver un quartier reviendrait à la communiquer à un tiers qu'il n'a
pas choisi. Le seul lien externe est celui que le livreur ouvre lui-même, vers
OpenStreetMap, qui n'impose de compte à personne.

### Livraison et paiement

Les zones se règlent dans _Réglages → Livraison_ : nom, frais, délai, et une
précision affichée au client. Une zone qui a servi est désactivée plutôt que
supprimée — les commandes passées gardent leur zone d'origine.

**L'application n'encaisse pas en ligne.** Le client s'engage à régler à la
livraison ou en boutique (espèces, Wave, Orange Money, Free Money), ce qui
reste la norme ici et évite d'exiger une passerelle de paiement pour ouvrir la
boutique. Une commande réglée par coffre est, elle, payée d'avance.

### Deux gardes, deux mondes

Les clients s'authentifient sur leur propre garde (`client`), distincte de
celle du personnel (`web`). Le fichier client reste unique — celui qui achète
au comptoir et celui qui commande en ligne sont la même personne — mais un
acheteur ne peut atteindre aucun écran de gestion, même par accident de
configuration. Les routes d'administration nomment leur garde
(`auth:web`) plutôt que de s'en remettre à la garde par défaut.

---

## Commandes utiles

```bash
composer dev          # tout lancer (serveur + vite + logs + queue)
composer test         # formatage, analyse statique et tests
composer ci:check     # la vérification complète, front et back
composer lint         # corriger le formatage PHP (Pint)
npm run lint          # corriger le formatage front (ESLint)
npm run build         # compiler les assets pour la production
```

### Sauvegarder les données

Toute la boutique tient dans un fichier :

```bash
copy database\database.sqlite sauvegardes\senvalise-2026-08-08.sqlite
```

À faire régulièrement, idéalement vers une clé USB ou un dossier synchronisé.
