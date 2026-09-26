#!/usr/bin/env bash
# =============================================================================
# CafeFlow POS — Shared Deployment Library
# Sourced by: update.sh, setup-env.sh
#
# Requires bash 4.0+. Do NOT run with sh.
# Set strict mode in the sourcing script (set -euo pipefail), not here.
# =============================================================================

# -----------------------------------------------------------------------------
# COLOR OUTPUT
# -----------------------------------------------------------------------------
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

# -----------------------------------------------------------------------------
# INPUT VALIDATION HELPERS
# (call these early — before passing any user input to SQL, sed, or shell)
# -----------------------------------------------------------------------------

# validate_identifier <value> <label>
# Allows only alphanumeric characters and underscores (safe for SQL identifiers
# and OS usernames). Aborts if invalid.
validate_identifier() {
    local value="$1" label="${2:-identifier}"
    if [[ ! "${value}" =~ ^[a-zA-Z][a-zA-Z0-9_]{0,62}$ ]]; then
        fatal "${label} '${value}' is invalid. Use only letters, digits, and underscores (start with a letter, max 63 chars)."
    fi
}

# validate_domain <value>
# Basic RFC-1123 hostname validation.
validate_domain() {
    local domain="$1"
    if [[ ! "${domain}" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$ ]]; then
        return 1
    fi
    return 0
}

# escape_sed_replacement <value>
# Escapes characters that have meaning in a sed replacement string.
# Output is safe to use as the replacement in: sed "s/pattern/REPLACEMENT/g"
escape_sed_replacement() {
    printf '%s\n' "$1" | sed -e 's/[\/&]/\\&/g' -e 's/$/\\n/' | tr -d '\n' | sed 's/\\n$//'
}

# -----------------------------------------------------------------------------
# OS DETECTION
# -----------------------------------------------------------------------------
OS_ID=""
OS_VERSION=""

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

is_debian_family() {
    [[ "${OS_ID}" =~ ^(ubuntu|debian|linuxmint|pop)$ ]]
}

is_rhel_family() {
    [[ "${OS_ID}" =~ ^(centos|rhel|rocky|almalinux|fedora|ol)$ ]]
}

# pkg_install <package...>
pkg_install() {
    if is_debian_family; then
        DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
    elif is_rhel_family; then
        dnf install -y "$@"
    else
        fatal "Unsupported OS: ${OS_ID}. Supported: Ubuntu/Debian, CentOS/RHEL/Rocky/Alma."
    fi
}

pkg_update() {
    info "Updating package lists..."
    if is_debian_family; then
        apt-get update -y
    elif is_rhel_family; then
        dnf check-update -y || true   # exits 100 when updates available — not an error
    fi
}

# detect_web_user
# Sets WEB_USER to the system web server user (www-data, nginx, or apache).
detect_web_user() {
    local candidates=("www-data" "nginx" "apache" "www" "http")
    WEB_USER=""
    for candidate in "${candidates[@]}"; do
        if id "${candidate}" &>/dev/null; then
            WEB_USER="${candidate}"
            return 0
        fi
    done
    # Fallback: create www-data if nothing found
    warn "No standard web user found. Creating www-data..."
    useradd --system --no-create-home --shell /usr/sbin/nologin www-data 2>/dev/null || true
    WEB_USER="www-data"
}

# -----------------------------------------------------------------------------
# PREREQUISITE CHECKS
# -----------------------------------------------------------------------------
require_root() {
    [ "$(id -u)" -eq 0 ] || fatal "This script must be run as root (sudo)."
}

require_command() {
    command -v "$1" &>/dev/null || fatal "Required command not found: $1. Please install it first."
}

# check_node_version <min_major>
# Returns 0 if installed and meets minimum, 1 if not installed or too old.
check_node_version() {
    local min_major="${1:-18}"
    command -v node &>/dev/null || return 1

    local version_output current_major
    version_output=$(node -e "process.stdout.write(process.version)" 2>/dev/null) || return 1
    # Extract major version number from "v18.12.0"
    if [[ "${version_output}" =~ ^v([0-9]+) ]]; then
        current_major="${BASH_REMATCH[1]}"
    else
        warn "Could not parse Node.js version: ${version_output}"
        return 1
    fi
    [ "${current_major}" -ge "${min_major}" ]
}

