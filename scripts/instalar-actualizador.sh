#!/bin/zsh
# Instala la tarea diaria de macOS que actualiza las fuentes bloqueadas desde el exterior.
set -euo pipefail
cd "$(dirname "$0")"
SCRIPT="$HOME/.mendoza-transparente-actualizador.sh"
LOG="$HOME/Library/Logs/mendoza-transparente-actualizador.log"
PLIST="$HOME/Library/LaunchAgents/so.mendozatransparente.actualizar.plist"

# Copia del script fuera del repo, para que launchd no dependa de una carpeta de trabajo.
cp actualizar-local.sh "$SCRIPT" && chmod +x "$SCRIPT"
mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
sed -e "s|__SCRIPT__|$SCRIPT|" -e "s|__LOG__|$LOG|g" so.mendozatransparente.actualizar.plist > "$PLIST"
launchctl bootout "gui/$(id -u)/so.mendozatransparente.actualizar" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Instalado. Corre todos los días a las 08:30 (o al despertar la Mac). Registro: $LOG"
