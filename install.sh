#!/usr/bin/env bash
#
# NovaSwarm — egy-parancsos telepítő (5.1. pont)
#
# Használat:
#   curl -fsSL https://raw.githubusercontent.com/ngabika/NovaSwarm/main/install.sh | bash
#   vagy lokálisan: ./install.sh [--port 4317] [--install-dir ~/novaswarm] [--repo <git-url>]
#
# A script SZÁNDÉKOSAN minimális interakciót kér a terminálban — minden
# további, érdemi beállítás (API kulcsok, Telegram, felhasználói profil,
# első ágens) a telepítés végén megnyíló böngészős Setup Wizard-ba kerül.

set -euo pipefail

NOVASWARM_REPO_URL="${NOVASWARM_REPO_URL:-https://github.com/ngabika/NovaSwarmNewGen.git}"
INSTALL_DIR="${NOVASWARM_INSTALL_DIR:-$HOME/novaswarm}"
PORT="${NOVASWARM_PORT:-4317}"
SERVICE_NAME="novaswarm"
REQUIRED_NODE_MAJOR=20

log()  { echo -e "\033[1;32m[novaswarm]\033[0m $1"; }
warn() { echo -e "\033[1;33m[novaswarm][figyelem]\033[0m $1"; }
err()  { echo -e "\033[1;31m[novaswarm][hiba]\033[0m $1" >&2; }

# ------------------------------------------------------------------
# 0. Argumentumok (a technikailag elengedhetetlen minimumra szorítva)
# ------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    --repo) NOVASWARM_REPO_URL="$2"; shift 2 ;;
    -h|--help)
      echo "Használat: $0 [--port PORT] [--install-dir DIR] [--repo GIT_URL]"
      exit 0
      ;;
    *) err "Ismeretlen kapcsoló: $1"; exit 1 ;;
  esac
done

SUDO=""
if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    err "Ez a script root jogosultságot (vagy sudo-t) igényel a systemd szolgáltatás és a rendszer-függőségek telepítéséhez."
    exit 1
  fi
fi

# ------------------------------------------------------------------
# 1. Rendszer-függőségek
# ------------------------------------------------------------------
install_system_dependencies() {
  log "Rendszer-függőségek ellenőrzése..."
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update -y
    $SUDO apt-get install -y curl git build-essential python3 espeak-ng pciutils
  elif command -v dnf >/dev/null 2>&1; then
    $SUDO dnf install -y curl git gcc-c++ make python3 espeak-ng pciutils
  elif command -v pacman >/dev/null 2>&1; then
    $SUDO pacman -Sy --noconfirm curl git base-devel python espeak-ng pciutils
  else
    warn "Nem ismert fel támogatott csomagkezelőt (apt/dnf/pacman) — telepítsd kézzel: curl, git, build-essential/gcc+make, python3, espeak-ng, pciutils."
  fi
}

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    local current_major
    current_major="$(node -v | sed 's/^v//' | cut -d. -f1)"
    if [[ "$current_major" -ge "$REQUIRED_NODE_MAJOR" ]]; then
      log "Node.js már telepítve van ($(node -v))."
      return
    fi
    warn "A telepített Node.js verzió ($(node -v)) régebbi, mint a szükséges v${REQUIRED_NODE_MAJOR}.x — frissítés."
  fi

  if command -v apt-get >/dev/null 2>&1; then
    log "Node.js telepítése (NodeSource, v${REQUIRED_NODE_MAJOR}.x)..."
    curl -fsSL "https://deb.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x" | $SUDO bash -
    $SUDO apt-get install -y nodejs
  else
    err "Nem sikerült automatikusan telepíteni a Node.js-t ezen a disztribúción — telepítsd kézzel a v${REQUIRED_NODE_MAJOR}.x-et, majd futtasd újra ezt a scriptet."
    exit 1
  fi
}

# ------------------------------------------------------------------
# 2. Hardver-vizsgálat és Ollama-modell ajánlás (5.1. pont)
# ------------------------------------------------------------------
RECOMMENDED_MODEL=""

