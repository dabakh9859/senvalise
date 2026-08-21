# SenValise — Gestion commerciale

Nouvelle application SenValise écrite en **Go + Fiber**, **React 19** et
**PostgreSQL**. Elle ne dépend plus de PHP ni de Laravel.

## Démarrage

```bash
docker compose up -d --build
```

Ouvrir <http://localhost:3000>.

Compte initial : `gerant@senvalise.sn` / `ChangeMe123!`. Modifiez le mot de
passe dans `.env` avant le premier démarrage (`ADMIN_PASSWORD`).

## Architecture

- `cmd/server` : démarrage de l'API Fiber ;
- `internal/models` : modèle commercial PostgreSQL ;
- `internal/api` : API REST et transactions métier ;
- `src` : SPA React/Vite ;
- `site` : boutique en ligne, pages statiques servies par le meme nginx ;
- `deploy` : reverse proxy Nginx ;
- `compose.yaml` : PostgreSQL, API et interface.

## Modules

Authentification et rôles, tableau de bord, caisse, ventes, retours, clients,
catalogue et déclinaisons, mouvements de stock, arrivages, documents,
commandes web, coffres, sessions de caisse, dépenses quotidiennes, messages,
livraison et rapports.

Les montants sont enregistrés en francs CFA entiers. Les ventes, réceptions,
retours et dépôts utilisent des transactions PostgreSQL avec verrouillage des
lignes sensibles.

## Mise en production

Trois variables doivent etre revues avant toute mise en ligne, sans quoi
l'installation reste une demonstration :

| Variable | Pourquoi |
| --- | --- |
| `JWT_SECRET` | Sans elle, n'importe qui peut forger un jeton de gerant. Avec `APP_ENV=production`, le serveur refuse de demarrer tant qu'elle vaut sa valeur par defaut. |
| `ADMIN_PASSWORD` | Le compte de demarrage porte sinon un mot de passe public. |
| `SEED_DEMO` | A mettre a `false` : sinon la base se remplit de ventes fictives. |

Le formulaire de connexion ne pre-remplit plus aucun identifiant.

## Qualite

```bash
make test        # tests Go + construction du frontend
npm run lint     # ESLint
npm run typecheck
```

Les regles qui protegent l'argent — survente, retour plafonne, coffre sans
decouvert, tiroir-caisse — vivent dans des transactions PostgreSQL. Aucun
simulacre ne reproduit un verrou de ligne : elles sont donc verifiees contre
une vraie base, qui doit etre jetable.

```bash
createdb senvalise_test
TEST_DATABASE_URL="postgres://senvalise:MOTDEPASSE@127.0.0.1:5432/senvalise_test?sslmode=disable" \
  go test ./internal/... -race
```

Sans `TEST_DATABASE_URL` ces tests s'ignorent, pour qu'un `go test ./...` reste
possible sans base. L'integration continue, elle, monte toujours un PostgreSQL :
un test ignore en silence n'y serait qu'un mensonge.

Le test de concurrence a ete verifie par mutation — les deux verrous retires,
il doit echouer en annoncant « 2 ventes acceptees sur un stock de 1 ». Un test
qui passe dans les deux cas ne prouve rien.

## Exploitation

```bash
./deploy/deploy.sh              # teste, construit, deploie, verifie
./deploy/deploy.sh --rollback   # remet la version precedente
```

Le script conserve le binaire precedent et revient dessus tout seul si le
service ne repond pas apres redemarrage.

| Tache | Ou | Cadence |
| --- | --- | --- |
| Sauvegarde base + televersements | `/usr/local/bin/senvalise-backup` → `/var/backups/senvalise` | quotidienne, 2 h 30 |
| Controle de sante | `/usr/local/bin/senvalise-watch` | toutes les 10 min |
| Renouvellement TLS | `certbot.timer` | deux fois par jour |

Le controle verifie les services, la sante de l'API, l'etat de la session
WhatsApp, la file d'envoi, le disque, l'age de la derniere sauvegarde et
l'echeance du certificat. Il journalise (`journalctl -t senvalise-watch`) et,
si `WATCH_ALERT_TO` porte un numero, alerte par WhatsApp. Les deux, parce que
la passerelle est parfois la panne elle-meme.

Restaurer une sauvegarde :

```bash
sudo -u postgres createdb senvalise_restore
sudo -u postgres pg_restore -d senvalise_restore --no-owner /var/backups/senvalise/db-AAAAMMJJ-HHMMSS.dump
```

## Referencement

Chaque produit a son adresse, `/p/<reference>`, servie par l'API : elle reecrit
le `<head>` avec le nom, le prix et la photo du modele, pose un bloc JSON-LD
`Product` et un contenu lisible sans JavaScript. `sitemap.xml` et `robots.txt`
sont calcules depuis le catalogue — une valise mise en ligne y figure sans que
personne y pense. L'ancienne forme `produit.html?ref=…` redirige en 301.

Les images sont servies en WebP quand le navigateur l'accepte, par negociation
nginx sur l'en-tete `Accept` : le balisage n'a pas a le savoir. Le script de
deploiement fabrique les jumeaux `.webp` manquants.

## Regles metier appliquees cote serveur

Ces points ne sont pas negociables par le client, et ce sont ceux qui protegent
le stock et la caisse :

- le stock se verrouille avant toute ecriture, par identifiant croissant, ce
  qui interdit a la fois la survente et l'interblocage entre deux caisses ;
- un retour est verifie contre sa facture d'origine — article present,
  quantite disponible retours anterieurs deduits, remboursement plafonne au
  montant reellement encaisse — et s'inscrit en reglement negatif ;
- la conversion d'un devis en facture sort la marchandise du stock, comme
  l'encaissement au comptoir ;
- les references de document viennent d'une sequence PostgreSQL ;
- la reception d'un arrivage convertit le prix d'achat au taux saisi et
  ventile transport, douane et frais divers au prorata de la valeur des lignes ;
- les encaissements et remboursements en especes alimentent la session de
  caisse ouverte, ce qui rend l'ecart de caisse constatable a la cloture ;
- les erreurs PostgreSQL ne sortent jamais telles quelles : elles sont
  journalisees cote serveur et traduites en message metier.
