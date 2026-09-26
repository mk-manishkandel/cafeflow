#!/usr/bin/env bash
# =============================================================================
# CafeFlow POS — Environment Configuration Generator
#
# Usage (interactive):
#   bash scripts/setup-env.sh
#
# Usage (non-interactive):
#   bash scripts/setup-env.sh --non-interactive \
#     --pos-domain pos.example.com \
#     --db-host localhost --db-port 5432 \
#     --db-name cafeflow --db-user cafeflow_user --db-password SECRET \
#     --db-pool-max 80 \
#     --jwt-secret SECRET --refresh-secret SECRET --enc-secret SECRET \
#     --port 3001 --tz Asia/Kathmandu \
#     --redis-url redis://:PASS@localhost:6379 \
#     --log-level info \
#     [--student-order-origin https://order.example.com]
#
# Existing pos/.env: DB_ENCRYPTION_SECRET and DB_ENCRYPTION_SALT are kept as
# they are — replacing them makes every encrypted value in the database (e.g.
# the SMTP password) unreadable. Pass --rotate-encryption-key to override.
# Keys this script does not manage (SMTP_*, STUDENT_CLIENT_SECRET, ...) are
# carried over, and the previous file is saved as pos/.env.bak.<timestamp>.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

# -----------------------------------------------------------------------------
# DEFAULTS
# -----------------------------------------------------------------------------
NON_INTERACTIVE=false

POS_DOMAIN=""
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="cafeflow"
DB_USER="cafeflow_user"
DB_PASSWORD=""
DB_POOL_MAX="80"
JWT_SECRET=""
REFRESH_TOKEN_SECRET=""
DB_ENCRYPTION_SECRET=""
DB_ENCRYPTION_SALT=""
ROTATE_ENCRYPTION_KEY=false
KEEP_ENCRYPTION=false      # set when an existing secret is preserved
POS_PORT="3001"
TZ="Asia/Kathmandu"
REDIS_URL="redis://localhost:6379"
GEMINI_API_KEY=""
STUDENT_ORDER_ALLOWED_ORIGIN=""
LOG_LEVEL="info"
CORS_ORIGIN=""

# Keys written by write_pos_env (anything else in an existing .env is carried
# over) and obsolete keys that are dropped.
MANAGED_KEYS="PORT NODE_ENV CORS_ORIGIN FRONTEND_URL DB_USER DB_HOST DB_NAME DB_PASSWORD DB_PORT DB_POOL_MAX JWT_SECRET REFRESH_TOKEN_SECRET DB_ENCRYPTION_SECRET DB_ENCRYPTION_SALT REDIS_URL TZ VITE_APP_TIMEZONE STUDENT_ORDER_ALLOWED_ORIGIN LOG_LEVEL GEMINI_API_KEY"
OBSOLETE_KEYS="Address WEBHOOK_URL VITE_ALLOWED_HOSTS"

# -----------------------------------------------------------------------------
# ARGUMENT PARSING (non-interactive mode)
# -----------------------------------------------------------------------------
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --non-interactive)   NON_INTERACTIVE=true ;;
            --pos-domain)        POS_DOMAIN="$2";     shift ;;
            --db-host)           DB_HOST="$2";        shift ;;
            --db-port)           DB_PORT="$2";        shift ;;
            --db-name)           DB_NAME="$2";        shift ;;
            --db-user)           DB_USER="$2";        shift ;;
            --db-password)       DB_PASSWORD="$2";    shift ;;
            --db-pool-max)       DB_POOL_MAX="$2";    shift ;;
            --jwt-secret)        JWT_SECRET="$2";     shift ;;
            --refresh-secret)    REFRESH_TOKEN_SECRET="$2"; shift ;;
            --enc-secret)        DB_ENCRYPTION_SECRET="$2"; shift ;;
            --enc-salt)          DB_ENCRYPTION_SALT="$2"; shift ;;
            --rotate-encryption-key) ROTATE_ENCRYPTION_KEY=true ;;
            --student-order-origin)  STUDENT_ORDER_ALLOWED_ORIGIN="$2"; shift ;;
            --port)              POS_PORT="$2";       shift ;;
            --tz)                TZ="$2";             shift ;;
            --redis-url)         REDIS_URL="$2";      shift ;;
            --gemini-key)        GEMINI_API_KEY="$2"; shift ;;
            --log-level)         LOG_LEVEL="$2";      shift ;;
            *)                   fatal "Unknown argument: $1" ;;
        esac
        shift
    done
}

