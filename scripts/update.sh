#!/usr/bin/env bash
# =============================================================================
# CafeFlow POS — Zero-Downtime Update Script
#
# Usage:
#   sudo bash scripts/update.sh
#
# Prerequisites:
#   - CafeFlow already installed (run deploy.sh first)
#   - PM2 running cafeflow-pos
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

# State used by rollback functions
PREV_COMMIT=""
BACKUP_FILE=""
STASH_CREATED=false
ROLLBACK_NEEDED=false

# -----------------------------------------------------------------------------
# EXPLICIT ROLLBACK FUNCTIONS
# These are called directly (no eval) when a phase fails after code was pulled.
# Each function is idempotent — safe to call even if partially completed.
# -----------------------------------------------------------------------------

rollback_code() {
    info "Reverting code to ${PREV_COMMIT}..."
    if [ -z "${PREV_COMMIT}" ]; then
        error "No previous commit recorded — cannot revert code."
        return 1
    fi
    git -C "${APP_DIR}" checkout "${PREV_COMMIT}" -- . \
        || { error "git checkout failed — manual intervention required."; return 1; }
    success "Code reverted to ${PREV_COMMIT}."
}

rollback_build() {
    info "Rebuilding previous version..."
    # Server deps first
    cd "${APP_DIR}/pos/server"
    npm install --omit=dev 2>&1 | tail -5 || true
    # Full `npm install` (not --omit=dev): vite and tsc are devDependencies
    # required by `npm run build`. Installing with --omit=dev causes build to
    # fail with "vite: not found". No prune step here — speed over purity during rollback.
    cd "${APP_DIR}/pos"
    if ! npm install 2>&1 | tail -5 || ! npm run build 2>&1 | tail -5; then
        error "Rollback build failed for POS module."
        return 1
    fi
    success "Previous version rebuilt."
}

rollback_pm2() {
    info "Reloading PM2 with previous version..."
    cd "${APP_DIR}"
    pm2 reload ecosystem.config.cjs \
        || { error "PM2 reload during rollback failed."; return 1; }
    success "PM2 reloaded with previous version."
}

rollback_stash() {
    if [ "${STASH_CREATED}" = "true" ]; then
        info "Restoring stashed local changes..."
        git -C "${APP_DIR}" stash pop 2>/dev/null || warn "Stash pop failed — check manually."
    fi
}

# run_rollback — called on EXIT when ROLLBACK_NEEDED=true
run_rollback() {
    error "Update failed. Starting rollback..."
    rollback_code    || true
    rollback_build   || true
    rollback_pm2     || true
    rollback_stash   || true
    warn "Rollback complete. Application running previous version (${PREV_COMMIT})."
    if [ -n "${BACKUP_FILE}" ]; then
        warn "Database backup available at: ${BACKUP_FILE}"
        warn "If the DB was altered, restore with:"
        warn "  gunzip -c ${BACKUP_FILE} | psql -U \$DB_USER -h localhost \$DB_NAME"
    fi
}

_on_exit() {
    local exit_code=$?
    if [ "${ROLLBACK_NEEDED}" = "true" ] && [ "${exit_code}" -ne 0 ]; then
        run_rollback
    fi
}
trap '_on_exit' EXIT

# -----------------------------------------------------------------------------
# PHASE 0: PREFLIGHT
# -----------------------------------------------------------------------------
phase_preflight() {
    step "Phase 0 — Preflight checks"

    require_root   # the pre-update backup dumps as the postgres superuser
    require_command node
    require_command npm
    require_command pm2
    require_command git
    require_command pg_dump
    require_command gzip

    check_node_version 20 || fatal "Node.js 20+ required. Current: $(node -v 2>/dev/null || echo 'none'). Node 18 is EOL."

    pm2 describe cafeflow-pos &>/dev/null \
        || fatal "cafeflow-pos not found in PM2. Run deploy.sh first."

    [ -f "${APP_DIR}/pos/.env" ] \
        || fatal "pos/.env not found. Run deploy.sh or scripts/setup-env.sh first."

    git -C "${APP_DIR}" remote -v 2>/dev/null | grep -q origin \
        || fatal "No git remote 'origin' configured. Cannot pull updates."

    success "Preflight passed."
}

