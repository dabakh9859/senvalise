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
