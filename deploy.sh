#!/usr/bin/env bash
# =============================================================================
# CafeFlow POS — Single Self-Contained Server Deploy Script
#
# Usage (fresh server — nothing installed):
#   bash <(curl -fsSL https://raw.githubusercontent.com/mk-manishkandel/cafeflow/main/deploy.sh)
#
# Usage (after cloning the repo):
#   git clone https://github.com/mk-manishkandel/cafeflow.git /opt/cafeflow
#   sudo bash /opt/cafeflow/deploy.sh
#
# Usage (from inside the repo):
#   sudo bash deploy.sh
#
# Non-interactive (CI/CD — export all vars before calling):
#   export POS_DOMAIN=pos.example.com TLS_MODE=proxy ...
#   sudo -E bash deploy.sh --non-interactive
#
# HTTPS is required (auth cookies are Secure). TLS_MODE=proxy when Cloudflare or
# another proxy terminates HTTPS in front of this server; TLS_MODE=certbot (with
# LETSENCRYPT_EMAIL) for a Let's Encrypt certificate on this server.
#
# Rebuild only (after code changes — skips full installer):
#   sudo bash deploy.sh --rebuild
#
# Supports: Ubuntu 20.04+, Debian 11+, CentOS/RHEL 8+, Rocky/AlmaLinux 8+
# Requires: Run as root (sudo)
# =============================================================================

set -euo pipefail

# Trap to clean up temp files on exit
TEMP_FILES=()
cleanup() {
    # Use length check — ${arr[@]:-} is scalar syntax and unreliable with set -u on empty arrays
    if [ "${#TEMP_FILES[@]}" -gt 0 ]; then
        rm -f "${TEMP_FILES[@]}" 2>/dev/null || true
    fi
}
trap cleanup EXIT

# =============================================================================
# GLOBALS — overridden by config collection / env vars
# =============================================================================
SCRIPT_DIR=""
APP_DIR=""
IN_REPO=false
NON_INTERACTIVE=false
# Allow env var override so CI/CD and curl|bash users can set their own repo URL
CAFEFLOW_REPO="${CAFEFLOW_REPO:-https://github.com/mk-manishkandel/cafeflow.git}"

# Collected config
POS_DOMAIN=""
DB_NAME="cafeflow"
DB_USER="cafeflow_user"
DB_PASSWORD=""
REDIS_PASSWORD=""
TZ="UTC"
JWT_SECRET=""
REFRESH_TOKEN_SECRET=""
DB_ENCRYPTION_SECRET=""
DB_ENCRYPTION_SALT=""
CORS_ORIGIN=""
REDIS_URL=""
# HTTPS is required: auth cookies are Secure in production, so over plain http
# the browser drops them and nobody can log in.
#   proxy   — HTTPS is terminated in front of this server (Cloudflare, tunnel,
#             load balancer); Nginx here listens on port 80 only.
#   certbot — obtain a Let's Encrypt certificate on this server.
TLS_MODE=""
LETSENCRYPT_EMAIL=""
# true when pos/.env already exists: its passwords and secrets are reused so a
# re-run never rotates credentials out from under the running app.
EXISTING_ENV=false
WEB_USER="www-data"
OS_ID=""
OS_VERSION=""

CREDS_FILE="/root/.cafeflow-credentials"
LOG_DIR="/var/log/cafeflow"

# =============================================================================
# COLOR OUTPUT
# =============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${BLUE}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
fatal()   { echo -e "${RED}[FATAL]${RESET} $*" >&2; exit 1; }
step()    { echo -e "\n${BOLD}${CYAN}══> $*${RESET}"; }
divider() { echo -e "${CYAN}────────────────────────────────────────────────────${RESET}"; }

# =============================================================================
# OS DETECTION
# =============================================================================
detect_os() {
    if [ -f /etc/os-release ]; then
        # shellcheck disable=SC1091
        . /etc/os-release
        OS_ID="${ID:-unknown}"
        OS_VERSION="${VERSION_ID:-unknown}"
    else
        fatal "Cannot detect OS — /etc/os-release not found."
    fi
}

is_debian_family() { [[ "${OS_ID}" =~ ^(ubuntu|debian|linuxmint|pop)$ ]]; }
is_rhel_family()   { [[ "${OS_ID}" =~ ^(centos|rhel|rocky|almalinux|fedora|ol)$ ]]; }

# =============================================================================
# PACKAGE MANAGEMENT
# =============================================================================
pkg_update() {
    info "Updating package lists..."
    if is_debian_family; then
        DEBIAN_FRONTEND=noninteractive apt-get update -y -qq
    elif is_rhel_family; then
        dnf check-update -y || true
    fi
}

pkg_install() {
    if is_debian_family; then
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@"
    elif is_rhel_family; then
        dnf install -y "$@"
    else
        fatal "Unsupported OS: ${OS_ID}."
    fi
}

# =============================================================================
# VALIDATION HELPERS
# =============================================================================
validate_identifier() {
    local value="$1" label="${2:-identifier}"
    [[ "${value}" =~ ^[a-zA-Z][a-zA-Z0-9_]{0,62}$ ]] \
        || fatal "${label} '${value}' invalid. Use letters, digits, underscores (start with a letter)."
}

validate_domain() {
    local d="$1"
    [[ "${d}" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$ ]]
}

validate_timezone() {
    # Gracefully skip validation if tzdata is not installed yet (Phase 2 installs it)
    [ -d "/usr/share/zoneinfo" ] || return 0
    [ -f "/usr/share/zoneinfo/${1}" ]
}

validate_email() { [[ "$1" =~ ^[^@]+@[^@]+\.[^@]+$ ]]; }

validate_directory_parent() {
    # Check that the parent of the given path exists (or can be created)
    local target="$1"
    local parent
    parent="$(dirname "${target}")"
    [ -d "${parent}" ] || mkdir -p "${parent}" 2>/dev/null \
        || fatal "Cannot create parent directory for ${target}: ${parent}"
}

# Escape special chars for use in sed replacement string
# env_get <env_file> <KEY> — prints the value of KEY (empty if missing)
env_get() {
    local line=""
    line=$(grep -m1 -E "^$2=" "$1" 2>/dev/null) || true
    printf '%s' "${line#*=}"
}

escape_sed_replacement() {
    printf '%s\n' "$1" | sed -e 's/[\/&]/\\&/g' -e 's/$/\\n/' | tr -d '\n' | sed 's/\\n$//'
}

# =============================================================================
# INTERACTIVE INPUT HELPERS
# =============================================================================
read_with_default() {
    local -n _var="$1"
    local prompt="$2"
    local default="${3:-}"
    local value
    if [ -n "${default}" ]; then
        read -rp "  ${prompt} [${default}]: " value
    else
        read -rp "  ${prompt}: " value
    fi
    _var="${value:-${default}}"
}

prompt_domain() {
    local -n _d="$1"
    local label="$2"
    local default="${3:-}"
    while true; do
        read_with_default _d "${label}" "${default}"
        [ -n "${_d}" ] || { warn "Domain cannot be empty."; continue; }
        validate_domain "${_d}" && break || warn "'${_d}' is not a valid domain. Example: pos.example.com"
    done
}

prompt_timezone() {
    local -n _tz="$1"
    local default="${2:-UTC}"
    while true; do
        read_with_default _tz "Timezone (IANA, e.g. America/New_York, UTC)" "${default}"
        validate_timezone "${_tz}" && break \
            || warn "Timezone '${_tz}' not found in /usr/share/zoneinfo/. See: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones"
    done
}

# =============================================================================
# PREREQUISITE CHECKS
# =============================================================================
require_root() {
    [ "$(id -u)" -eq 0 ] || fatal "This script must be run as root. Use: sudo bash $0"
}

check_disk_space() {
    local required_gb="${1:-20}" path="${2:-/var}"
    local avail
    avail=$(df -BG "${path}" 2>/dev/null | awk 'NR==2{gsub("G","");print $4}') || return 0
    [ -n "${avail}" ] && [ "${avail}" -lt "${required_gb}" ] \
        && warn "Low disk space: ${avail}GB at ${path} — ${required_gb}GB recommended."
    return 0
}