check_postgres_running() {
    # Supports 'postgresql' (Debian) and 'postgresql-14' (RHEL)
    if systemctl is-active --quiet postgresql 2>/dev/null; then
        return 0
    elif systemctl is-active --quiet postgresql-14 2>/dev/null; then
        return 0
    else
        fatal "PostgreSQL is not running. Start it with: systemctl start postgresql"
    fi
}

check_redis_running() {
    if systemctl is-active --quiet redis 2>/dev/null || \
       systemctl is-active --quiet redis-server 2>/dev/null; then
        return 0
    else
        warn "Redis is not running (optional but recommended for clustering)."
        return 1
    fi
}

# check_disk_space <required_gb> [path]
check_disk_space() {
    local required_gb="${1:-20}"
    local path="${2:-/var}"
    local available_gb
    available_gb=$(df -BG "${path}" 2>/dev/null | awk 'NR==2 {gsub("G",""); print $4}') || return 0
    if [ -n "${available_gb}" ] && [ "${available_gb}" -lt "${required_gb}" ]; then
        warn "Low disk space: ${available_gb}GB available at ${path}, ${required_gb}GB recommended."
    fi
}

# check_ram_mb <warn_below_mb>
check_ram_mb() {
    local warn_below="${1:-2048}"
    local total_mb
    total_mb=$(awk '/MemTotal/ {printf "%.0f", $2/1024}' /proc/meminfo 2>/dev/null) || return 0
    if [ -n "${total_mb}" ] && [ "${total_mb}" -lt "${warn_below}" ]; then
        warn "Low RAM: ${total_mb}MB detected, ${warn_below}MB recommended."
    fi
}

# -----------------------------------------------------------------------------
# IDEMPOTENCY HELPERS
# Use psql's :'varname' quoting to safely pass values — prevents SQL injection.
# The :' ' syntax quotes the value as a SQL string literal, escaping single quotes.
# psql only interpolates variables in stdin/-f input (not in -c strings), so the
# queries are piped in.
# -----------------------------------------------------------------------------

# postgres_user_exists <username>
postgres_user_exists() {
    local username="$1"
    local result
    result=$(echo "SELECT 1 FROM pg_roles WHERE rolname = :'rolname'" \
        | sudo -u postgres psql -X -tA -v "rolname=${username}" 2>/dev/null) || return 1
    [ "${result}" = "1" ]
}

# postgres_db_exists <dbname>
postgres_db_exists() {
    local dbname="$1"
    local result
    result=$(echo "SELECT 1 FROM pg_database WHERE datname = :'dbname'" \
        | sudo -u postgres psql -X -tA -v "dbname=${dbname}" 2>/dev/null) || return 1
    [ "${result}" = "1" ]
}

# postgres_table_exists <db> <user> <password> <table>
postgres_table_exists() {
    local db="$1" user="$2" password="$3" table="$4"
    local result tmp_pgpass
    tmp_pgpass=$(mktemp); chmod 600 "${tmp_pgpass}"
    write_pgpass "localhost" "5432" "${db}" "${user}" "${password}" "${tmp_pgpass}"
    result=$(echo "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = :'tname'" \
        | PGPASSFILE="${tmp_pgpass}" psql -X -U "${user}" -h localhost -d "${db}" -tA \
            -v "tname=${table}" 2>/dev/null)
    rm -f "${tmp_pgpass}"
    [ "${result}" = "1" ]
}

# apply_schema <db> <user> <password> <schema_file>
# Applies pos/server/schema.sql as the application role in a single transaction
# (any error rolls the whole file back). schema.sql is idempotent: it creates
# what is missing and brings an existing database up to date, so it is safe to
# run on every update. Password goes through a temp .pgpass, never argv/env.
apply_schema() {
    local db="$1" user="$2" password="$3" schema_file="$4"
    local tmp_pgpass rc=0
    [ -f "${schema_file}" ] || { error "Schema file not found: ${schema_file}"; return 1; }
    tmp_pgpass=$(mktemp); chmod 600 "${tmp_pgpass}"
    write_pgpass "localhost" "5432" "${db}" "${user}" "${password}" "${tmp_pgpass}"
    PGPASSFILE="${tmp_pgpass}" psql -X -q -v ON_ERROR_STOP=1 --single-transaction \
        -U "${user}" -h localhost -d "${db}" -f "${schema_file}" || rc=$?
    rm -f "${tmp_pgpass}"
    return "${rc}"
}

