#!/bin/zsh
# Actualiza desde esta Mac las fuentes que bloquean conexiones desde el exterior
# (el Boletín Oficial y el Senado de Mendoza no responden a los servidores de GitHub).
#
# Trabaja sobre una copia aparte del repo (~/.mendoza-transparente-actualizador), así nunca
# choca con lo que se esté editando en la copia de trabajo. Lo corre launchd todos los días
# (ver scripts/so.mendozatransparente.actualizar.plist); si la Mac estaba apagada o dormida,
# corre al despertarse.
#
# - Boletín Oficial: todos los días, últimos 7 días (por si hubo días sin correr).
# - Legislatura: si la última descarga tiene más de 30 días.

set -euo pipefail

REPO_URL="https://github.com/unllamas/mendoza-transparente.git"
DIR="$HOME/.mendoza-transparente-actualizador"
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "== $(date '+%F %T') actualización local"

if [[ ! -d "$DIR/.git" ]]; then
  git clone -q "$REPO_URL" "$DIR"
fi
cd "$DIR"
git fetch -q origin main
git reset -q --hard origin/main
bun install --frozen-lockfile >/dev/null

FALLAS=()
bun run scrape boletin-oficial --desde "$(date -v-7d +%F)" --hasta "$(date +%F)" || FALLAS+=(boletin-oficial)

ultima=$(tail -1 data/raw/legislatura/manifest.jsonl 2>/dev/null | sed -E 's/.*"fetched_at":"([0-9-]{10}).*/\1/' || echo "")
if [[ -z "$ultima" ]] || (( ( $(date +%s) - $(date -j -f %Y-%m-%d "$ultima" +%s) ) / 86400 > 30 )); then
  bun run scrape legislatura || FALLAS+=(legislatura)
fi

git add -A data
if git diff --cached --quiet; then
  echo "Sin datos nuevos."
else
  # Igual que en GitHub: solo se publica si la web compila con los datos nuevos.
  (cd apps/web && bun run data >/dev/null && bunx tsc --noEmit)
  git commit -q -m "Datos: actualización local (Boletín Oficial / Legislatura)" -m "$(date +%F)"
  git push -q origin HEAD:main
  echo "Publicado."
fi

if (( ${#FALLAS[@]} )); then
  echo "Fallaron: ${FALLAS[*]}"
  exit 1
fi
