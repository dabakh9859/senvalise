#!/usr/bin/env bash
# Amorçage one-shot, joué par le service `setup` avant que app/vite/queue ne
# démarrent. Idempotent : relancer `docker compose up` ne réinstalle rien.
set -euo pipefail

cd /var/www/html

if [ ! -f .env ]; then
    echo "→ .env depuis .env.example"
    # .env.example porte un BOM UTF-8 ; il gêne le parseur .env de Docker Compose.
    sed '1s/^\xEF\xBB\xBF//' .env.example > .env
fi

if [ ! -d vendor ] || [ composer.lock -nt vendor/autoload.php ]; then
    echo "→ composer install"
    composer install --no-interaction --prefer-dist --no-progress
fi

if ! grep -qE '^APP_KEY=.+' .env; then
    echo "→ php artisan key:generate"
    php artisan key:generate --force
fi

FRESH_DB=0
if [ ! -f database/database.sqlite ]; then
    echo "→ création de database/database.sqlite"
    touch database/database.sqlite
    FRESH_DB=1
fi

echo "→ php artisan migrate"
php artisan migrate --force --graceful

if [ "$FRESH_DB" = "1" ]; then
    # Réglages, modèles de messages, zones de livraison et les deux comptes de
    # démarrage — sans ça, impossible de se connecter.
    echo "→ php artisan db:seed"
    php artisan db:seed --force

    if [ "${SEED_DEMO:-0}" = "1" ]; then
        echo "→ php artisan db:seed --class=DemoSeeder"
        php artisan db:seed --force --class=DemoSeeder
    fi
fi

if [ ! -e public/storage ]; then
    echo "→ php artisan storage:link"
    php artisan storage:link
fi

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
    echo "→ npm install"
    npm install --no-progress
fi

echo "✓ SenValise prêt."