# -----------------------------------------------------------------------------
# PHASE 1: DATABASE BACKUP
# -----------------------------------------------------------------------------
phase_backup() {
    step "Phase 1 — Pre-update backup"

    local db_name db_user db_password
    db_name=$(load_env_var "${APP_DIR}/pos/.env" "DB_NAME")
    db_user=$(load_env_var "${APP_DIR}/pos/.env" "DB_USER")
    db_password=$(load_env_var "${APP_DIR}/pos/.env" "DB_PASSWORD")

    [ -z "${db_name}" ]     && fatal "DB_NAME not found in pos/.env"
    [ -z "${db_user}" ]     && fatal "DB_USER not found in pos/.env"
    [ -z "${db_password}" ] && fatal "DB_PASSWORD not found in pos/.env"

    # Record current commit — verified to be a valid git object
    PREV_COMMIT=$(git -C "${APP_DIR}" rev-parse HEAD 2>/dev/null) \
        || fatal "Could not determine current git commit."
    # Verify the commit object is accessible (it should be, but be certain)
    git -C "${APP_DIR}" cat-file -e "${PREV_COMMIT}^{commit}" 2>/dev/null \
        || fatal "Commit ${PREV_COMMIT} is not accessible in git history."

    info "Current commit: $(git -C "${APP_DIR}" log --oneline -1)"

    backup_database "${db_name}" "${db_user}" "${db_password}" "pre-update"
    # BACKUP_FILE is now set by backup_database()

    success "Backup complete. Rollback registered."
}

# -----------------------------------------------------------------------------
# PHASE 2: PULL LATEST CODE
# -----------------------------------------------------------------------------
phase_pull() {
    step "Phase 2 — Pulling latest code"

    cd "${APP_DIR}"

    # Determine remote branch (supports both 'main' and 'master')
    local branch
    branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) \
        || fatal "Could not determine current branch."

    info "Fetching from origin/${branch}..."
    git fetch origin "${branch}" \
        || fatal "Failed to fetch from origin. Check network connection and git credentials."

    local remote_commit
    remote_commit=$(git rev-parse "origin/${branch}" 2>/dev/null) \
        || fatal "Could not resolve origin/${branch}."

    if [ "${PREV_COMMIT}" = "${remote_commit}" ]; then
        warn "Already up to date at $(git rev-parse --short HEAD)."
        echo ""
        read -rp "Force rebuild anyway? [y/N] " confirm
        if [[ ! "${confirm}" =~ ^[Yy]$ ]]; then
            info "Nothing to do. Exiting."
            ROLLBACK_NEEDED=false
            exit 0
        fi
        info "Force rebuild selected."
        return 0
    fi

    info "Commits to be applied:"
    git log --oneline "${PREV_COMMIT}..origin/${branch}" | head -20
    echo ""

    # Stash any local uncommitted changes (idempotent — stash name is unique)
    if ! git diff --quiet HEAD 2>/dev/null; then
        local stash_name="pre-update-stash-$(date +%Y%m%d_%H%M%S)"
        warn "Local changes detected — stashing as '${stash_name}'..."
        git stash push -m "${stash_name}" \
            || fatal "Could not stash local changes. Resolve manually before updating."
        STASH_CREATED=true
    fi

    git pull origin "${branch}" \
        || fatal "git pull failed. Resolve conflicts and re-run."

    local new_commit
    new_commit=$(git rev-parse HEAD)
    success "Updated to: $(git log --oneline -1)"

    # From this point, failures trigger rollback
    ROLLBACK_NEEDED=true
}

# -----------------------------------------------------------------------------
# PHASE 3: BUILD
# run_npm from common.sh: captures output, checks PIPESTATUS[0], calls fatal on failure.
# -----------------------------------------------------------------------------
phase_build() {
    step "Phase 3 — Building application"

    # POS server — install/update its own production dependencies
    cd "${APP_DIR}/pos/server"
    run_npm "Updating POS server dependencies" install --omit=dev

    # POS frontend
    # Full install required: vite, tsc are devDependencies needed by `npm run build`.
    # Running `--omit=dev` first then build fails with "vite: not found".
    cd "${APP_DIR}/pos"
    run_npm "Installing POS frontend dependencies (including build tools)" install
    run_npm "Building POS frontend"                                         run build
    run_npm "Pruning POS frontend dev dependencies"                         prune --omit=dev

    # Regenerate Excel templates in case new defaults were added
    local templates_script="${APP_DIR}/pos/server/scripts/generateDefaultTemplates.cjs"
    if [ -f "${templates_script}" ]; then
        info "Regenerating Excel templates..."
        node "${templates_script}" \
            && success "Templates refreshed." \
            || warn "Template generation failed — non-fatal, continuing."
    fi

    # Fix permissions on new build output
    local web_user
    detect_web_user
    web_user="${WEB_USER}"
    chown -R "${web_user}:${web_user}" \
        "${APP_DIR}/pos/dist" 2>/dev/null || true

    success "Build complete."
}

