#!/usr/bin/env bash
# Deploiement de SenValise sur le serveur, en natif.
#
# Le deploiement tenait en six commandes tapees de memoire. Une oubliee — les
# droits, le rechargement du service — et le site partait a moitie mis a jour,
# sans moyen simple de revenir en arriere. Ce script fait la sequence complete,
# verifie que le site repond apres coup, et remet la version precedente si ce
# n'est pas le cas.
#
#   ./deploy/deploy.sh            construit, teste, deploie, verifie
#   ./deploy/deploy.sh --rollback remet la version precedente
#   ./deploy/deploy.sh --no-test  saute les tests (correctif urgent)
#
# A lancer depuis la racine du depot, par un utilisateur qui a sudo.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TARGET=/srv/senvalise
BIN="$TARGET/bin/senvalise"
PREVIOUS="$TARGET/bin/senvalise.previous"
HEALTH=http://127.0.0.1:8080/health

step() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# health interroge l'API en boucle courte : un binaire qui vient de demarrer
# met une seconde ou deux a ouvrir son port, et echouer sur la premiere
# tentative declencherait un retour arriere inutile.
health() {
  for _ in $(seq 1 15); do
    if curl -fsS --max-time 3 "$HEALTH" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

rollback() {
  step "Retour a la version precedente"
  [ -f "$PREVIOUS" ] || die "aucune version precedente conservee"
  sudo cp -a "$PREVIOUS" "$BIN"
  sudo systemctl restart senvalise
  health || die "la version precedente ne repond pas non plus — voir: journalctl -u senvalise -n 50"
  echo "✓ version precedente restauree et fonctionnelle"
}

if [ "${1:-}" = "--rollback" ]; then rollback; exit 0; fi

cd "$ROOT"

if [ "${1:-}" != "--no-test" ]; then
  step "Tests et controles"
  go vet ./cmd/... ./internal/... || die "go vet a echoue"
  go test ./... >/dev/null || die "les tests Go echouent — rien n'est deploye"
  npm run typecheck --silent || die "le typage TypeScript echoue"
  npm run lint --silent || die "ESLint echoue"
  echo "✓ tests verts"
fi

step "Construction"
go build -trimpath -ldflags="-s -w" -o /tmp/senvalise-build ./cmd/server || die "compilation Go"
npm run build --silent || die "construction du frontend"
echo "✓ binaire et interface construits"

step "Installation"
# L'ancien binaire est garde avant d'etre ecrase : c'est tout le filet du
# retour arriere, et il ne coute que quinze megaoctets.
[ -f "$BIN" ] && sudo cp -a "$BIN" "$PREVIOUS"
sudo install -m755 /tmp/senvalise-build "$BIN"
sudo rsync -a --delete dist/ "$TARGET/web/"
sudo rsync -a --delete --exclude .gitignore --exclude README.md site/ "$TARGET/site/"

# Les images WebP servies par nginx sont construites ici : elles ne sont pas
# dans le depot, et une image ajoutee sans son jumeau serait servie en JPEG
# sans que personne le remarque.
if command -v cwebp >/dev/null; then
  for image in "$TARGET"/site/assets/img/*.jpg "$TARGET"/site/assets/img/*.png; do
    [ -e "$image" ] || continue
    [ -e "$image.webp" ] && [ "$image.webp" -nt "$image" ] && continue
    sudo cwebp -quiet -q 82 -m 6 "$image" -o "$image.webp"
  done
fi

sudo chown -R senvalise:senvalise "$TARGET"
sudo find "$TARGET/web" "$TARGET/site" -type d -exec chmod 755 {} + -o -type f -exec chmod 644 {} +
echo "✓ fichiers en place"

step "Redemarrage"
sudo systemctl restart senvalise
if ! health; then
  printf '\033[31m✗ le service ne repond pas apres le redemarrage\033[0m\n'
  sudo journalctl -u senvalise -n 20 --no-pager
  rollback
  exit 1
fi
sudo nginx -t >/dev/null 2>&1 && sudo systemctl reload nginx

step "Verification publique"
for url in https://senvalise.online/ https://gestion.senvalise.online/ https://senvalise.online/sitemap.xml; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || echo 000)
  printf '  %-46s %s\n' "$url" "$code"
  [ "$code" = "200" ] || die "$url repond $code"
done

printf '\n\033[32m✓ deploiement termine\033[0m — retour arriere possible avec : ./deploy/deploy.sh --rollback\n'
