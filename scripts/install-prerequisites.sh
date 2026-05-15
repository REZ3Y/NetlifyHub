#!/usr/bin/env bash
#
# NetlifyHub — detect and install prerequisites for scripts/install.sh.
# Sourced by install scripts; do not run directly unless debugging.
#
set -euo pipefail

NETLIFYHUB_NODE_MAJOR_MIN="${NETLIFYHUB_NODE_MAJOR_MIN:-22}"
NETLIFYHUB_PNPM_VERSION="${NETLIFYHUB_PNPM_VERSION:-9.14.2}"
NETLIFYHUB_FNM_VERSION="${NETLIFYHUB_FNM_VERSION:-1.38.1}"

_log() { echo "[NetlifyHub] $*"; }
_log_info() { _log "$*"; }
_log_warn() { _log "WARNING: $*"; }
_log_err() { _log "ERROR: $*" >&2; }

_command_exists() {
  command -v "$1" >/dev/null 2>&1
}

_port_open() {
  local port="$1"
  if _command_exists nc; then
    nc -z 127.0.0.1 "$port" >/dev/null 2>&1
    return $?
  fi
  (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
}

_node_major() {
  if ! _command_exists node; then
    echo 0
    return
  fi
  node -p "parseInt(process.versions.node.split('.')[0], 10)" 2>/dev/null || echo 0
}

_run_as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif _command_exists sudo; then
    sudo -n "$@" 2>/dev/null || sudo "$@"
  else
    return 1
  fi
}

_ensure_curl() {
  if _command_exists curl; then
    return 0
  fi
  _log_info "Installing curl..."
  if _command_exists apt-get; then
    _run_as_root apt-get update -qq
    _run_as_root apt-get install -y curl
  elif _command_exists dnf; then
    _run_as_root dnf install -y curl
  elif _command_exists yum; then
    _run_as_root yum install -y curl
  elif _command_exists brew; then
    brew install curl
  elif _command_exists pacman; then
    _run_as_root pacman -S --noconfirm curl
  else
    _log_err "curl is required. Install curl and retry."
    exit 1
  fi
}

_ensure_git() {
  if _command_exists git; then
    _log_info "git $(git --version | head -1) OK"
    return 0
  fi
  _log_info "Installing git..."
  if _command_exists apt-get; then
    _run_as_root apt-get update -qq
    _run_as_root apt-get install -y git
  elif _command_exists dnf; then
    _run_as_root dnf install -y git
  elif _command_exists yum; then
    _run_as_root yum install -y git
  elif _command_exists brew; then
    brew install git
  elif _command_exists pacman; then
    _run_as_root pacman -S --noconfirm git
  else
    _log_err "git is required. Install git and retry."
    exit 1
  fi
}

_load_fnm() {
  export FNM_DIR="${FNM_DIR:-$HOME/.local/share/fnm}"
  export FNM_MULTISHELL_PATH="${FNM_MULTISHELL_PATH:-$FNM_DIR/current}"
  export PATH="$FNM_DIR:$FNM_MULTISHELL_PATH/bin:$PATH"
  if [[ -x "$FNM_DIR/fnm" ]]; then
    eval "$("$FNM_DIR/fnm" env --shell bash)"
    return 0
  fi
  if _command_exists fnm; then
    eval "$(fnm env --shell bash)"
    return 0
  fi
  return 1
}

_install_fnm() {
  local arch zip_name
  arch="$(uname -m)"
  case "$arch" in
    x86_64 | amd64) zip_name="fnm-linux.zip" ;;
    aarch64 | arm64) zip_name="fnm-arm64.zip" ;;
    *)
      _log_warn "Unsupported CPU architecture for fnm: $arch"
      return 1
      ;;
  esac

  _log_info "Installing fnm (Fast Node Manager) to \$HOME/.local/share/fnm ..."
  curl -fsSL "https://github.com/Schniz/fnm/releases/download/v${NETLIFYHUB_FNM_VERSION}/${zip_name}" -o /tmp/fnm.zip
  mkdir -p "$HOME/.local/share/fnm"
  if ! _command_exists unzip; then
    if _command_exists apt-get; then
      _run_as_root apt-get install -y unzip
    else
      _log_err "unzip is required to install fnm. Install unzip and retry."
      exit 1
    fi
  fi
  unzip -o /tmp/fnm.zip -d "$HOME/.local/share/fnm" >/dev/null
  chmod +x "$HOME/.local/share/fnm/fnm" 2>/dev/null || true
  rm -f /tmp/fnm.zip
  _load_fnm || true
}