# -----------------------------------------------------------------------------
# INTERACTIVE MODE: PROMPTS
# -----------------------------------------------------------------------------
prompt_domains() {
    step "Domain Names"
    warn "These must be real DNS-resolvable domains (required for Nginx + SSL)."
    echo ""

    # Load existing values from .env as defaults
    local current_pos=""
    [ -f "${APP_DIR}/pos/.env" ] && \
        current_pos=$(load_env_var "${APP_DIR}/pos/.env" "FRONTEND_URL" | sed -E 's|^https?://||; s|/.*$||')

    prompt_domain POS_DOMAIN "POS admin domain (e.g. pos.example.com)"    "${current_pos}"
}

prompt_database() {
    step "Database Configuration"

    local env_file="${APP_DIR}/pos/.env"
    local cur_host="" cur_port="" cur_name="" cur_user="" cur_pool=""
    if [ -f "${env_file}" ]; then
        cur_host=$(load_env_var "${env_file}" "DB_HOST")
        cur_port=$(load_env_var "${env_file}" "DB_PORT")
        cur_name=$(load_env_var "${env_file}" "DB_NAME")
        cur_user=$(load_env_var "${env_file}" "DB_USER")
        cur_pool=$(load_env_var "${env_file}" "DB_POOL_MAX")
        warn "Existing pos/.env found — showing current values as defaults."
    fi

    read_with_default DB_HOST "Database host"  "${cur_host:-localhost}"
    read_with_default DB_PORT "Database port"  "${cur_port:-5432}"

    local raw_name raw_user
    read_with_default raw_name "Database name" "${cur_name:-cafeflow}"
    read_with_default raw_user "Database user" "${cur_user:-cafeflow_user}"
    validate_identifier "${raw_name}" "Database name"
    validate_identifier "${raw_user}" "Database user"
    DB_NAME="${raw_name}"
    DB_USER="${raw_user}"

    # Validate DB_POOL_MAX is a positive integer
    while true; do
        read_with_default DB_POOL_MAX "Max DB pool connections (keep below PostgreSQL max_connections)" "${cur_pool:-80}"
        [[ "${DB_POOL_MAX}" =~ ^[1-9][0-9]*$ ]] && break
        warn "Must be a positive integer (e.g. 100)."
    done

    echo ""
    read -rsp "  Database password (leave blank to auto-generate): " DB_PASSWORD
    echo ""
    if [ -z "${DB_PASSWORD}" ]; then
        DB_PASSWORD="$(generate_secret | head -c 32)"
        success "Auto-generated DB password."
    fi
}

prompt_secrets() {
    step "Security Secrets"
    warn "Each secret must be UNIQUE and at least 32 characters."
    echo ""

    read -rp "  Auto-generate all secrets? [Y/n]: " auto_gen
    if [[ ! "${auto_gen}" =~ ^[Nn]$ ]]; then
        JWT_SECRET="$(generate_secret)"
        REFRESH_TOKEN_SECRET="$(generate_secret)"
        DB_ENCRYPTION_SECRET="$(generate_secret)"
        # Guarantee uniqueness
        while [ "${JWT_SECRET}" = "${REFRESH_TOKEN_SECRET}" ]; do
            REFRESH_TOKEN_SECRET="$(generate_secret)"
        done
        while [ "${DB_ENCRYPTION_SECRET}" = "${JWT_SECRET}" ] || \
              [ "${DB_ENCRYPTION_SECRET}" = "${REFRESH_TOKEN_SECRET}" ]; do
            DB_ENCRYPTION_SECRET="$(generate_secret)"
        done
        DB_ENCRYPTION_SALT="$(openssl rand -hex 16)"
        success "Secrets auto-generated."
    else
        warn "Secrets will be stored in .env — keep the file safe."
        read_secret_validated JWT_SECRET           "JWT access token secret"    32
        read_secret_validated REFRESH_TOKEN_SECRET "JWT refresh token secret"   32
        read_secret_validated DB_ENCRYPTION_SECRET "DB encryption secret"       32

        if [ "${JWT_SECRET}" = "${REFRESH_TOKEN_SECRET}" ]; then
            fatal "JWT_SECRET and REFRESH_TOKEN_SECRET must be different."
        fi
    fi
}

