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
