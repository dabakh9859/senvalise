# syntax=docker/dockerfile:1

# Image unique PHP + Node : les plugins Vite du projet (Wayfinder, Inertia)
# appellent `php artisan` pendant le build front, les deux runtimes doivent
# donc vivre dans le même conteneur.
FROM php:8.4-cli-bookworm

ARG UID=1000
ARG GID=1000
ARG NODE_MAJOR=22

ENV DEBIAN_FRONTEND=noninteractive \
    COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_MEMORY_LIMIT=-1 \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg git unzip procps \
        libzip-dev libicu-dev \
        libpng-dev libjpeg62-turbo-dev libwebp-dev libfreetype6-dev \
        sqlite3 libsqlite3-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp \
    && docker-php-ext-install -j"$(nproc)" bcmath exif gd intl pcntl zip pdo_sqlite \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

COPY docker/php.ini /usr/local/etc/php/conf.d/zz-senvalise.ini

# Un utilisateur au même UID que l'hôte : sans ça, vendor/ et node_modules/
# écrits dans le volume monté appartiendraient à root côté hôte.
RUN groupadd -g "${GID}" app || true \
    && useradd -u "${UID}" -g "${GID}" -m -s /bin/bash app \
    && mkdir -p /var/www/html \
    && chown "${UID}:${GID}" /var/www/html

WORKDIR /var/www/html
USER app
