#!/usr/bin/env bash
#
# NovaSwarm — frissítő script (5.2. pont)
#
# A Git repository legfrissebb állapotát húzza le és lefuttatja a szükséges
# build-lépéseket. NEM törli a tanult memóriát, beállításokat vagy
# ágens-konfigurációkat — a memory-vault/, .env és .config.json fájlok
# a .gitignore miatt sosem kerülnek felülírásra a git pull során.

set -euo pipefail

INSTALL_DIR="${NOVASWARM_INSTALL_DIR:-$HOME/novaswarm}"
SERVICE_NAME="novaswarm"

log()  { echo -e "\033[1;32m[novaswarm]\033[0m $1"; }
warn() { echo -e "\033[1;33m[novaswarm][figyelem]\033[0m $1"; }

if [[ ! -d "$INSTALL_DIR/.git" ]]; then
  echo "Nem található NovaSwarm-telepítés itt: $INSTALL_DIR" >&2
  exit 1
fi

cd "$INSTALL_DIR"

log "Legfrissebb verzió letöltése..."
git fetch origin
git merge --ff-only origin/main

log "Függőségek és build frissítése..."
npm install
npm run build
npm run build:frontend

# Nem-roncsoló adatmigrációs hook: a state-réteg induláskor automatikusan
# kiegészíti a meglévő, perzisztált JSON-állapotot az új mezőkkel (a hiányzó
# kulcsok az adott modul alapértékét kapják), a meglévő adatok elvesztése
# nélkül. Ebben a kiadásban (2.0.0, a redesign alapverziója) még nincs
# séma-migráció — ez a hook a JÖVŐBELI verzióváltásokhoz készült elő.

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q "^${SERVICE_NAME}.service"; then
  log "Szolgáltatás újraindítása..."
  sudo systemctl restart "$SERVICE_NAME"
else
  warn "Nem található '${SERVICE_NAME}' systemd szolgáltatás — indítsd el manuálisan, ha szükséges."
fi

log "Frissítés befejezve. A tanult memória, a beállítások és az ágens-konfigurációk megmaradtak."