# ensure_symlink <src> <dest>
# Atomically creates or replaces a symlink. Thread-safe.
ensure_symlink() {
    local src="$1" dest="$2"
    ln -sfn "${src}" "${dest}"
}

service_enable_start() {
    local svc="$1"
    systemctl enable --now "${svc}"
}

# -----------------------------------------------------------------------------
# SECRET GENERATION
# -----------------------------------------------------------------------------
generate_secret() {
    openssl rand -base64 48 | tr -d '\n/+'
}

# write_pgpass <host> <port> <db> <user> <password> <file>
# Writes a .pgpass entry safely (no password in environment/process list).
write_pgpass() {
    local host="$1" port="$2" db="$3" user="$4" password="$5"
    local pgpass_file="${6:-${HOME}/.pgpass}"
    # Escape colons and backslashes in the password per .pgpass format
    local escaped_pass
    escaped_pass=$(printf '%s' "${password}" | sed 's/\\/\\\\/g; s/:/\\:/g')
    printf '%s:%s:%s:%s:%s\n' "${host}" "${port}" "${db}" "${user}" "${escaped_pass}" \
        >> "${pgpass_file}"
    chmod 600 "${pgpass_file}"
}

# -----------------------------------------------------------------------------
# INTERACTIVE INPUT HELPERS
# -----------------------------------------------------------------------------

# read_with_default <var_name> <prompt> <default>
read_with_default() {
    local var_name="$1"
    local prompt="$2"
    local default="$3"
    local value

    if [ -n "${default}" ]; then
        read -rp "  ${prompt} [${default}]: " value
    else
        read -rp "  ${prompt}: " value
    fi

    if [ -z "${value}" ]; then
        value="${default}"
    fi

    printf -v "${var_name}" '%s' "${value}"
}

# read_secret <var_name> <prompt>
read_secret() {
    local var_name="$1"
    local prompt="$2"
    local value

    read -rsp "  ${prompt}: " value
    echo ""
    printf -v "${var_name}" '%s' "${value}"
}

# read_secret_validated <var_name> <prompt> <min_length>
read_secret_validated() {
    local var_name="$1"
    local prompt="$2"
    local min_len="${3:-32}"
    local value

    while true; do
        read -rsp "  ${prompt} (min ${min_len} chars): " value
        echo ""
        if [ "${#value}" -ge "${min_len}" ]; then
            break
        fi
        warn "Too short (${#value} chars). Must be at least ${min_len} characters."
    done

    printf -v "${var_name}" '%s' "${value}"
}

# validate_timezone <tz_string>
validate_timezone() {
    local tz="$1"
    [ -f "/usr/share/zoneinfo/${tz}" ]
}

# prompt_timezone <var_name> <default>
# Loops until a valid IANA timezone is entered. Does not allow bypassing.
prompt_timezone() {
    local var_name="$1"
    local default="${2:-Asia/Kathmandu}"
    local tz

    while true; do
        read_with_default tz "Timezone (IANA format, e.g. Asia/Kathmandu, UTC)" "${default}"
        if validate_timezone "${tz}"; then
            break
        fi
        warn "Timezone '${tz}' is not valid (not found in /usr/share/zoneinfo/)."
        warn "See: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones"
    done

    printf -v "${var_name}" '%s' "${tz}"
}

# prompt_domain <var_name> <label> <default>
# Loops until a valid domain name is entered.
prompt_domain() {
    local var_name="$1"
    local label="$2"
    local default="${3:-}"
    local value

    while true; do
        read_with_default value "${label}" "${default}"
        if [ -z "${value}" ]; then
            warn "Domain cannot be empty."
            continue
        fi
        if validate_domain "${value}"; then
            break
        fi
        warn "'${value}' is not a valid domain name. Example: pos.example.com"
    done

    printf -v "${var_name}" '%s' "${value}"
}