_install_fnm_macos() {
  _log_info "Installing fnm via Homebrew or install script..."
  if _command_exists brew; then
    brew install fnm
    _load_fnm
    return 0
  fi
  curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir "$HOME/.local/share/fnm" --skip-shell
  _load_fnm
}

_install_node_via_fnm() {
  local os
  os="$(uname -s)"
  if ! _load_fnm; then
    case "$os" in
      Darwin) _install_fnm_macos ;;
      Linux) _install_fnm ;;
      *)
        _log_warn "fnm auto-install not supported on $os"
        return 1
        ;;
    esac
  fi
  if ! _load_fnm; then
    return 1
  fi
  _log_info "Installing Node.js ${NETLIFYHUB_NODE_MAJOR_MIN} via fnm..."
  fnm install "${NETLIFYHUB_NODE_MAJOR_MIN}"
  fnm use "${NETLIFYHUB_NODE_MAJOR_MIN}"
  fnm default "${NETLIFYHUB_NODE_MAJOR_MIN}" 2>/dev/null || true
  hash -r 2>/dev/null || true
}

_install_node_via_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    _log_info "Installing nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh"
  _log_info "Installing Node.js ${NETLIFYHUB_NODE_MAJOR_MIN} via nvm..."
  nvm install "${NETLIFYHUB_NODE_MAJOR_MIN}"
  nvm use "${NETLIFYHUB_NODE_MAJOR_MIN}"
  hash -r 2>/dev/null || true
}

_install_node_via_package_manager() {
  if _command_exists brew; then
    _log_info "Installing Node.js via Homebrew..."
    brew install "node@${NETLIFYHUB_NODE_MAJOR_MIN}" || brew install node
    brew link --overwrite "node@${NETLIFYHUB_NODE_MAJOR_MIN}" 2>/dev/null || true
    return 0
  fi
  if _command_exists apt-get; then
    _log_info "Installing Node.js via NodeSource (requires sudo)..."
    curl -fsSL "https://deb.nodesource.com/setup_${NETLIFYHUB_NODE_MAJOR_MIN}.x" | _run_as_root bash -
    _run_as_root apt-get install -y nodejs
    return 0
  fi
  if _command_exists dnf; then
    _log_info "Installing Node.js via dnf (requires sudo)..."
    _run_as_root dnf install -y "nodejs" || _run_as_root dnf module install -y "nodejs:${NETLIFYHUB_NODE_MAJOR_MIN}"
    return 0
  fi
  return 1
}

_is_windows_shell() {
  case "$(uname -s 2>/dev/null || true)" in
    MINGW* | MSYS* | CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}

_ensure_node() {
  if _is_windows_shell && ! _command_exists node; then
    _log_err "On Windows, install Node.js ${NETLIFYHUB_NODE_MAJOR_MIN}+ from https://nodejs.org/"
    _log_err "Enable corepack in an admin terminal: corepack enable"
    _log_err "Then re-run: bash install.sh"
    exit 1
  fi

  local major
  major="$(_node_major)"
  if [[ "$major" -ge "$NETLIFYHUB_NODE_MAJOR_MIN" ]]; then
    _log_info "Node.js $(node -v) OK"
    return 0
  fi

  if [[ "$major" -gt 0 ]]; then
    _log_warn "Node.js $(node -v) is older than v${NETLIFYHUB_NODE_MAJOR_MIN}; installing a newer version..."
  else
    _log_info "Node.js not found; installing v${NETLIFYHUB_NODE_MAJOR_MIN}+ ..."
  fi

  _install_node_via_fnm \
    || _install_node_via_nvm \
    || _install_node_via_package_manager \
    || {
      _log_err "Could not install Node.js ${NETLIFYHUB_NODE_MAJOR_MIN}+."
      _log_err "Install manually from https://nodejs.org/ then re-run the installer."
      exit 1
    }

  major="$(_node_major)"
  if [[ "$major" -lt "$NETLIFYHUB_NODE_MAJOR_MIN" ]]; then
    _log_err "Node.js $(node -v 2>/dev/null || echo unknown) is still below v${NETLIFYHUB_NODE_MAJOR_MIN}."
    exit 1
  fi
  _log_info "Node.js $(node -v) ready"
}