detect_hardware_and_recommend_model() {
  local cpu_cores ram_mb has_dedicated_gpu="false"
  cpu_cores="$(nproc)"
  ram_mb="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"

  if command -v lspci >/dev/null 2>&1; then
    if lspci 2>/dev/null | grep -Ei 'vga|3d controller|display controller' | grep -Eiv 'intel' >/dev/null 2>&1; then
      has_dedicated_gpu="true"
    fi
  fi

  log "Észlelt hardver — CPU magok: ${cpu_cores}, RAM: ${ram_mb} MB, dedikált GPU: ${has_dedicated_gpu}"

  if [[ "$ram_mb" -lt 4096 || "$cpu_cores" -le 2 ]]; then
    RECOMMENDED_MODEL="qwen2.5:1.5b"
  elif [[ "$ram_mb" -lt 8192 ]]; then
    RECOMMENDED_MODEL="llama3.2:3b"
  elif [[ "$has_dedicated_gpu" == "true" || "$ram_mb" -ge 16384 ]]; then
    RECOMMENDED_MODEL="llama3.1:8b"
  else
    RECOMMENDED_MODEL="qwen2.5:7b"
  fi

  log "Ajánlott lokális Ollama-modell ehhez a géphez: ${RECOMMENDED_MODEL}"
}

install_ollama_and_model() {
  if ! command -v ollama >/dev/null 2>&1; then
    log "Ollama telepítése..."
    curl -fsSL https://ollama.com/install.sh | sh
  else
    log "Ollama már telepítve van."
  fi

  log "Ajánlott modell letöltése: ${RECOMMENDED_MODEL} (ez eltarthat néhány percig)..."
  if ! ollama pull "$RECOMMENDED_MODEL"; then
    warn "A modell letöltése most nem sikerült — később manuálisan futtatható: ollama pull ${RECOMMENDED_MODEL}"
  fi
}

# ------------------------------------------------------------------
# 3. Repo letöltése + build
# ------------------------------------------------------------------
clone_or_update_repo() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    log "Meglévő telepítés észlelve, frissítés: $INSTALL_DIR"
    (cd "$INSTALL_DIR" && git pull --ff-only)
  else
    log "NovaSwarm letöltése ide: $INSTALL_DIR"
    git clone "$NOVASWARM_REPO_URL" "$INSTALL_DIR"
  fi
}

install_node_dependencies_and_build() {
  log "NPM-függőségek telepítése és teljes build (backend + frontend)..."
  (
    cd "$INSTALL_DIR"
    npm install
    npm run build
    npm run build:frontend
  )
}

# ------------------------------------------------------------------
# 4. systemd szolgáltatás (5.1. pont: induláskor automatikus start)
# ------------------------------------------------------------------
create_systemd_service() {
  log "systemd szolgáltatás létrehozása és engedélyezése..."
  local node_bin run_user
  node_bin="$(command -v node)"
  run_user="${SUDO_USER:-$USER}"

  $SUDO tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<EOF
[Unit]
Description=NovaSwarm — autonóm, önfejlesztő AI ágens-csapat
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${run_user}
WorkingDirectory=${INSTALL_DIR}
Environment=PORT=${PORT}
ExecStart=${node_bin} ${INSTALL_DIR}/dist/server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  $SUDO systemctl daemon-reload
  $SUDO systemctl enable "${SERVICE_NAME}"
  $SUDO systemctl restart "${SERVICE_NAME}"
}

open_browser() {
  local url="http://localhost:${PORT}"
  log "NovaSwarm elindult — Web UI: ${url}"
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 &
  else
    log "Nyisd meg manuálisan a böngészőben: ${url}"
  fi
}

main() {
  log "NovaSwarm telepítő indul..."
  install_system_dependencies
  ensure_node
  detect_hardware_and_recommend_model
  clone_or_update_repo
  install_node_dependencies_and_build
  install_ollama_and_model
  create_systemd_service
  open_browser
  log "Telepítés befejezve. A részletes beállítás (API kulcsok, Telegram, felhasználói profil, első ágens) a böngészőben megjelenő Setup Wizard-ban folytatódik (6. pont)."
}

main "$@"