check_ram_mb() {
    local warn_below="${1:-2048}"
    local total
    total=$(awk '/MemTotal/{printf "%.0f",$2/1024}' /proc/meminfo 2>/dev/null) || return 0
    [ -n "${total}" ] && [ "${total}" -lt "${warn_below}" ] \
        && warn "Low RAM: ${total}MB detected — ${warn_below}MB recommended."
    return 0
}

check_node_version() {
    local min_major="${1:-20}"
    command -v node &>/dev/null || return 1
    local ver
    ver=$(node -e "process.stdout.write(process.version)" 2>/dev/null) || return 1
    [[ "${ver}" =~ ^v([0-9]+) ]] || return 1
    [ "${BASH_REMATCH[1]}" -ge "${min_major}" ]
}

check_postgres_running() {
    # Check all known service name variants: apt generic, PGDG versioned (RHEL),
    # and PGDG instance-style (Ubuntu/Debian @version-cluster)
    local svc
    for svc in postgresql postgresql-14 postgresql-15 postgresql-16 \
                "postgresql@14-main" "postgresql@15-main" "postgresql@16-main"; do
        systemctl is-active --quiet "${svc}" 2>/dev/null && return 0
    done
    fatal "PostgreSQL is not running. Start it with: systemctl start postgresql"
}

# =============================================================================
# SECRET GENERATION
# =============================================================================
generate_secret() {
    openssl rand -base64 48 | tr -d '\n/+'
}

# =============================================================================
# POSTGRESQL HELPERS
# Safe: identifiers pre-validated; passwords via .pgpass (never in env/proc list)
# =============================================================================
write_pgpass() {
    local host="$1" port="$2" db="$3" user="$4" password="$5" file="$6"
    local escaped
    escaped=$(printf '%s' "${password}" | sed 's/\\/\\\\/g; s/:/\\:/g')
    printf '%s:%s:%s:%s:%s\n' "${host}" "${port}" "${db}" "${user}" "${escaped}" >> "${file}"
    chmod 600 "${file}"
}

postgres_user_exists() {
    local u="$1"
    local r
    # psql only interpolates :'var' in stdin/-f input, not in -c strings.
    r=$(echo "SELECT 1 FROM pg_roles WHERE rolname = :'n'" \
        | sudo -u postgres psql -X -tA -v "n=${u}" 2>/dev/null) || return 1
    [ "${r}" = "1" ]
}

postgres_db_exists() {
    local d="$1"
    local r
    r=$(echo "SELECT 1 FROM pg_database WHERE datname = :'n'" \
        | sudo -u postgres psql -X -tA -v "n=${d}" 2>/dev/null) || return 1
    [ "${r}" = "1" ]
}

postgres_table_exists() {
    local db="$1" user="$2" password="$3" table="$4"
    local pgpass r
    pgpass=$(mktemp); TEMP_FILES+=("${pgpass}"); chmod 600 "${pgpass}"
    write_pgpass "localhost" "5432" "${db}" "${user}" "${password}" "${pgpass}"
    r=$(echo "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = :'n'" \
        | PGPASSFILE="${pgpass}" psql -X -U "${user}" -h localhost -d "${db}" -tA \
            -v "n=${table}" 2>/dev/null) || return 1
    [ "${r}" = "1" ]
}

# apply_schema <db> <user> <password> <schema_file>
# Applies pos/server/schema.sql as the application role, in one transaction.
# The file is idempotent: it creates what is missing on a fresh database and
# brings an existing one up to date, so it is safe to run on every deploy.
apply_schema() {
    local db="$1" user="$2" password="$3" schema_file="$4"
    local pgpass
    [ -f "${schema_file}" ] || fatal "Schema file not found: ${schema_file}"
    pgpass=$(mktemp); TEMP_FILES+=("${pgpass}"); chmod 600 "${pgpass}"
    write_pgpass "localhost" "5432" "${db}" "${user}" "${password}" "${pgpass}"
    PGPASSFILE="${pgpass}" psql -X -q -v ON_ERROR_STOP=1 --single-transaction \
        -U "${user}" -h localhost -d "${db}" -f "${schema_file}"
}

# backup_existing_db <db> <user> <password>
# pg_dump of an existing database before the schema is re-applied to it.
#
# Dumps as the postgres superuser: the app role cannot pg_dump tables with
# FORCE ROW LEVEL SECURITY, so an app-role dump always fails. <user> and
# <password> are accepted for call-site compatibility but unused.
backup_existing_db() {
    local db="$1"
    local backup_dir="/var/backups/cafeflow" backup_file
    backup_file="${backup_dir}/pre-schema_$(date +%Y%m%d_%H%M%S).sql.gz"
    mkdir -p "${backup_dir}"
    info "Backing up existing database '${db}' → ${backup_file}..."
    if runuser -u postgres -- pg_dump "${db}" | gzip > "${backup_file}"; then
        chmod 600 "${backup_file}"
        success "Database backup complete: ${backup_file}"
    else
        rm -f "${backup_file}"
        fatal "Backup of '${db}' failed — refusing to re-apply the schema without one."
    fi
}

# =============================================================================
# NPM HELPER — streams output, fails loudly
# =============================================================================
run_npm() {
    local label="$1"; shift
    local logfile
    logfile=$(mktemp /tmp/cafeflow-npm-XXXXXX.log); TEMP_FILES+=("${logfile}")
    info "${label}..."
    if ! npm "$@" 2>&1 | tee "${logfile}"; then
        error "${label} failed. Full output:"
        cat "${logfile}" >&2
        fatal "${label} failed."
    fi
    success "${label} done."
}

# =============================================================================
# HEALTH CHECK HELPER
# =============================================================================
wait_for_health() {
    local url="$1" max="${2:-12}" sleep_sec="${3:-5}"
    for ((i=1; i<=max; i++)); do
        local resp
        resp=$(curl -sf --max-time 5 "${url}" 2>/dev/null) || true
        echo "${resp}" | grep -q '"status"' && return 0
        info "Health check ${i}/${max} — waiting ${sleep_sec}s..."
        sleep "${sleep_sec}"
    done
    return 1
}

# =============================================================================
# DETECT WEB USER
# =============================================================================
detect_web_user() {
    WEB_USER=""
    for u in www-data nginx apache; do
        id "${u}" &>/dev/null && WEB_USER="${u}" && return 0
    done
    warn "No standard web user found. Creating www-data..."
    useradd --system --no-create-home --shell /usr/sbin/nologin www-data 2>/dev/null || true
    WEB_USER="www-data"
}

# =============================================================================
# DETECT NGINX CONFIG CONVENTION
# Debian: /etc/nginx/sites-available + sites-enabled symlinks
# RHEL:   /etc/nginx/conf.d
# =============================================================================
nginx_sites_dir() {
    [ -d /etc/nginx/sites-available ] && echo "/etc/nginx/sites-available" || echo "/etc/nginx/conf.d"
}

nginx_enabled_dir() {
    [ -d /etc/nginx/sites-enabled ] && echo "/etc/nginx/sites-enabled" || echo "/etc/nginx/conf.d"
}

# =============================================================================
# GET APP VERSION FROM package.json
# =============================================================================
get_app_version() {
    local pkg="${APP_DIR}/pos/package.json"
    [ -f "${pkg}" ] && node -e "const p=require('${pkg}');process.stdout.write(p.version)" 2>/dev/null || echo "unknown"
}

# =============================================================================
# PHASE 0 — PREFLIGHT
# =============================================================================
phase_preflight() {
    step "Phase 0 — Preflight checks"

    require_root
    detect_os

    if is_debian_family; then
        success "OS: ${OS_ID} ${OS_VERSION} (Debian family)"
    elif is_rhel_family; then
        success "OS: ${OS_ID} ${OS_VERSION} (RHEL family)"
    else
        fatal "Unsupported OS: ${OS_ID}. Supported: Ubuntu 20.04+, Debian 11+, CentOS/RHEL 8+, Rocky/Alma 8+."
    fi

    check_disk_space 20 /var
    check_ram_mb 2048

    success "Preflight passed."
}