prompt_app_settings() {
    step "Application Settings"

    # Validate port numbers
    while true; do
        read_with_default POS_PORT "POS server port" "3001"
        [[ "${POS_PORT}" =~ ^[1-9][0-9]{1,4}$ ]] && [ "${POS_PORT}" -le 65535 ] && break
        warn "Invalid port number."
    done

    # Timezone — no bypass allowed
    prompt_timezone TZ "${TZ}"

    local cors_default="https://${POS_DOMAIN}"
    read_with_default CORS_ORIGIN "Allowed CORS origins (comma-separated)" "${cors_default}"

    echo ""
    # Build Redis URL with URL-encoded password to handle special chars
    local redis_pass=""
    read -rsp "  Redis password (leave blank if Redis has no auth): " redis_pass
    echo ""
    if [ -n "${redis_pass}" ]; then
        # URL-encode the password: replace special URL chars
        # Using node for reliable encoding (already a dependency)
        local encoded_pass
        encoded_pass=$(node -e "process.stdout.write(encodeURIComponent('${redis_pass/\'/\\\'}'))" 2>/dev/null) \
            || encoded_pass="${redis_pass}"   # fallback: use as-is (may break if special chars present)
        REDIS_URL="redis://:${encoded_pass}@localhost:6379"
    else
        read_with_default REDIS_URL "Redis URL" "redis://localhost:6379"
    fi
}

prompt_optional() {
    step "Optional Settings"
    info "Press Enter to skip any optional setting."
    echo ""

    read -rp "  GEMINI_API_KEY (for AI features):  " GEMINI_API_KEY

    local cur_student=""
    [ -f "${APP_DIR}/pos/.env" ] && \
        cur_student=$(load_env_var "${APP_DIR}/pos/.env" "STUDENT_ORDER_ALLOWED_ORIGIN")
    info "Student ordering app origin (e.g. https://order.example.com); empty keeps"
    info "the /api/public/student-* endpoints disabled. Add it to CORS origins too."
    read_with_default STUDENT_ORDER_ALLOWED_ORIGIN "STUDENT_ORDER_ALLOWED_ORIGIN" "${cur_student}"

    read_with_default LOG_LEVEL "Log level (error/warn/info/debug)" "info"
}

# -----------------------------------------------------------------------------
# ENCRYPTION KEY PROTECTION
# An existing DB_ENCRYPTION_SECRET / DB_ENCRYPTION_SALT is kept unless
# --rotate-encryption-key is given: data encrypted with the old key would
# otherwise become unreadable. A missing salt on an existing install stays
# missing (the server then derives it from the secret, as it did before).
# -----------------------------------------------------------------------------
preserve_encryption_key() {
    local env_file="${APP_DIR}/pos/.env"
    [ -f "${env_file}" ] || return 0

    local cur_secret cur_salt
    cur_secret=$(load_env_var "${env_file}" "DB_ENCRYPTION_SECRET")
    cur_salt=$(load_env_var "${env_file}" "DB_ENCRYPTION_SALT")
    [ -n "${cur_secret}" ] || return 0

    if [ "${ROTATE_ENCRYPTION_KEY}" = "true" ]; then
        warn "--rotate-encryption-key: replacing DB_ENCRYPTION_SECRET/SALT."
        warn "Values encrypted with the old key (e.g. SMTP password) must be re-entered."
        return 0
    fi

    if [ "${NON_INTERACTIVE}" = "true" ]; then
        if [ -n "${DB_ENCRYPTION_SECRET}" ] && [ "${DB_ENCRYPTION_SECRET}" != "${cur_secret}" ]; then
            fatal "pos/.env already has a different DB_ENCRYPTION_SECRET. Refusing to replace it (pass --rotate-encryption-key to force)."
        fi
        if [ -n "${DB_ENCRYPTION_SALT}" ] && [ "${DB_ENCRYPTION_SALT}" != "${cur_salt}" ]; then
            fatal "DB_ENCRYPTION_SALT differs from the one in pos/.env (or it has none). Refusing to change it (pass --rotate-encryption-key to force)."
        fi
    fi

    DB_ENCRYPTION_SECRET="${cur_secret}"
    DB_ENCRYPTION_SALT="${cur_salt}"
    KEEP_ENCRYPTION=true
    info "Keeping the existing DB_ENCRYPTION_SECRET${cur_salt:+ and DB_ENCRYPTION_SALT} from pos/.env."
}