_ensure_pnpm() {
  if _command_exists pnpm; then
    _log_info "pnpm $(pnpm -v) OK"
    return 0
  fi

  _ensure_node

  _log_info "Installing pnpm ${NETLIFYHUB_PNPM_VERSION} via corepack..."
  if ! _command_exists corepack; then
    _log_err "corepack is missing (it ships with Node.js 16.13+). Reinstall Node.js ${NETLIFYHUB_NODE_MAJOR_MIN}+."
    exit 1
  fi
  corepack enable
  corepack prepare "pnpm@${NETLIFYHUB_PNPM_VERSION}" --activate
  hash -r 2>/dev/null || true

  if ! _command_exists pnpm; then
    _log_info "Activating pnpm via npm..."
    npm install -g "pnpm@${NETLIFYHUB_PNPM_VERSION}"
    hash -r 2>/dev/null || true
  fi

  if ! _command_exists pnpm; then
    _log_err "pnpm installation failed."
    exit 1
  fi
  _log_info "pnpm $(pnpm -v) ready"
}

_docker_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
    return 0
  fi
  if _command_exists docker-compose; then
    echo "docker-compose"
    return 0
  fi
  return 1
}

_postgres_port_open() {
  if _port_open 5433; then
    echo 5433
    return 0
  fi
  if _port_open 5432; then
    echo 5432
    return 0
  fi
  return 1
}

_patch_env_database_url() {
  local port="$1"
  local root="${NETLIFYHUB_INSTALL_ROOT:-$(pwd)}"
  local env_file="${root}/.env"
  local url="postgresql://netlifyhub:netlifyhub@localhost:${port}/netlifyhub?schema=public"

  if [[ ! -f "$env_file" ]]; then
    return 1
  fi

  if grep -q '^DATABASE_URL=' "$env_file"; then
    if sed --version 2>/dev/null | grep -q GNU; then
      sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${url}|" "$env_file"
    else
      sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=${url}|" "$env_file" 2>/dev/null \
        || sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${url}|" "$env_file"
    fi
  else
    printf '\nDATABASE_URL=%s\n' "$url" >>"$env_file"
  fi
  _log_info "DATABASE_URL set to localhost:${port} in .env"
}

_ensure_postgres_role_and_db() {
  local pg_user=netlifyhub
  local pg_pass=netlifyhub
  local pg_db=netlifyhub

  if ! _command_exists psql && _command_exists sudo; then
    if sudo -u postgres psql -tAc "SELECT 1" >/dev/null 2>&1; then
      :
    else
      _log_err "Cannot run psql as postgres user."
      return 1
    fi
  fi

  run_psql() {
    if [[ "$(id -u)" -eq 0 ]]; then
      su - postgres -c "psql $*"
    else
      sudo -u postgres psql "$@"
    fi
  }

  if ! run_psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${pg_user}'" | grep -q 1; then
    run_psql -c "CREATE USER ${pg_user} WITH PASSWORD '${pg_pass}';"
  fi
  if ! run_psql -tAc "SELECT 1 FROM pg_database WHERE datname='${pg_db}'" | grep -q 1; then
    run_psql -c "CREATE DATABASE ${pg_db} OWNER ${pg_user};"
  fi
  run_psql -d "${pg_db}" -c "GRANT ALL ON SCHEMA public TO ${pg_user};" >/dev/null 2>&1 || true
}

_start_systemd_service() {
  local unit="$1"
  if _command_exists systemctl; then
    _run_as_root systemctl enable --now "$unit" 2>/dev/null || true
  fi
  if _command_exists service; then
    _run_as_root service "$unit" start 2>/dev/null || true
  fi
}

