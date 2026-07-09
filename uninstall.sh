#!/usr/bin/env bash
#
# NovaSwarm — eltávolító script (5.2. pont)

set -euo pipefail

INSTALL_DIR="${NOVASWARM_INSTALL_DIR:-$HOME/novaswarm}"
SERVICE_NAME="novaswarm"

log() { echo -e "\033[1;32m[novaswarm]\033[0m $1"; }

if [[ -t 0 ]]; then
  read -rp "Készítsünk egy végső biztonsági mentést a memóriáról/kulcsokról törlés előtt? [I/n] " backup_answer
else
  backup_answer="i"
fi

if [[ "$backup_answer" =~ ^[IiYy]$ ]]; then
  backup_path="$HOME/novaswarm-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
  tar -czf "$backup_path" -C "$INSTALL_DIR" \
    --ignore-failed-read \
    memory-vault .env .config.json 2>/dev/null || true
  log "Biztonsági mentés elkészült: $backup_path"
fi

if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  sudo systemctl disable "$SERVICE_NAME" 2>/dev/null || true
  sudo rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  sudo systemctl daemon-reload
  log "systemd szolgáltatás leállítva és eltávolítva."
fi

if [[ -t 0 ]]; then
  read -rp "Töröljük a node_modules és a build-mappákat is (node_modules, dist, dist-frontend)? [I/n] " cleanup_answer
else
  cleanup_answer="n"
fi

if [[ "$cleanup_answer" =~ ^[IiYy]$ ]]; then
  rm -rf "$INSTALL_DIR/node_modules" "$INSTALL_DIR/dist" "$INSTALL_DIR/dist-frontend"
  log "Build-mappák törölve."
fi

log "NovaSwarm szolgáltatás eltávolítva. A projekt-mappa megmaradt itt: $INSTALL_DIR"