# -----------------------------------------------------------------------------
# VALIDATION (applied in both interactive and non-interactive modes)
# -----------------------------------------------------------------------------
validate_config() {
    local errors=0

    # Domain validation
    [ -z "${POS_DOMAIN}" ] && error "POS domain is required." && ((errors++)) || true
    if [ -n "${POS_DOMAIN}" ] && ! validate_domain "${POS_DOMAIN}"; then
        error "POS domain '${POS_DOMAIN}' is not a valid domain name." && ((errors++)) || true
    fi

    # Database validation
    [ -z "${DB_PASSWORD}" ] && error "Database password is required." && ((errors++)) || true
    if [ -n "${DB_NAME}" ]; then
        validate_identifier "${DB_NAME}" "Database name" 2>/dev/null || ((errors++)) || true
    fi
    if [ -n "${DB_USER}" ]; then
        validate_identifier "${DB_USER}" "Database user" 2>/dev/null || ((errors++)) || true
    fi
    [[ "${DB_POOL_MAX}" =~ ^[1-9][0-9]*$ ]] \
        || { error "DB_POOL_MAX must be a positive integer."; ((errors++)) || true; }

    # Port validation
    [[ "${POS_PORT}" =~ ^[1-9][0-9]{1,4}$ ]] && [ "${POS_PORT}" -le 65535 ] \
        || { error "POS_PORT '${POS_PORT}' is invalid."; ((errors++)) || true; }

    # Secret validation
    [ "${#JWT_SECRET}" -lt 32 ] && \
        error "JWT_SECRET too short (${#JWT_SECRET} chars, min 32)." && ((errors++)) || true
    [ "${#REFRESH_TOKEN_SECRET}" -lt 32 ] && \
        error "REFRESH_TOKEN_SECRET too short." && ((errors++)) || true
    [ "${#DB_ENCRYPTION_SECRET}" -lt 32 ] && \
        error "DB_ENCRYPTION_SECRET too short." && ((errors++)) || true
    [ "${JWT_SECRET}" = "${REFRESH_TOKEN_SECRET}" ] && \
        error "JWT_SECRET and REFRESH_TOKEN_SECRET must be different." && ((errors++)) || true
    # New installs (and explicit rotations) get an independent salt.
    if [ "${KEEP_ENCRYPTION}" != "true" ] && [ -z "${DB_ENCRYPTION_SALT}" ]; then
        DB_ENCRYPTION_SALT="$(openssl rand -hex 16)"
    fi
    if [ -n "${DB_ENCRYPTION_SALT}" ] && [ "${DB_ENCRYPTION_SALT}" = "${DB_ENCRYPTION_SECRET}" ]; then
        error "DB_ENCRYPTION_SALT must differ from DB_ENCRYPTION_SECRET." && ((errors++)) || true
    fi

    # Timezone validation
    validate_timezone "${TZ}" \
        || { error "Timezone '${TZ}' is invalid (not in /usr/share/zoneinfo/)."; ((errors++)) || true; }

    [ "${errors}" -gt 0 ] && fatal "${errors} validation error(s) above. Aborting."
    return 0
}