_ensure_native_postgres_redis() {
  if [[ "${NETLIFYHUB_SKIP_NATIVE_DB:-}" == "1" ]]; then
    return 1
  fi
  if [[ "$(uname -s)" != "Linux" ]]; then
    return 1
  fi

  _log_info "Installing PostgreSQL and Redis with the system package manager (no Docker)..."

  if _command_exists apt-get; then
    _run_as_root apt-get update -qq
    DEBIAN_FRONTEND=noninteractive _run_as_root apt-get install -y postgresql postgresql-contrib redis-server
    _start_systemd_service postgresql
    _start_systemd_service redis-server
  elif _command_exists dnf; then
    _run_as_root dnf install -y postgresql-server postgresql redis
    if _command_exists postgresql-setup; then
      _run_as_root postgresql-setup --initdb 2>/dev/null || true
    fi
    _start_systemd_service postgresql
    _start_systemd_service redis
  elif _command_exists yum; then
    _run_as_root yum install -y postgresql-server postgresql redis
    if _command_exists postgresql-setup; then
      _run_as_root postgresql-setup initdb 2>/dev/null || true
    fi
    _start_systemd_service postgresql
    _start_systemd_service redis
  else
    return 1
  fi

  sleep 2
  _ensure_postgres_role_and_db || return 1
  _patch_env_database_url 5432
  return 0
}

_wait_for_datastores() {
  local i pg_port
  for i in $(seq 1 45); do
    pg_port="$(_postgres_port_open)" || true
    if [[ -n "${pg_port:-}" ]] && _port_open 6379; then
      _patch_env_database_url "$pg_port"
      _log_info "PostgreSQL (:${pg_port}) and Redis (:6379) are ready."
      return 0
    fi
    sleep 2
  done
  return 1
}

_ensure_docker_datastores() {
  local root="${NETLIFYHUB_INSTALL_ROOT:-$(pwd)}"
  local compose_file="${root}/docker-compose.local.example.yml"
  local compose

  if ! compose="$(_docker_compose_cmd)"; then
    return 1
  fi
  if [[ ! -f "$compose_file" ]]; then
    return 1
  fi

  _log_info "Starting PostgreSQL and Redis with Docker..."
  (cd "$root" && $compose -f docker-compose.local.example.yml up -d)
  _patch_env_database_url 5433
  _wait_for_datastores
}

# Call after repo-root `.env` exists (install.sh creates it first).
netlifyhub_ensure_datastores() {
  if [[ "${NETLIFYHUB_SKIP_DATASTORES:-}" == "1" ]]; then
    _log_info "Skipping datastore setup (NETLIFYHUB_SKIP_DATASTORES=1)."
    return 0
  fi

  local pg_port
  pg_port="$(_postgres_port_open)" || true
  if [[ -n "${pg_port:-}" ]] && _port_open 6379; then
    _patch_env_database_url "$pg_port"
    _log_info "PostgreSQL (:${pg_port}) and Redis (:6379) already reachable."
    return 0
  fi

  if [[ "${NETLIFYHUB_SKIP_DOCKER:-}" != "1" ]] && _command_exists docker; then
    if _ensure_docker_datastores; then
      return 0
    fi
    _log_warn "Docker Compose did not start Postgres/Redis in time; trying native install..."
  fi

  if _ensure_native_postgres_redis && _wait_for_datastores; then
    return 0
  fi

  _log_err "PostgreSQL and Redis are required but not reachable."
  _log_err "Options:"
  _log_err "  1) Install Docker, then re-run the installer"
  _log_err "  2) apt install postgresql redis-server (Debian/Ubuntu) and re-run"
  _log_err "  3) Start your own Postgres/Redis and set DATABASE_URL + REDIS_URL in .env"
  exit 1
}

# Public entry — call from install.sh (after cd to repo root).
netlifyhub_install_prerequisites() {
  local mode="${1:-full}"

  _log_info "Checking prerequisites..."

  if [[ "$mode" == "bootstrap" ]]; then
    _ensure_curl
    _ensure_git
    return 0
  fi

  _ensure_curl
  _ensure_node
  _ensure_pnpm
}