# -----------------------------------------------------------------------------
# BACKUP UTILITIES
# -----------------------------------------------------------------------------
BACKUP_DIR="/var/backups/cafeflow"
BACKUP_FILE=""   # Set by backup_database()

ensure_backup_dir() {
    mkdir -p "${BACKUP_DIR}" || fatal "Cannot create backup directory: ${BACKUP_DIR}"
    [ -w "${BACKUP_DIR}" ]   || fatal "Backup directory is not writable: ${BACKUP_DIR}"
}

# backup_database <db_name> <db_user> <db_password> <label>
# Dumps as the postgres superuser (requires root): the app role cannot pg_dump
# tables with FORCE ROW LEVEL SECURITY, so an app-role dump always fails.
# <db_user> and <db_password> are accepted for call-site compatibility but unused.
backup_database() {
    local db_name="$1"
    local label="${4:-backup}"
    local timestamp
    timestamp=$(date +%Y%m%d_%H%M%S)

    ensure_backup_dir
    BACKUP_FILE="${BACKUP_DIR}/${label}_${timestamp}.sql.gz"

    info "Backing up database '${db_name}' → ${BACKUP_FILE}..."
    if runuser -u postgres -- pg_dump "${db_name}" | gzip > "${BACKUP_FILE}"; then
        chmod 600 "${BACKUP_FILE}"
        success "Database backup complete: ${BACKUP_FILE}"
    else
        rm -f "${BACKUP_FILE}"
        fatal "Database backup failed for '${db_name}'. Check that PostgreSQL is running and this script runs as root."
    fi
}

# -----------------------------------------------------------------------------
# MISC UTILITIES
# -----------------------------------------------------------------------------

# get_package_version <package_json_path>
get_package_version() {
    node -e "const p=require('$1');process.stdout.write(p.version)" 2>/dev/null || echo "unknown"
}

# run_npm <label> <...npm args>
# Runs npm, streams output live via tee, and calls fatal on failure.
#
# WHY NOT `npm | tee | tail`: A 3-stage pipeline with set -o pipefail means
# that when npm fails (exit 1), pipefail makes the whole pipeline exit 1, so
# `if <pipeline>` is false and the PIPESTATUS[0] check inside the if-body is
# never reached — npm failures are silently ignored. Using a 2-stage pipeline
# (`npm | tee`) with `if !` directly tests the pipeline's exit code correctly.
run_npm() {
    local label="$1"; shift
    local log_file
    log_file=$(mktemp /tmp/cafeflow-npm-XXXXXX.log)

    info "${label}..."
    if ! npm "$@" 2>&1 | tee "${log_file}"; then
        error "npm $* failed. Full output:"
        cat "${log_file}" >&2
        rm -f "${log_file}"
        fatal "${label} failed."
    fi
    rm -f "${log_file}"
    success "${label} done."
}

# wait_for_health <url> <max_attempts> <sleep_seconds>
# Returns 0 on first successful health response, 1 on timeout.
wait_for_health() {
    local url="$1"
    local max_attempts="${2:-6}"
    local sleep_sec="${3:-5}"

    for ((i=1; i<=max_attempts; i++)); do
        local response
        response=$(curl -sf --max-time 5 "${url}" 2>/dev/null) || true
        if echo "${response}" | grep -q '"status"'; then
            return 0
        fi
        info "Health check attempt ${i}/${max_attempts} — waiting ${sleep_sec}s..."
        sleep "${sleep_sec}"
    done
    return 1
}

# load_env_var <env_file> <var_name>
# Safely extracts a variable value from a .env file.
# Uses fixed-string matching (-F) to prevent regex injection.
load_env_var() {
    local env_file="$1"
    local var_name="$2"
    local line=""
    [ -f "${env_file}" ] || return 1
    # A missing key prints nothing and succeeds (callers test for empty), so it
    # cannot abort a `set -euo pipefail` script from inside $(...).
    line=$(grep -E "^${var_name}=" "${env_file}" 2>/dev/null | head -1) || true
    line="${line#*=}"
    printf '%s\n' "${line//\'/}"
}