# -----------------------------------------------------------------------------
# PHASE 3b: DATABASE SCHEMA
# pos/server/schema.sql is the single, idempotent definition of the database.
# Re-applying it adds anything the new code needs and removes objects of
# retired modules. It runs in one transaction: on error nothing is changed and
# the update rolls back to the previous code. The Phase 1 backup covers the
# rest.
# -----------------------------------------------------------------------------
phase_schema() {
    step "Phase 3b — Applying database schema"

    local db_name db_user db_password
    db_name=$(load_env_var "${APP_DIR}/pos/.env" "DB_NAME")
    db_user=$(load_env_var "${APP_DIR}/pos/.env" "DB_USER")
    db_password=$(load_env_var "${APP_DIR}/pos/.env" "DB_PASSWORD")

    apply_schema "${db_name}" "${db_user}" "${db_password}" "${APP_DIR}/pos/server/schema.sql" \
        || fatal "Schema application failed (transaction rolled back; database unchanged)."

    success "Database schema up to date."
}

# -----------------------------------------------------------------------------
# PHASE 4: RELOAD (zero-downtime rolling restart)
# -----------------------------------------------------------------------------
phase_reload() {
    step "Phase 4 — Reloading application (zero-downtime)"

    cd "${APP_DIR}"

    # pm2 reload performs a rolling restart across cluster workers:
    # new instances start and begin accepting traffic before old ones are stopped.
    pm2 reload ecosystem.config.cjs \
        || fatal "PM2 reload failed. Application may be in an inconsistent state. Run: pm2 restart ecosystem.config.cjs"

    success "PM2 reload complete."
}

# -----------------------------------------------------------------------------
# PHASE 5: HEALTH VERIFICATION
# -----------------------------------------------------------------------------
phase_verify() {
    step "Phase 5 — Verifying deployment"

    local pos_port
    pos_port=$(load_env_var "${APP_DIR}/pos/.env" "PORT")
    pos_port="${pos_port:-3001}"

    info "Polling http://localhost:${pos_port}/health (6 attempts × 5s = 30s max)..."

    if wait_for_health "http://localhost:${pos_port}/health" 6 5; then
        ROLLBACK_NEEDED=false   # Disarm the rollback trap — deployment succeeded
        success "Health check passed. Deployment verified."
    else
        error "Health check failed after 30 seconds."
        error "Collecting PM2 logs for diagnosis:"
        pm2 logs cafeflow-pos --lines 30 --nostream 2>/dev/null || true
        ROLLBACK_NEEDED=true
        exit 1   # Triggers _on_exit → run_rollback
    fi
}

# -----------------------------------------------------------------------------
# PHASE 6: SUMMARY
# -----------------------------------------------------------------------------
phase_summary() {
    local new_commit
    new_commit=$(git -C "${APP_DIR}" rev-parse HEAD)
    local prev_short new_short
    prev_short=$(git -C "${APP_DIR}" rev-parse --short "${PREV_COMMIT}" 2>/dev/null || echo "${PREV_COMMIT:0:7}")
    new_short=$(git -C "${APP_DIR}" rev-parse --short "${new_commit}" 2>/dev/null || echo "${new_commit:0:7}")

    echo ""
    divider
    echo -e "  ${BOLD}${GREEN}Update Complete!${RESET}"
    divider
    echo ""
    echo "  Previous: ${prev_short}  →  New: ${new_short}"
    echo ""
    echo -e "  ${BOLD}Changes deployed:${RESET}"
    git -C "${APP_DIR}" log --oneline "${PREV_COMMIT}..HEAD" 2>/dev/null \
        | head -20 | sed 's/^/  /' || true
    echo ""
    echo -e "  ${BOLD}Backup:${RESET}  ${BACKUP_FILE}"
    echo ""
    echo -e "  ${BOLD}Manual rollback (if needed):${RESET}"
    echo "    git -C ${APP_DIR} checkout ${PREV_COMMIT} -- ."
    echo "    cd ${APP_DIR}/pos && npm run build"
    echo "    cd ${APP_DIR} && pm2 reload ecosystem.config.cjs"
    echo ""
    divider
    pm2 list 2>/dev/null || true
    echo ""
}

# -----------------------------------------------------------------------------
# MAIN
# -----------------------------------------------------------------------------
main() {
    echo ""
    echo -e "${BOLD}${CYAN}  CafeFlow POS — Update Script${RESET}"
    divider
    echo ""

    phase_preflight
    phase_backup
    phase_pull
    phase_build
    phase_schema
    phase_reload
    phase_verify
    phase_summary
}

main "$@"