# =============================================================================
# DETECT REPO — decide APP_DIR and whether to clone
# =============================================================================
detect_repo() {
    # Resolve where this script lives (handles symlinks, but not /dev/fd/* from curl|bash)
    local src="${BASH_SOURCE[0]:-}"
    if [ -n "${src}" ] && [ "${src}" != "/dev/stdin" ] && [[ "${src}" != /dev/fd/* ]]; then
        SCRIPT_DIR="$(cd "$(dirname "${src}")" && pwd)"
        if [ -f "${SCRIPT_DIR}/pos/package.json" ]; then
            IN_REPO=true
            APP_DIR="${SCRIPT_DIR}"
            info "Running from inside repo at: ${APP_DIR}"
            return
        fi
    fi
    IN_REPO=false
    info "Running standalone (not inside repo). Will clone repository."
}

# =============================================================================
# PHASE 1 — COLLECT CONFIGURATION
# All prompts before any system changes. Confirms before proceeding.
# =============================================================================
phase_collect_config() {
    step "Phase 1 — Configuration"
    echo ""
    info "All prompts collected BEFORE any installation begins."
    echo ""

    # Install directory (only when not already in repo)
    if ! "${IN_REPO}"; then
        if "${NON_INTERACTIVE}"; then
            APP_DIR="${CAFEFLOW_DIR:-/opt/cafeflow}"
        else
            step "Install Directory"
            read_with_default APP_DIR "Install directory" "/opt/cafeflow"
        fi
        validate_directory_parent "${APP_DIR}"
        info "App will be installed to: ${APP_DIR}"
    fi

    # Existing install: reuse its credentials. Generating new ones would change the
    # database and Redis passwords while pos/.env (never overwritten) kept the old
    # ones, leaving the app unable to connect.
    local env_file="${APP_DIR}/pos/.env"
    local existing_domain=""
    if [ -f "${env_file}" ]; then
        EXISTING_ENV=true
        existing_domain=$(env_get "${env_file}" FRONTEND_URL | sed -E 's|^https?://||; s|/.*$||')
        DB_NAME=$(env_get "${env_file}" DB_NAME)
        DB_USER=$(env_get "${env_file}" DB_USER)
        DB_PASSWORD=$(env_get "${env_file}" DB_PASSWORD)
        REDIS_URL=$(env_get "${env_file}" REDIS_URL)
        TZ=$(env_get "${env_file}" TZ)
        JWT_SECRET=$(env_get "${env_file}" JWT_SECRET)
        REFRESH_TOKEN_SECRET=$(env_get "${env_file}" REFRESH_TOKEN_SECRET)
        DB_ENCRYPTION_SECRET=$(env_get "${env_file}" DB_ENCRYPTION_SECRET)
        DB_ENCRYPTION_SALT=$(env_get "${env_file}" DB_ENCRYPTION_SALT)
        [ -n "${DB_NAME}" ] && [ -n "${DB_USER}" ] && [ -n "${DB_PASSWORD}" ] \
            || fatal "${env_file} exists but DB_NAME / DB_USER / DB_PASSWORD are missing. Fix it or move it away to generate a new one."
        if [[ "${REDIS_URL}" =~ ^redis://:([^@]+)@ ]]; then
            REDIS_PASSWORD="${BASH_REMATCH[1]}"
        else
            fatal "Could not read the Redis password from REDIS_URL in ${env_file} (expected redis://:PASSWORD@host:port)."
        fi
        TZ="${TZ:-UTC}"
        warn "Existing ${env_file} found — reusing its database, Redis and secret values (nothing is rotated)."
    fi

    # Domains
    step "Domain Names"
    echo ""
    if "${NON_INTERACTIVE}"; then
        POS_DOMAIN="${POS_DOMAIN:-${existing_domain}}"
        POS_DOMAIN="${POS_DOMAIN:?POS_DOMAIN env var required for --non-interactive}"
        validate_domain "${POS_DOMAIN}" || fatal "POS_DOMAIN '${POS_DOMAIN}' is not a valid domain."
    else
        prompt_domain POS_DOMAIN "POS admin domain (e.g. pos.example.com)" "${existing_domain}"
    fi

    # HTTPS
    step "HTTPS"
    if "${NON_INTERACTIVE}"; then
        TLS_MODE="${TLS_MODE:-proxy}"
    else
        echo ""
        echo "  Staff log in with secure cookies, so the POS must be opened over https://."
        echo "    1) proxy   — HTTPS is handled in front of this server (Cloudflare, tunnel,"
        echo "                 load balancer). Nginx here serves plain http on port 80."
        echo "    2) certbot — get a free Let's Encrypt certificate on this server. The domain"
        echo "                 must already point here and port 80 must be reachable from the internet."
        local tls_choice
        read_with_default tls_choice "Choose 1 or 2" "1"
        case "${tls_choice}" in
            1|proxy)   TLS_MODE="proxy" ;;
            2|certbot) TLS_MODE="certbot" ;;
            *) fatal "Invalid choice '${tls_choice}'." ;;
        esac
    fi
    case "${TLS_MODE}" in
        proxy) ;;
        certbot)
            if "${NON_INTERACTIVE}"; then
                LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL env var required when TLS_MODE=certbot}"
            else
                read_with_default LETSENCRYPT_EMAIL "Email for Let's Encrypt expiry notices" ""
            fi
            validate_email "${LETSENCRYPT_EMAIL}" || fatal "'${LETSENCRYPT_EMAIL}' is not a valid email address."
            ;;
        *) fatal "TLS_MODE must be 'proxy' or 'certbot' (got '${TLS_MODE}')." ;;
    esac

    # Database
    step "Database"
    if "${EXISTING_ENV}"; then
        info "Using database '${DB_NAME}' (user: ${DB_USER}) from existing pos/.env."
    elif "${NON_INTERACTIVE}"; then
        DB_NAME="${DB_NAME:-cafeflow}"
        DB_USER="${DB_USER:-cafeflow_user}"
        DB_PASSWORD="${DB_PASSWORD:-$(generate_secret | head -c 32)}"
    else
        local raw_db_name raw_db_user
        read_with_default raw_db_name "Database name" "cafeflow"
        read_with_default raw_db_user "Database user" "cafeflow_user"
        validate_identifier "${raw_db_name}" "Database name"
        validate_identifier "${raw_db_user}" "Database user"
        DB_NAME="${raw_db_name}"
        DB_USER="${raw_db_user}"
        echo ""
        read -rsp "  Database password (blank = auto-generate): " DB_PASSWORD
        echo ""
        if [ -z "${DB_PASSWORD}" ]; then
            DB_PASSWORD="$(generate_secret | head -c 32)"
            info "Auto-generated database password."
        fi
    fi

    # Redis
    step "Redis"
    if "${EXISTING_ENV}"; then
        info "Using the Redis password from existing pos/.env."
    elif "${NON_INTERACTIVE}"; then
        REDIS_PASSWORD="${REDIS_PASSWORD:-$(generate_secret | head -c 24)}"
    else
        echo ""
        read -rsp "  Redis password (blank = auto-generate): " REDIS_PASSWORD
        echo ""
        if [ -z "${REDIS_PASSWORD}" ]; then
            REDIS_PASSWORD="$(generate_secret | head -c 24)"
            info "Auto-generated Redis password."
        fi
    fi

    # Timezone
    step "Timezone"
    if "${EXISTING_ENV}"; then
        info "Using timezone ${TZ} from existing pos/.env."
    elif "${NON_INTERACTIVE}"; then
        TZ="${TZ:-UTC}"
        validate_timezone "${TZ}" || fatal "TZ '${TZ}' not found in /usr/share/zoneinfo/."
    else
        prompt_timezone TZ "UTC"
    fi

    # Secrets — generate only what is missing. The encryption secret/salt in
    # particular must never change on an existing install: every encrypted value
    # in the database (e.g. the SMTP password) would become unreadable.
    step "Security Secrets"
    [ -n "${JWT_SECRET}" ]           || JWT_SECRET="$(generate_secret)"
    [ -n "${REFRESH_TOKEN_SECRET}" ] || REFRESH_TOKEN_SECRET="$(generate_secret)"
    [ -n "${DB_ENCRYPTION_SECRET}" ] || DB_ENCRYPTION_SECRET="$(generate_secret)"
    [ -n "${DB_ENCRYPTION_SALT}" ]   || DB_ENCRYPTION_SALT="$(openssl rand -hex 16)"
    while [ "${JWT_SECRET}" = "${REFRESH_TOKEN_SECRET}" ]; do
        REFRESH_TOKEN_SECRET="$(generate_secret)"
    done
    if "${EXISTING_ENV}"; then
        success "Secrets reused from existing pos/.env (not displayed)."
    else
        success "Secrets generated (not displayed)."
    fi

    # Derive composite values
    CORS_ORIGIN="https://${POS_DOMAIN}"
    REDIS_URL="redis://:${REDIS_PASSWORD}@127.0.0.1:6379"

    # Summary — no secrets shown
    echo ""
    divider
    echo -e "  ${BOLD}Installation Summary${RESET}"
    divider
    echo "  POS Admin:      https://${POS_DOMAIN}"
    echo "  HTTPS:          ${TLS_MODE}"
    echo "  Database:       ${DB_NAME} (user: ${DB_USER})"
    echo "  Timezone:       ${TZ}"
    echo "  App directory:  ${APP_DIR}"
    divider
    warn "Credentials will be saved to ${CREDS_FILE} (root-only, chmod 600)."

    if ! "${NON_INTERACTIVE}"; then
        echo ""
        read -rp "  Proceed with installation? [y/N] " confirm
        [[ "${confirm}" =~ ^[Yy]$ ]] || { info "Aborted. No changes made."; exit 0; }
    fi
    echo ""
}

# =============================================================================
# PHASE 2 — INSTALL SYSTEM PACKAGES
# =============================================================================
phase_packages() {
    step "Phase 2 — Installing system packages"

    pkg_update

    # ── Bootstrap tools ──────────────────────────────────────────────────────
    if is_debian_family; then
        pkg_install curl wget git build-essential python3 ca-certificates gnupg lsb-release
    elif is_rhel_family; then
        pkg_install curl wget git gcc-c++ make python3 ca-certificates gnupg
    fi
    success "Bootstrap tools installed."

    # ── Node.js 20 LTS ───────────────────────────────────────────────────────
    if check_node_version 20; then
        success "Node.js $(node -v) already installed (≥20)."
    else
        info "Installing Node.js 20 LTS via NodeSource..."
        local node_setup
        node_setup=$(mktemp); TEMP_FILES+=("${node_setup}")
        if is_debian_family; then
            curl -fsSL https://deb.nodesource.com/setup_20.x -o "${node_setup}"
            bash "${node_setup}"
            pkg_install nodejs
        elif is_rhel_family; then
            curl -fsSL https://rpm.nodesource.com/setup_20.x -o "${node_setup}"
            bash "${node_setup}"
            pkg_install nodejs
        fi
        check_node_version 20 || fatal "Node.js 20 installation failed. Check NodeSource output above."
        success "Node.js $(node -v) installed."
    fi

    # ── PostgreSQL 14+ ───────────────────────────────────────────────────────
    if command -v psql &>/dev/null && psql --version 2>/dev/null | grep -qE '1[4-9]\.|[2-9][0-9]\.'; then
        success "PostgreSQL $(psql --version | awk '{print $3}') already installed."
    else
        info "Installing PostgreSQL via PGDG official repository..."
        if is_debian_family; then
            pkg_install postgresql-common
            # Add PGDG repo for a guaranteed 14+ version (distro default on Ubuntu 20.04 is PG12)
            if [ -f /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh ]; then
                bash /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y || true
                pkg_update
            fi
            # Try versioned packages FIRST (guarantees 14+); fall back to distro generic only as last resort
            pkg_install postgresql-16 postgresql-contrib-16 2>/dev/null || \
                pkg_install postgresql-15 postgresql-contrib-15 2>/dev/null || \
                pkg_install postgresql-14 postgresql-contrib-14 2>/dev/null || \
                pkg_install postgresql postgresql-contrib || \
                fatal "Failed to install PostgreSQL 14+. Install manually and re-run."
            # Verify we got a supported version
            psql --version 2>/dev/null | grep -qE '1[4-9]\.|[2-9][0-9]\.' \
                || fatal "PostgreSQL 14+ required but version installed is too old. Add the PGDG repo manually: https://wiki.postgresql.org/wiki/Apt"
            # Start whichever service variant was created
            systemctl enable --now postgresql@16-main 2>/dev/null || \
                systemctl enable --now postgresql@15-main 2>/dev/null || \
                systemctl enable --now postgresql@14-main 2>/dev/null || \
                systemctl enable --now postgresql 2>/dev/null || true
        elif is_rhel_family; then
            local el_ver arch
            el_ver="${OS_VERSION%%.*}"
            arch=$(uname -m)
            dnf install -y \
                "https://download.postgresql.org/pub/repos/yum/reporpms/EL-${el_ver}-${arch}/pgdg-redhat-repo-latest.noarch.rpm" \
                2>/dev/null || warn "PGDG repo setup failed — trying default repos..."
            dnf -qy module disable postgresql 2>/dev/null || true
            pkg_install postgresql16-server postgresql16-contrib || \
                pkg_install postgresql15-server postgresql15-contrib || \
                pkg_install postgresql14-server postgresql14-contrib || \
                fatal "Failed to install PostgreSQL. Install manually and re-run."
            # Initialize whichever version was installed
            for pg_setup in /usr/pgsql-1*/bin/postgresql-*-setup; do
                [ -f "${pg_setup}" ] && "${pg_setup}" initdb 2>/dev/null && break || true
            done
            for svc in postgresql-16 postgresql-15 postgresql-14; do
                systemctl enable --now "${svc}" 2>/dev/null && break || true
            done
        fi
        success "PostgreSQL installed."
    fi

    # Ensure PostgreSQL is running
    check_postgres_running

    # ── Redis ────────────────────────────────────────────────────────────────
    if command -v redis-cli &>/dev/null; then
        success "Redis already installed."
    else
        info "Installing Redis..."
        if is_debian_family; then
            pkg_install redis-server
            systemctl enable --now redis-server
        elif is_rhel_family; then
            dnf install -y epel-release 2>/dev/null || true
            pkg_install redis
            systemctl enable --now redis
        fi
        success "Redis installed."
    fi

    # ── Nginx ────────────────────────────────────────────────────────────────
    if command -v nginx &>/dev/null; then
        success "Nginx $(nginx -v 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1) already installed."
    else
        info "Installing Nginx..."
        pkg_install nginx
        systemctl enable --now nginx
        success "Nginx installed."
    fi

    # ── PM2 ──────────────────────────────────────────────────────────────────
    if command -v pm2 &>/dev/null; then
        success "PM2 $(pm2 --version) already installed."
    else
        info "Installing PM2 globally..."
        npm install -g pm2 || fatal "PM2 installation failed."
        command -v pm2 &>/dev/null || fatal "PM2 not found after install."
        success "PM2 $(pm2 --version) installed."
    fi

    detect_web_user
    success "Web server user: ${WEB_USER}"
    success "All system packages installed."
}

# =============================================================================
# PHASE 3 — CLONE / VERIFY REPOSITORY
# =============================================================================
phase_clone() {
    step "Phase 3 — Repository"

    if "${IN_REPO}"; then
        info "Using existing repository at: ${APP_DIR}"
        [ -f "${APP_DIR}/pos/package.json" ]        || fatal "pos/package.json not found in ${APP_DIR}."
        [ -f "${APP_DIR}/pos/server/schema.sql" ]   || fatal "pos/server/schema.sql not found in ${APP_DIR}."
        success "Repository verified at ${APP_DIR}."
        return
    fi

    # Standalone mode — clone or pull
    if [ -d "${APP_DIR}/.git" ]; then
        warn "Git repository already exists at ${APP_DIR} — pulling latest..."
        git -C "${APP_DIR}" pull || warn "git pull failed — proceeding with existing code."
    elif [ -d "${APP_DIR}" ] && [ -n "$(ls -A "${APP_DIR}" 2>/dev/null)" ]; then
        fatal "Directory ${APP_DIR} exists and is not empty. Choose a different path or empty it first."
    else
        info "Cloning repository to ${APP_DIR}..."
        mkdir -p "$(dirname "${APP_DIR}")"
        git clone "${CAFEFLOW_REPO}" "${APP_DIR}" \
            || fatal "git clone failed. Check CAFEFLOW_REPO and network access."
    fi

    [ -f "${APP_DIR}/pos/package.json" ]        || fatal "pos/package.json not found after clone."
    [ -f "${APP_DIR}/pos/server/schema.sql" ]   || fatal "pos/server/schema.sql not found after clone."
    success "Repository ready at ${APP_DIR}."
}

# =============================================================================
# PHASE 4 — DATABASE SETUP
# Safe SQL: identifiers pre-validated; passwords via .pgpass temp file
# =============================================================================
phase_database() {
    step "Phase 4 — Database setup"

    check_postgres_running

    # ── Create DB user ────────────────────────────────────────────────────────
    if postgres_user_exists "${DB_USER}"; then
        warn "Database user '${DB_USER}' already exists — updating password."
        # Dollar quoting ($pw$...$pw$) avoids psql variable interpolation which
        # does NOT work with -c. Password is never exposed in the process list.
        sudo -u postgres psql -c \
            "ALTER USER \"${DB_USER}\" WITH ENCRYPTED PASSWORD \$pw\$${DB_PASSWORD}\$pw\$" \
            || warn "Could not update password."
    else
        sudo -u postgres psql -c \
            "CREATE USER \"${DB_USER}\" WITH ENCRYPTED PASSWORD \$pw\$${DB_PASSWORD}\$pw\$" \
            || fatal "Failed to create database user '${DB_USER}'."
        success "Created database user: ${DB_USER}"
    fi

    # ── Create database ───────────────────────────────────────────────────────
    if postgres_db_exists "${DB_NAME}"; then
        warn "Database '${DB_NAME}' already exists — skipping creation."
    else
        sudo -u postgres psql \
            -c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\";" \
            || fatal "Failed to create database '${DB_NAME}'."
        sudo -u postgres psql -d "${DB_NAME}" \
            -c "GRANT ALL ON SCHEMA public TO \"${DB_USER}\";" \
            || warn "Could not grant schema privileges."
        # TZ is validated against /usr/share/zoneinfo/ — safe for direct substitution
        sudo -u postgres psql -d "${DB_NAME}" \
            -c "ALTER DATABASE \"${DB_NAME}\" SET timezone TO '${TZ}'" \
            || warn "Could not set database timezone."
        success "Created database: ${DB_NAME}"
    fi

    # ── Apply schema ──────────────────────────────────────────────────────────
    # schema.sql is the single source of truth and is idempotent. On an existing
    # install it brings the database up to date (including removal of retired
    # modules' tables), so back it up first.
    local schema_file="${APP_DIR}/pos/server/schema.sql"
    if postgres_table_exists "${DB_NAME}" "${DB_USER}" "${DB_PASSWORD}" "users"; then
        backup_existing_db "${DB_NAME}" "${DB_USER}" "${DB_PASSWORD}"
        info "Existing schema found — re-applying schema.sql (idempotent)..."
    else
        info "Applying database schema..."
    fi
    if apply_schema "${DB_NAME}" "${DB_USER}" "${DB_PASSWORD}" "${schema_file}"; then
        success "Schema applied successfully."
    else
        fatal "Schema application failed (rolled back, database unchanged). Check the error above."
    fi

    success "Database setup complete."
}

# =============================================================================
# PHASE 5 — APPLICATION SETUP
# Writes .env files, installs deps, builds, generates ecosystem.config.cjs
# =============================================================================
phase_app() {
    step "Phase 5 — Application setup"

    # ── Write pos/.env ────────────────────────────────────────────────────────
    if [ -f "${APP_DIR}/pos/.env" ]; then
        warn "pos/.env already exists — skipping. Delete it to regenerate."
    else
        info "Writing pos/.env..."
        cat > "${APP_DIR}/pos/.env" << EOF
PORT=3001
NODE_ENV=production
CORS_ORIGIN=${CORS_ORIGIN}
DB_USER=${DB_USER}
DB_HOST=localhost
DB_NAME=${DB_NAME}
DB_PASSWORD=${DB_PASSWORD}
DB_PORT=5432
# Total across all PM2 workers (divided per worker by server/config/db.cjs).
# Keep it below PostgreSQL max_connections (default 100) so backups and psql can still connect.
DB_POOL_MAX=80
JWT_SECRET=${JWT_SECRET}
REFRESH_TOKEN_SECRET=${REFRESH_TOKEN_SECRET}
DB_ENCRYPTION_SECRET=${DB_ENCRYPTION_SECRET}
DB_ENCRYPTION_SALT=${DB_ENCRYPTION_SALT}
REDIS_URL=${REDIS_URL}
TZ=${TZ}
VITE_APP_TIMEZONE=${TZ}
FRONTEND_URL=https://${POS_DOMAIN}
# Student ordering app origin (e.g. https://order.example.com). Empty = the
# /api/public/student-* endpoints stay disabled (403). Add that origin to
# CORS_ORIGIN as well when enabling it.
STUDENT_ORDER_ALLOWED_ORIGIN=
LOG_LEVEL=info
EOF
        chmod 600 "${APP_DIR}/pos/.env"
        success "pos/.env written."
    fi

    # ── Install server (Express/API) dependencies ────────────────────────────
    # pos/server/ has its own package.json and node_modules — gitignored, so
    # it must be installed separately. These are production-only deps (no build step).
    cd "${APP_DIR}/pos/server"
    run_npm "Installing POS server dependencies" install --omit=dev

    # ── Install & build POS frontend ─────────────────────────────────────────
    # Must use full `npm install` (not --omit=dev) — vite, typescript, tsc are
    # devDependencies and are required by the build scripts. Prune after build.
    cd "${APP_DIR}/pos"
    run_npm "Installing POS frontend dependencies (including build tools)" install
    run_npm "Building POS frontend"                                         run build
    run_npm "Pruning POS frontend dev dependencies"                         prune --omit=dev

    # ── Generate default Excel templates ─────────────────────────────────────
    local tmpl_script="${APP_DIR}/pos/server/scripts/generateDefaultTemplates.cjs"
    if [ -f "${tmpl_script}" ]; then
        info "Generating default Excel templates..."
        node "${tmpl_script}" \
            && success "Excel templates generated." \
            || warn "Template generation failed — re-run later: node ${tmpl_script}"
    fi

    # ── Create required directories ───────────────────────────────────────────
    # Uploads live in pos/server/public/uploads (served at /uploads by Nginx and
    # Express); pos/server/uploads/tmp is the server's staging area.
    mkdir -p \
        "${APP_DIR}/pos/server/public/uploads/menu" \
        "${APP_DIR}/pos/server/uploads/tmp" \
        "${APP_DIR}/pos/server/templates/defaults" \
        "${APP_DIR}/pos/server/logs" \
        "${LOG_DIR}"

    # ── Set file permissions ──────────────────────────────────────────────────
    # dist/ is owned by the web user (www-data/nginx) so Nginx can serve static
    # files directly. PM2 runs as root and can read any 755-owned file regardless
    # of owner, so this does not affect the Node.js process serving the API.
    info "Setting file permissions (web user: ${WEB_USER})..."
    chown -R "${WEB_USER}:${WEB_USER}" \
        "${APP_DIR}/pos/dist" \
        "${APP_DIR}/pos/server/public/uploads" \
        "${APP_DIR}/pos/server/uploads" \
        "${APP_DIR}/pos/server/templates" \
        "${LOG_DIR}"
    chmod -R 755 "${APP_DIR}/pos/dist"
    chmod -R 775 "${APP_DIR}/pos/server/public/uploads" "${APP_DIR}/pos/server/uploads" "${APP_DIR}/pos/server/templates"
    chmod 600 "${APP_DIR}/pos/.env"

    # ── Generate ecosystem.config.cjs with ABSOLUTE paths ────────────────────
    info "Generating ecosystem.config.cjs (absolute paths)..."
    cat > "${APP_DIR}/ecosystem.config.cjs" << EOF
// Generated by deploy.sh — DO NOT EDIT MANUALLY
// Uses absolute paths so PM2 systemd restart works from any directory.
module.exports = {
    apps: [
        {
            name: 'cafeflow-pos',
            cwd: '${APP_DIR}/pos',
            script: 'server/index.cjs',
            instances: 'max',
            exec_mode: 'cluster',
            env: { NODE_ENV: 'production' },   // other variables: pos/.env, loaded by the server (dotenv)
            max_memory_restart: '500M',
            out_file: '${LOG_DIR}/pos-out.log',
            error_file: '${LOG_DIR}/pos-error.log',
            merge_logs: true,
            autorestart: true,
            // Must exceed the 10s force-exit timer in server/index.cjs shutdown().
            kill_timeout: 12000
        }
    ]
};
EOF
    success "ecosystem.config.cjs generated."
    success "Application setup complete."
}

# =============================================================================
# PHASE 6 — NGINX CONFIGURATION (inline — no template files)
# =============================================================================

write_nginx_config() {
    local sites_dir enabled_dir
    sites_dir="$(nginx_sites_dir)"
    enabled_dir="$(nginx_enabled_dir)"

    info "Writing Nginx config..."

    # POS
    cat > "${sites_dir}/cafeflow-pos" << EOF
# CafeFlow POS
# Generated by deploy.sh
server {
    listen 80;
    listen [::]:80;
    server_name ${POS_DOMAIN};

    # PWA service worker and manifest must never be cached, or browsers keep
    # running the previous build after an update.
    location ~ ^/(sw(-v2)?\.js|registerSW(-v2)?\.js|manifest\.webmanifest)\$ {
        root ${APP_DIR}/pos/dist;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate";
        add_header Pragma "no-cache";
        expires -1;
    }

    # Static frontend
    location / {
        root ${APP_DIR}/pos/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # API proxy
    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # WebSocket / Socket.IO
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
    }

    # User uploads
    location /uploads/ {
        alias ${APP_DIR}/pos/server/public/uploads/;
        expires 30d;
        add_header Cache-Control "public";
        location ~* \.(php|pl|py|sh|cgi)$ { deny all; }
    }

    # Health check
    location = /health {
        proxy_pass http://127.0.0.1:3001/health;
        access_log off;
        proxy_connect_timeout 5s;
        proxy_read_timeout 5s;
    }
}
EOF

    # Enable sites (Debian uses symlinks)
    if [ -d /etc/nginx/sites-enabled ]; then
        ln -sfn "${sites_dir}/cafeflow-pos"        /etc/nginx/sites-enabled/cafeflow-pos
        # Storefront was removed — clean up its site on hosts that still have it
        rm -f /etc/nginx/sites-enabled/cafeflow-storefront "${sites_dir}/cafeflow-storefront" 2>/dev/null || true
        rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    fi

    # Simple direct check — piping through grep with pipefail causes false failures
    nginx -t || fatal "Nginx config test failed. Run 'nginx -t' to see the error."
    systemctl reload nginx
    success "Nginx config active."
}

phase_nginx() {
    step "Phase 6 — Nginx configuration"
    write_nginx_config
}

# =============================================================================
# PHASE 7 — HTTPS
# write_nginx_config rewrites the site on every run, so certbot re-installs the
# certificate each time (--keep-until-expiring reuses it; no new issuance).
# =============================================================================
phase_tls() {
    step "Phase 7 — HTTPS (${TLS_MODE})"

    if [ "${TLS_MODE}" = "proxy" ]; then
        info "HTTPS is terminated upstream; Nginx serves http on port 80."
        warn "Make sure https://${POS_DOMAIN} reaches this server through your proxy (e.g. Cloudflare)."
        return
    fi

    if ! command -v certbot &>/dev/null; then
        info "Installing certbot..."
        if is_debian_family; then
            pkg_install certbot python3-certbot-nginx
        elif is_rhel_family; then
            dnf install -y epel-release 2>/dev/null || true
            pkg_install certbot python3-certbot-nginx
        fi
    fi

    if certbot --nginx -d "${POS_DOMAIN}" --non-interactive --agree-tos \
            -m "${LETSENCRYPT_EMAIL}" --redirect --keep-until-expiring; then
        success "HTTPS enabled for ${POS_DOMAIN} (auto-renewal via certbot timer)."
    else
        warn "certbot failed. Check that ${POS_DOMAIN} points to this server and port 80 is open, then run:"
        warn "  certbot --nginx -d ${POS_DOMAIN} -m ${LETSENCRYPT_EMAIL} --agree-tos --redirect"
        warn "Until HTTPS works, staff cannot log in (secure cookies)."
    fi
}

# =============================================================================
# PHASE 8 — REDIS HARDENING
# =============================================================================
phase_redis() {
    step "Phase 8 — Redis hardening"

    local redis_conf=""
    for f in /etc/redis/redis.conf /etc/redis.conf /etc/redis/redis-server.conf; do
        [ -f "${f}" ] && redis_conf="${f}" && break
    done

    if [ -z "${redis_conf}" ]; then
        warn "Redis config not found. Skipping hardening."
        warn "Manually set: bind 127.0.0.1, requirepass in your Redis config."
        return
    fi

    info "Hardening Redis at ${redis_conf}..."

    # Bind to localhost only.
    # Use plain "127.0.0.1" — the "-::1" IPv6 optional-bind syntax is Redis 7.0+ only
    # and will break Redis 5/6 (Ubuntu 20.04/22.04 distro packages).
    sed -i 's/^bind .*/bind 127.0.0.1/' "${redis_conf}"

    # Set requirepass — escape for sed
    local esc_pw
    esc_pw=$(escape_sed_replacement "${REDIS_PASSWORD}")

    if grep -q "^requirepass " "${redis_conf}"; then
        sed -i "s/^requirepass .*/requirepass ${esc_pw}/" "${redis_conf}"
    elif grep -q "^# requirepass " "${redis_conf}"; then
        sed -i "s/^# requirepass .*/requirepass ${esc_pw}/" "${redis_conf}"
    else
        printf '\nrequirepass %s\n' "${REDIS_PASSWORD}" >> "${redis_conf}"
    fi

    # maxmemory
    if ! grep -q "^maxmemory " "${redis_conf}"; then
        printf '\n# Added by CafeFlow deploy.sh\nmaxmemory 256mb\nmaxmemory-policy allkeys-lru\n' \
            >> "${redis_conf}"
    fi

    systemctl restart redis-server 2>/dev/null \
        || systemctl restart redis 2>/dev/null \
        || warn "Could not restart Redis — apply changes manually."

    success "Redis hardened (localhost-only, password set, maxmemory 256mb)."
}

# =============================================================================
# PHASE 9 — PM2 PROCESS MANAGEMENT
# =============================================================================
phase_pm2() {
    step "Phase 9 — PM2 process management"

    cd "${APP_DIR}"

    # Stop existing processes (idempotent)
    pm2 delete cafeflow-pos        2>/dev/null && info "Stopped existing cafeflow-pos."        || true
    pm2 delete cafeflow-storefront 2>/dev/null && info "Removed legacy cafeflow-storefront process." || true

    # Start the app with a clean environment. PM2 snapshots the caller's
    # environment into the process (and pm2 save persists it); dotenv never
    # overrides variables that are already set, so any DB_*/CORS_*/... variable
    # exported in this shell (e.g. for --non-interactive) would silently win over
    # pos/.env forever after. With env -i, pos/.env is the single source.
    info "Starting applications via PM2..."
    env -i PATH="${PATH}" HOME="${HOME:-/root}" pm2 start ecosystem.config.cjs \
        || fatal "PM2 start failed. Check ecosystem.config.cjs and .env files."

    # Configure systemd auto-start (no eval — validate extracted command)
    info "Configuring PM2 systemd startup..."
    local cur_user home_dir startup_output startup_cmd
    cur_user=$(whoami)
    home_dir=$(getent passwd "${cur_user}" | cut -d: -f6)

    startup_output=$(pm2 startup systemd -u "${cur_user}" --hp "${home_dir}" 2>&1) || true
    startup_cmd=$(echo "${startup_output}" | grep -E '^sudo env PATH=' | head -1) || true

    if [ -n "${startup_cmd}" ] \
        && echo "${startup_cmd}" | grep -q "pm2" \
        && echo "${startup_cmd}" | grep -q "startup"; then
        info "Registering PM2 with systemd..."
        bash -c "${startup_cmd}" \
            || warn "PM2 systemd registration failed — run manually: ${startup_cmd}"
    else
        warn "Could not auto-register PM2 with systemd. Run 'pm2 startup' manually."
    fi

    pm2 save || warn "pm2 save failed — process list may not persist across reboots."

    # Health check
    info "Waiting for POS backend to be healthy..."
    if wait_for_health "http://127.0.0.1:3001/health" 12 5; then
        success "POS backend is healthy."
    else
        warn "Health check timed out. Check logs: pm2 logs cafeflow-pos"
    fi

    success "PM2 started: cafeflow-pos (cluster)"
    pm2 list
}

# =============================================================================
# PHASE 10 — SECURITY HARDENING (Firewall + PostgreSQL)
# =============================================================================
phase_security() {
    step "Phase 10 — Security hardening"

    # ── UFW (Debian/Ubuntu) ───────────────────────────────────────────────────
    if command -v ufw &>/dev/null && is_debian_family; then
        info "Configuring UFW firewall..."
        ufw allow OpenSSH          || warn "UFW: failed to allow SSH"
        # Allow HTTP + HTTPS
        ufw allow 'Nginx Full' 2>/dev/null \
            || { ufw allow 80/tcp; ufw allow 443/tcp; }
        # Block backend ports from public access
        ufw deny 3001/tcp          || warn "UFW: failed to block 3001"
        ufw deny 5432/tcp          || warn "UFW: failed to block 5432"
        ufw deny 6379/tcp          || warn "UFW: failed to block 6379"
        echo "y" | ufw enable      || warn "UFW enable failed — run: ufw enable"
        success "UFW enabled: SSH + HTTP/HTTPS allowed; 3001/5432/6379 blocked."

    # ── firewalld (RHEL) ──────────────────────────────────────────────────────
    elif command -v firewall-cmd &>/dev/null && is_rhel_family; then
        info "Configuring firewalld..."
        systemctl enable --now firewalld || warn "Could not start firewalld."
        firewall-cmd --permanent --add-service=ssh   || warn "firewalld: add ssh failed"
        firewall-cmd --permanent --add-service=http  || warn "firewalld: add http failed"
        firewall-cmd --permanent --add-service=https || warn "firewalld: add https failed"
        for port in 3001 5432 6379; do
            firewall-cmd --permanent --remove-port="${port}/tcp" 2>/dev/null || true
        done
        firewall-cmd --reload || warn "firewalld reload failed"
        success "Firewalld configured."
    else
        warn "No supported firewall found (ufw/firewalld). Configure manually."
        warn "Block ports 3001, 5432, 6379 from public access."
    fi

    # ── Restrict PostgreSQL to localhost ──────────────────────────────────────
    local pg_conf
    pg_conf=$(sudo -u postgres psql -tAc "SHOW config_file" 2>/dev/null | tr -d ' ') || true
    if [ -n "${pg_conf}" ] && [ -f "${pg_conf}" ]; then
        if grep -q "^listen_addresses" "${pg_conf}"; then
            sed -i "s/^listen_addresses.*/listen_addresses = 'localhost'/" "${pg_conf}"
        else
            echo "listen_addresses = 'localhost'" >> "${pg_conf}"
        fi
        # listen_addresses is a startup-only parameter — requires RESTART, not reload.
        # systemctl reload sends SIGHUP which only reloads runtime-reloadable params.
        systemctl restart postgresql      2>/dev/null \
            || systemctl restart postgresql-16 2>/dev/null \
            || systemctl restart postgresql-15 2>/dev/null \
            || systemctl restart postgresql-14 2>/dev/null \
            || true
        success "PostgreSQL bound to localhost only."
    else
        warn "Could not find postgresql.conf — set listen_addresses = 'localhost' manually."
    fi
}

# =============================================================================
# PHASE 11 — BACKUP SCRIPT, LOG ROTATION, CRON
# Backup script: APP_DIR baked in at write time (printf header + quoted heredoc body)
# =============================================================================
phase_monitoring() {
    step "Phase 11 — Backups and monitoring"

    local backup_script="/usr/local/bin/backup-cafeflow.sh"
    local backup_dir="/var/backups/cafeflow"

    # ── Write backup script ───────────────────────────────────────────────────
    # Use printf for the APP_DIR line (expands NOW), quoted heredoc for rest
    # (so $DATE, $DB_PASS etc. expand at RUNTIME, not install time)
    printf '#!/bin/bash\n# CafeFlow daily backup — generated by deploy.sh\n# APP_DIR baked in at install time.\nset -euo pipefail\nAPP_DIR="%s"\n' \
        "${APP_DIR}" > "${backup_script}"

    cat >> "${backup_script}" << 'BACKUP_BODY'
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/cafeflow"
ENV_FILE="${APP_DIR}/pos/.env"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

[ -f "${ENV_FILE}" ] || { echo "${LOG_PREFIX} ERROR: ${ENV_FILE} not found." >&2; exit 1; }

DB_NAME=$(grep "^DB_NAME=" "${ENV_FILE}" | cut -d= -f2-)
[ -n "${DB_NAME}" ] || { echo "${LOG_PREFIX} ERROR: DB_NAME not in .env" >&2; exit 1; }

mkdir -p "${BACKUP_DIR}"
[ -w "${BACKUP_DIR}" ] || { echo "${LOG_PREFIX} ERROR: Backup dir not writable" >&2; exit 1; }

# Dump as the postgres superuser: the app role cannot pg_dump tables with
# FORCE ROW LEVEL SECURITY (e.g. consumers), so an app-role dump always fails.
DB_FILE="${BACKUP_DIR}/db_${DATE}.sql.gz"
if runuser -u postgres -- pg_dump "${DB_NAME}" | gzip > "${DB_FILE}"; then
    echo "${LOG_PREFIX} DB backup: ${DB_FILE} ($(du -h --apparent-size "${DB_FILE}" | cut -f1))"
else
    rm -f "${DB_FILE}"
    echo "${LOG_PREFIX} ERROR: DB backup failed." >&2
    exit 1
fi

# Prune backups older than 30 days
find "${BACKUP_DIR}" -type f -mtime +30 -delete
echo "${LOG_PREFIX} Pruned backups older than 30 days."
BACKUP_BODY

    chmod 700 "${backup_script}"
    mkdir -p "${backup_dir}"
    success "Backup script: ${backup_script}"

    # ── Daily backup cron (idempotent) ────────────────────────────────────────
    local cron_line="0 2 * * * ${backup_script} >> /var/log/cafeflow-backup.log 2>&1"
    crontab -l > /var/backups/crontab.root.bak 2>/dev/null || true
    if crontab -l 2>/dev/null | grep -qF "${backup_script}"; then
        warn "Backup cron already configured."
    else
        # `|| true` required: crontab -l exits 1 on fresh server with no crontab.
        # Without it, set -e inside the subshell aborts before echo runs.
        (crontab -l 2>/dev/null || true; echo "${cron_line}") | crontab -
        success "Backup cron added (daily at 02:00)."
    fi

    touch /var/log/cafeflow-backup.log
    chmod 600 /var/log/cafeflow-backup.log

    # ── Log rotation ──────────────────────────────────────────────────────────
    cat > /etc/logrotate.d/cafeflow << EOF
${APP_DIR}/pos/server/logs/*.log
${LOG_DIR}/*.log
{
    daily
    rotate 90
    compress
    delaycompress
    notifempty
    missingok
    create 0640 ${WEB_USER} ${WEB_USER}
    sharedscripts
    postrotate
        pm2 reloadLogs 2>/dev/null || true
    endscript
}
EOF
    success "Log rotation configured (/etc/logrotate.d/cafeflow)."

}

# =============================================================================
# PHASE 12 — SUMMARY AND CREDENTIALS FILE
# Secrets written to file, never echoed to terminal.
# =============================================================================
phase_summary() {
    local version
    version="$(get_app_version)"

    # ── Write credentials to secure root-only file ────────────────────────────
    local tmp_creds
    tmp_creds=$(mktemp); TEMP_FILES+=("${tmp_creds}"); chmod 600 "${tmp_creds}"
    cat > "${tmp_creds}" << EOF
# CafeFlow POS — Installation Credentials
# Generated: $(date)
# Install dir: ${APP_DIR}
# WARNING: Keep this file secure. Store in a password manager and delete.

POS Admin URL:  https://${POS_DOMAIN}

Database Name:     ${DB_NAME}
Database User:     ${DB_USER}
Database Password: ${DB_PASSWORD}

Redis Password: ${REDIS_PASSWORD}

JWT_SECRET:           ${JWT_SECRET}
REFRESH_TOKEN_SECRET: ${REFRESH_TOKEN_SECRET}
DB_ENCRYPTION_SECRET: ${DB_ENCRYPTION_SECRET}
DB_ENCRYPTION_SALT:   ${DB_ENCRYPTION_SALT}
EOF
    mv "${tmp_creds}" "${CREDS_FILE}"
    chmod 600 "${CREDS_FILE}"

    # ── Terminal summary (no secrets) ─────────────────────────────────────────
    echo ""
    divider
    echo -e "  ${BOLD}${GREEN}CafeFlow POS v${version} — Installation Complete!${RESET}"
    divider
    echo ""
    echo -e "  ${BOLD}URLs${RESET}"
    echo "  POS Admin:    https://${POS_DOMAIN}"
    echo "  Health:       https://${POS_DOMAIN}/health"
    echo ""
    echo -e "  ${BOLD}Install Directory${RESET}"
    echo "  ${APP_DIR}"
    echo ""
    echo -e "  ${BOLD}Process Status${RESET}"
    pm2 list 2>/dev/null || true
    echo ""
    divider
    echo -e "  ${BOLD}${YELLOW}NEXT STEP — First-Run Setup Wizard${RESET}"
    divider
    warn "Open https://${POS_DOMAIN} in your browser."
    warn "The setup wizard will appear — create your admin account."
    echo ""
    divider
    echo -e "  ${BOLD}Credentials${RESET}"
    divider
    success "Saved to: ${CREDS_FILE}  (root-only, chmod 600)"
    warn "Store them in a password manager and delete this file when done."
    echo ""
    divider
    echo -e "  ${BOLD}Useful Commands${RESET}"
    divider
    echo "  pm2 list                          — running processes"
    echo "  pm2 logs cafeflow-pos             — POS application logs"
    echo "  pm2 monit                         — live process monitor"
    echo "  sudo bash ${APP_DIR}/deploy.sh    — re-run installer (idempotent)"
    echo "  /usr/local/bin/backup-cafeflow.sh — manual backup"
    echo ""
}

# =============================================================================
# REBUILD — install deps + build frontend + restart PM2
# (use after code changes without running the full installer)
# =============================================================================
phase_rebuild() {
    local app_dir="${APP_DIR:-/opt/cafeflow}"

    echo ""
    echo -e "${BOLD}${CYAN}╔═══════════════════════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}${CYAN}║        CafeFlow POS — Rebuild                         ║${RESET}"
    echo -e "${BOLD}${CYAN}╚═══════════════════════════════════════════════════════╝${RESET}"
    echo ""

    # ── POS server deps ───────────────────────────────────────────────────────
    step "POS server dependencies"
    cd "${app_dir}/pos/server"
    run_npm "Installing POS server dependencies" install --omit=dev

    # ── Database schema ───────────────────────────────────────────────────────
    step "Database schema"
    local env_file="${app_dir}/pos/.env" db_name db_user db_password
    [ -f "${env_file}" ] || fatal "pos/.env not found — cannot apply the database schema."
    db_name=$(grep -m1 '^DB_NAME=' "${env_file}" | cut -d= -f2-)
    db_user=$(grep -m1 '^DB_USER=' "${env_file}" | cut -d= -f2-)
    db_password=$(grep -m1 '^DB_PASSWORD=' "${env_file}" | cut -d= -f2-)
    [ -n "${db_name}" ] && [ -n "${db_user}" ] && [ -n "${db_password}" ] \
        || fatal "DB_NAME / DB_USER / DB_PASSWORD missing from pos/.env."
    backup_existing_db "${db_name}" "${db_user}" "${db_password}"
    info "Applying schema.sql (idempotent)..."
    apply_schema "${db_name}" "${db_user}" "${db_password}" "${app_dir}/pos/server/schema.sql" \
        && success "Database schema up to date." \
        || fatal "Schema application failed (rolled back, database unchanged). Not restarting."

    # ── POS frontend (after the schema: if the backup or schema fails, the live
    # dist/ is left untouched) ──────────────────────────────────────────────────────────
    step "POS frontend"
    cd "${app_dir}/pos"
    run_npm "Installing POS frontend dependencies (including build tools)" install
    run_npm "Building POS frontend" run build
    run_npm "Pruning POS frontend dev dependencies" prune --omit=dev

    # ── Restart PM2 processes ─────────────────────────────────────────────────
    step "Reloading PM2 processes (zero-downtime)"
    if command -v pm2 &>/dev/null; then
        pm2 reload cafeflow-pos         2>/dev/null && success "cafeflow-pos reloaded."         || warn "Could not reload cafeflow-pos — check: pm2 list"
        pm2 save 2>/dev/null || true
    else
        warn "PM2 not found — restart the app processes manually."
    fi

    echo ""
    divider
    success "Rebuild complete."
    divider
    echo ""
}

# =============================================================================
# ARGUMENT PARSING
# =============================================================================
parse_args() {
    for arg in "$@"; do
        case "${arg}" in
            --non-interactive) NON_INTERACTIVE=true ;;
            --rebuild)         REBUILD_ONLY=true ;;
            --help|-h)
                echo "Usage: sudo bash deploy.sh [--non-interactive] [--rebuild]"
                echo ""
                echo "  --non-interactive  Read config from env vars (no prompts)"
                echo "  --rebuild          Re-install deps, rebuild frontend, restart PM2"
                echo "                     (use after code changes — skips full installer)"
                echo ""
                echo "Required env vars for --non-interactive:"
                echo "  POS_DOMAIN"
                echo "  (DB_NAME, DB_USER, DB_PASSWORD, REDIS_PASSWORD, TZ are optional with defaults)"
                echo "  TLS_MODE=proxy|certbot  (default proxy: HTTPS terminated upstream, e.g. Cloudflare)"
                echo "  LETSENCRYPT_EMAIL       (required when TLS_MODE=certbot)"
                echo ""
                echo "Re-running on an existing install reuses the passwords and secrets in pos/.env."
                exit 0
                ;;
            *)
                warn "Unknown argument: ${arg} (ignored)"
                ;;
        esac
    done
}

# =============================================================================
# MAIN
# =============================================================================
REBUILD_ONLY=false

main() {
    parse_args "$@"

    if [ "${REBUILD_ONLY}" = true ]; then
        require_root
        detect_repo
        phase_rebuild
        return
    fi

    echo ""
    echo -e "${BOLD}${CYAN}╔═══════════════════════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}${CYAN}║        CafeFlow POS — Server Deploy Script            ║${RESET}"
    echo -e "${BOLD}${CYAN}╚═══════════════════════════════════════════════════════╝${RESET}"
    echo ""

    detect_repo

    phase_preflight
    phase_collect_config
    phase_packages
    phase_clone
    phase_database
    phase_app
    phase_nginx
    phase_tls
    phase_redis
    # Security restarts PostgreSQL (listen_addresses), so run it before the app
    # starts rather than cutting the app's first startup maintenance short.
    phase_security
    phase_pm2
    phase_monitoring
    phase_summary
}

main "$@"