# -----------------------------------------------------------------------------
# WRITE .ENV FILES
# Files are written to a restricted temp file first, then atomically moved.
# The temp file has 600 permissions before any secrets are written to it.
# -----------------------------------------------------------------------------
write_pos_env() {
    local env_file="${APP_DIR}/pos/.env"

    # Create temp file with restricted permissions BEFORE writing any secrets
    local tmp_file
    tmp_file=$(mktemp)
    chmod 600 "${tmp_file}"

    cat > "${tmp_file}" << EOF
# CafeFlow POS — Environment Configuration
# Generated by setup-env.sh on $(date)
# WARNING: Do NOT commit this file to version control.
# File permissions: 600 (root-readable only)

# ── Server ──────────────────────────────────────────────────────────────────
PORT=${POS_PORT}
NODE_ENV=production

# ── CORS ────────────────────────────────────────────────────────────────────
CORS_ORIGIN=${CORS_ORIGIN}

# ── Database ────────────────────────────────────────────────────────────────
DB_USER=${DB_USER}
DB_HOST=${DB_HOST}
DB_NAME=${DB_NAME}
DB_PASSWORD=${DB_PASSWORD}
DB_PORT=${DB_PORT}
DB_POOL_MAX=${DB_POOL_MAX}

# ── Security Secrets ────────────────────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
REFRESH_TOKEN_SECRET=${REFRESH_TOKEN_SECRET}
DB_ENCRYPTION_SECRET=${DB_ENCRYPTION_SECRET}
DB_ENCRYPTION_SALT=${DB_ENCRYPTION_SALT}

# ── Redis Cache ─────────────────────────────────────────────────────────────
REDIS_URL=${REDIS_URL}

# ── Timezone ────────────────────────────────────────────────────────────────
TZ=${TZ}
VITE_APP_TIMEZONE=${TZ}

# ── Application URL ─────────────────────────────────────────────────────────
FRONTEND_URL=https://${POS_DOMAIN}

# ── Student ordering app (empty = disabled) ─────────────────────────────────
STUDENT_ORDER_ALLOWED_ORIGIN=${STUDENT_ORDER_ALLOWED_ORIGIN}

# ── Logging ─────────────────────────────────────────────────────────────────
LOG_LEVEL=${LOG_LEVEL}
EOF

    [ -n "${GEMINI_API_KEY}" ] && cat >> "${tmp_file}" << EOF

# ── AI Service ──────────────────────────────────────────────────────────────
GEMINI_API_KEY=${GEMINI_API_KEY}
EOF

    # A kept install without a salt must stay without one (see above).
    [ -n "${DB_ENCRYPTION_SALT}" ] || sed -i '/^DB_ENCRYPTION_SALT=$/d' "${tmp_file}"

    # Carry over keys from an existing .env that this script does not manage
    # (SMTP_*, STUDENT_CLIENT_SECRET, ...); drop obsolete ones.
    if [ -f "${env_file}" ]; then
        local carried line key backup
        carried=$(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "${env_file}" | while IFS= read -r line; do
            key="${line%%=*}"
            case " ${MANAGED_KEYS} ${OBSOLETE_KEYS} " in
                *" ${key} "*) ;;
                *) printf '%s\n' "${line}" ;;
            esac
        done)
        if [ -n "${carried}" ]; then
            printf '\n# ── Carried over from the previous pos/.env ─────────────────────────────────\n%s\n' \
                "${carried}" >> "${tmp_file}"
        fi
        backup="${env_file}.bak.$(date +%Y%m%d_%H%M%S)"
        cp -p "${env_file}" "${backup}" && chmod 600 "${backup}"
        info "Previous pos/.env saved as ${backup}"
    fi

    # Atomic move — permissions (600) are already set on the temp file
    mv "${tmp_file}" "${env_file}"
    # Verify final permissions
    chmod 600 "${env_file}"

    success "Written: pos/.env  (chmod 600)"
    warn "IMPORTANT: Never commit this file to version control."
}

# -----------------------------------------------------------------------------
# MAIN
# -----------------------------------------------------------------------------
main() {
    parse_args "$@"

    if [ "${NON_INTERACTIVE}" = "false" ]; then
        echo ""
        echo -e "${BOLD}${CYAN}  CafeFlow POS — Environment Setup${RESET}"
        divider
        echo ""

        prompt_domains
        prompt_database
        prompt_secrets
        prompt_app_settings
        prompt_optional

        echo ""
        divider
        info "Configuration summary:"
        echo "  POS Domain:    ${POS_DOMAIN}"
        echo "  Database:      ${DB_NAME} @ ${DB_HOST}:${DB_PORT} (user: ${DB_USER})"
        echo "  Timezone:      ${TZ}"
        echo "  POS Port:      ${POS_PORT}"
        divider
        echo ""
        read -rp "Write pos/.env now? [Y/n]: " confirm
        [[ "${confirm}" =~ ^[Nn]$ ]] && { info "Aborted. No files written."; exit 0; }
    fi

    # Derive CORS if not already set (non-interactive may not have passed it)
    : "${CORS_ORIGIN:=https://${POS_DOMAIN}}"

    preserve_encryption_key
    validate_config

    write_pos_env

    if [ "${NON_INTERACTIVE}" = "false" ]; then
        echo ""
        success "Environment file written."
        info "Next: rebuild the app  →  npm run build  (in pos/)"
        info "Then: pm2 reload ecosystem.config.cjs"
    fi
}

main "$@"
