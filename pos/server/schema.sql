-- =============================================================================
-- CafeFlow POS - Database Schema
-- =============================================================================
-- The single authoritative definition of the CafeFlow database.
--
--   Fresh install:   psql -v ON_ERROR_STOP=1 --single-transaction -f schema.sql
--   Existing install: the same command. Every statement is idempotent, so the
--                    file can be re-applied on every deploy/update. On an existing
--                    database it only adds what is missing and removes objects
--                    belonging to retired modules (section 2).
--
-- Apply as the application's database role (the database owner) so that every
-- object is owned by that role. Requires PostgreSQL 13+.
--
-- Sections
--   1.  Session settings and preflight checks
--   2.  Retired modules (existing installs only; no-op on a fresh database)
--   3.  Extensions
--   4.  Tables
--   5.  Partitions
--   6.  Constraint reconciliation (existing installs only)
--   7.  Indexes
--   8.  Functions
--   9.  Triggers
--   10. Materialized views
--   11. Row-level security
--   12. Seed data
--   13. Data reconciliation (existing installs only)
-- =============================================================================


-- =============================================================================
-- 1. SESSION SETTINGS AND PREFLIGHT CHECKS
-- =============================================================================

SET client_min_messages = warning;
-- Fail fast instead of queueing behind live traffic when re-applied on a
-- running system; the caller can simply retry.
SET lock_timeout = '30s';

DO $$
BEGIN
    IF current_setting('server_version_num')::int < 130000 THEN
        RAISE EXCEPTION 'CafeFlow requires PostgreSQL 13 or newer (found %)',
            current_setting('server_version');
    END IF;

    -- consumers.id and staff.id are UUIDs. A database that still has the old
    -- integer/varchar keys must be converted before this file is applied.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND ((table_name = 'consumers' AND column_name = 'id')
            OR (table_name = 'staff'     AND column_name = 'id'))
          AND data_type <> 'uuid'
    ) THEN
        RAISE EXCEPTION 'consumers.id / staff.id are not UUID columns; convert the legacy database before applying schema.sql';
    END IF;
END $$;


-- =============================================================================
-- 2. RETIRED MODULES (existing installs only)
-- =============================================================================
-- Inventory, coupons, table orders, custom Excel report templates, dynamic QR /
-- storefront checkout, configurable branding and self-service activity logs
-- have been removed from the application. Drop their objects if an older database still has them.
-- DESTRUCTIVE for those modules' rows (update.sh takes a pg_dump first).
-- Historical revenue stays in `transactions` untouched.

DROP TABLE IF EXISTS asset_incidents;
DROP TABLE IF EXISTS inventory_history;
DROP TABLE IF EXISTS stock_transfers;
DROP TABLE IF EXISTS inventory_ledger;          -- partitioned: drops all partitions
DROP TABLE IF EXISTS inventory_batches;
DROP TABLE IF EXISTS inventory_items;
DROP FUNCTION IF EXISTS trg_inventory_ledger_fk_check();

DROP INDEX IF EXISTS idx_transactions_coupon_id;
ALTER TABLE IF EXISTS transactions DROP COLUMN IF EXISTS coupon_id;
DROP TABLE IF EXISTS coupons;

DROP TABLE IF EXISTS table_orders;
DROP TABLE IF EXISTS tables;
DROP TABLE IF EXISTS floors;

DROP TABLE IF EXISTS report_templates;

-- Self-service activity logging: no client ever sent events (dropping its indexes too).
DROP TABLE IF EXISTS fnb_activity_logs;

DROP INDEX IF EXISTS idx_transactions_payment_reference;
ALTER TABLE IF EXISTS transactions    DROP COLUMN IF EXISTS payment_reference;
ALTER TABLE IF EXISTS payment_methods DROP COLUMN IF EXISTS api_merchant_id;
ALTER TABLE IF EXISTS payment_methods DROP COLUMN IF EXISTS api_password;
ALTER TABLE IF EXISTS payment_methods DROP COLUMN IF EXISTS api_secret_key;
ALTER TABLE IF EXISTS payment_methods DROP COLUMN IF EXISTS show_qr_in_fnb;
ALTER TABLE IF EXISTS payment_methods DROP COLUMN IF EXISTS is_self_service;

ALTER TABLE IF EXISTS branches DROP COLUMN IF EXISTS brand_logo_url;
ALTER TABLE IF EXISTS branches DROP COLUMN IF EXISTS favicon_url;

-- Superseded indexes
DROP INDEX IF EXISTS idx_print_jobs_branch_status_active;  -- covered by idx_print_jobs_branch_status
DROP INDEX IF EXISTS idx_refresh_tokens_token;             -- replaced by idx_refresh_tokens_token_hash

-- An index named idx_consumers_* / idx_staff_* must belong to consumers / staff.
-- If one is attached to another table (e.g. a renamed-away copy of the old
-- table), drop just that index so section 7 creates it on the live table.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT i.relname AS index_name
        FROM pg_index x
        JOIN pg_class i     ON i.oid = x.indexrelid
        JOIN pg_class t     ON t.oid = x.indrelid
        JOIN pg_namespace n ON n.oid = i.relnamespace
        WHERE n.nspname = 'public'
          AND ((i.relname LIKE 'idx\_consumers\_%' AND t.relname <> 'consumers')
            OR (i.relname LIKE 'idx\_staff\_%'     AND t.relname <> 'staff'))
    LOOP
        EXECUTE format('DROP INDEX %I', r.index_name);
    END LOOP;
END $$;

-- mv_branch_daily_sales must exclude balance settlements. If an older
-- definition is present, tag settlement rows and drop the view; section 10
-- recreates it with the current definition.
DO $$
BEGIN
    IF pg_get_viewdef(to_regclass('public.mv_branch_daily_sales')) NOT LIKE '%SETTLEMENT%' THEN
        UPDATE transactions
        SET order_source = 'SETTLEMENT'
        WHERE items::text ILIKE '%settlement%'
          AND order_source IS DISTINCT FROM 'SETTLEMENT';
        DROP MATERIALIZED VIEW mv_branch_daily_sales;
    END IF;
END $$;


-- =============================================================================
-- 3. EXTENSIONS
-- =============================================================================
-- gen_random_uuid() is built in (PostgreSQL 13+). pg_trgm is a trusted
-- extension, so the database owner can create it without superuser.

CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- =============================================================================
-- 4. TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Organisation and access control
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS branches (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    VARCHAR(100) NOT NULL,
    address                 TEXT,
    is_self_service_enabled BOOLEAN DEFAULT TRUE,
    is_active               BOOLEAN DEFAULT TRUE,
    is_management_branch    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Role-based access control: permissions is a JSON array of permission keys.
CREATE TABLE IF NOT EXISTS roles (
    name        VARCHAR(50) PRIMARY KEY,
    permissions JSONB DEFAULT '[]'
);

-- Admin / operator accounts. is_active = false blocks login and cuts off
-- existing sessions. password_hash must be bcrypt.
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(50),
    branch_id     UUID REFERENCES branches(id),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_role_fkey FOREIGN KEY (role) REFERENCES roles(name)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_password_hash_bcrypt
        CHECK (password_hash ~ '^\$2[aby]\$[0-9]{2}\$.{53}$')
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Refresh tokens: only SHA-256 hashes are stored. RESTRICT keeps the
-- revocation trail — tokens must be revoked before a user can be deleted.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         SERIAL PRIMARY KEY,
    user_id    UUID REFERENCES users(id) ON DELETE RESTRICT,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Programmatic access keys (only the SHA-256 hash is stored).
CREATE TABLE IF NOT EXISTS api_keys (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(255) NOT NULL,
    prefix       VARCHAR(32) NOT NULL,
    key_hash     VARCHAR(64) NOT NULL,
    branch_id    UUID REFERENCES branches(id),
    created_by   UUID REFERENCES users(id),
    created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    revoked_at   TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    scope        TEXT DEFAULT NULL
);
COMMENT ON COLUMN api_keys.scope IS
    'Comma-separated allowed path prefixes: print, pos. NULL = legacy key (GET-only for mutations until explicitly scoped).';

-- Key/value application settings (email config, email templates, ...).
CREATE TABLE IF NOT EXISTS system_settings (
    key        VARCHAR(50) PRIMARY KEY,
    value      TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------

-- Staff with a monthly allowance account.
CREATE TABLE IF NOT EXISTS staff (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              VARCHAR(255) NOT NULL,
    email             VARCHAR(255) UNIQUE NOT NULL,
    mobile_number     VARCHAR(20),
    department        VARCHAR(100),
    monthly_allowance NUMERIC(10, 2) DEFAULT 0,
    current_balance   NUMERIC(10, 2) DEFAULT 0,
    avatar            VARCHAR(512),              -- holds generated SVG data URIs
    status            VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    branch_id         UUID REFERENCES branches(id),
    created_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_staff_balance_bounds   CHECK (current_balance >= -999999999.99 AND current_balance <= 999999999.99),
    CONSTRAINT check_staff_allowance_bounds CHECK (monthly_allowance >= 0 AND monthly_allowance <= 999999.99)
);
DO $$
BEGIN
    IF (SELECT character_maximum_length FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'avatar') < 512 THEN
        ALTER TABLE staff ALTER COLUMN avatar TYPE VARCHAR(512);
    END IF;
END $$;

-- Consumers (students / external members). Soft-deleted via is_active;
-- never hard-delete a consumer with financial history.
CREATE TABLE IF NOT EXISTS consumers (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              VARCHAR(255) NOT NULL,
    email             VARCHAR(255) UNIQUE NOT NULL,
    mobile_number     VARCHAR(20),
    category          VARCHAR(100) DEFAULT 'Part-time',
    student_id        VARCHAR(50),
    remarks           TEXT,
    opening_balance   NUMERIC(10, 2) DEFAULT 0,
    monthly_allowance NUMERIC(10, 2) DEFAULT 0,
    current_balance   NUMERIC(10, 2) DEFAULT 0,
    avatar            VARCHAR(512),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    branch_id         UUID REFERENCES branches(id),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT check_consumer_balance_bounds   CHECK (current_balance >= -999999999.99 AND current_balance <= 999999999.99),
    CONSTRAINT check_consumer_allowance_bounds CHECK (monthly_allowance >= 0 AND monthly_allowance <= 999999.99)
);
-- Student details (only populated when category = 'Student'); see migrations/001_consumer_student_fields.sql
ALTER TABLE consumers ADD COLUMN IF NOT EXISTS student_id VARCHAR(50);
ALTER TABLE consumers ADD COLUMN IF NOT EXISTS remarks    TEXT;

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS categories (
    id         VARCHAR(50) PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    branch_id  UUID REFERENCES branches(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name, branch_id)
);

CREATE TABLE IF NOT EXISTS menu (
    id              VARCHAR(50) PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    price           NUMERIC(10, 2) NOT NULL,
    category        VARCHAR(100),
    image           VARCHAR(255),
    calories        INTEGER,
    available       BOOLEAN DEFAULT TRUE,
    branch_id       UUID REFERENCES branches(id),
    is_today_menu   BOOLEAN DEFAULT FALSE,
    is_self_service BOOLEAN DEFAULT TRUE,
    is_deleted      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT menu_name_branch_unique UNIQUE (name, branch_id)
);

-- ---------------------------------------------------------------------------
-- Sales and money
-- ---------------------------------------------------------------------------

-- Transactions, range-partitioned by month on `date` (partitions: section 5).
--
-- staff_id deliberately has no FK: besides real staff UUIDs it holds synthetic
-- IDs — 'POS-N' (anonymous POS sale) and, in historical rows, 'COUPON_<n>' and
-- 'TABLE_ORDER'. chk_transactions_staff_id_format restricts it to those forms;
-- detect_orphaned_staff_transactions() audits dangling UUIDs.
--
-- client_request_id records the client's Idempotency-Key for duplicate
-- forensics. It cannot be globally UNIQUE on a partitioned table; uniqueness is
-- enforced by the application (Redis reservation).
CREATE TABLE IF NOT EXISTS transactions (
    id                UUID DEFAULT gen_random_uuid(),
    staff_id          VARCHAR(50),
    consumer_id       UUID,
    total_amount      NUMERIC(10, 2) NOT NULL,
    date              TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    status            VARCHAR(50) DEFAULT 'COMPLETED',   -- COMPLETED | REFUNDED | PENDING
    items             JSONB,
    branch_id         UUID,
    payment_method    VARCHAR(50),
    refund_method     VARCHAR(50),
    recipient_name    VARCHAR(255),
    order_source      VARCHAR(50) DEFAULT 'POS',         -- POS | SELF_SERVICE | SETTLEMENT | TABLE | TABLE_SPLIT (historical)
    user_id           UUID,
    client_request_id UUID,
    PRIMARY KEY (id, date),
    CONSTRAINT fk_transactions_consumer FOREIGN KEY (consumer_id) REFERENCES consumers(id) ON DELETE SET NULL,
    CONSTRAINT fk_transactions_branch   FOREIGN KEY (branch_id)   REFERENCES branches(id)  ON DELETE RESTRICT,
    CONSTRAINT fk_transactions_user     FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE SET NULL,
    CONSTRAINT chk_transactions_staff_id_format CHECK (
        staff_id IS NULL
        OR staff_id LIKE 'POS-%'
        OR staff_id LIKE 'COUPON_%'
        OR staff_id = 'TABLE_ORDER'
        OR staff_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
) PARTITION BY RANGE (date);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_request_id UUID;

-- Immutable trail of every balance change.
CREATE TABLE IF NOT EXISTS financial_ledger (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type    VARCHAR(20) NOT NULL,           -- STAFF | CONSUMER
    entity_id      VARCHAR(50) NOT NULL,
    amount         NUMERIC(10, 2) NOT NULL,
    type           VARCHAR(10) NOT NULL,
    balance_before NUMERIC(10, 2) NOT NULL,
    balance_after  NUMERIC(10, 2) NOT NULL,
    branch_id      UUID,
    reference_id   UUID,                           -- transactions.id when applicable
    reason         VARCHAR(255),
    created_by     UUID,                           -- user who initiated the change
    created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_financial_ledger_type   CHECK (type IN ('CREDIT', 'DEBIT', 'REFUND')),
    CONSTRAINT fk_financial_ledger_branch  FOREIGN KEY (branch_id)  REFERENCES branches(id) ON DELETE RESTRICT,
    CONSTRAINT fk_financial_ledger_user    FOREIGN KEY (created_by) REFERENCES users(id)    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payment_methods (
    id             VARCHAR(50) PRIMARY KEY,
    name           VARCHAR(100) NOT NULL,
    type           VARCHAR(50) NOT NULL,           -- cash | digital | card
    qr_type        VARCHAR(20) DEFAULT 'none' CHECK (qr_type IN ('none', 'static')),
    qr_data        TEXT,
    show_qr_in_pos BOOLEAN DEFAULT FALSE,
    is_default     BOOLEAN DEFAULT FALSE,
    is_active      BOOLEAN DEFAULT TRUE,
    branch_id      UUID REFERENCES branches(id),
    config         JSONB DEFAULT '{}',
    created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Printing
-- ---------------------------------------------------------------------------

-- Named printer profiles per branch.
CREATE TABLE IF NOT EXISTS printers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id           UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name                VARCHAR(100) NOT NULL,
    description         TEXT,
    printer_type        VARCHAR(50) NOT NULL DEFAULT 'THERMAL_80MM',  -- THERMAL_80MM | THERMAL_58MM | LASER | A4
    mode                VARCHAR(20) NOT NULL DEFAULT 'SERVER',        -- LOCAL | SERVER | OFF
    bridge_printer_name VARCHAR(255),
    ip_address          VARCHAR(100),
    port                INTEGER DEFAULT 9100,
    last_seen_at        TIMESTAMPTZ,
    detected_printers   TEXT[],
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order          INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Which service types (KOT | BILL | RECEIPT | BAR | CUSTOM_ORDER) each printer handles.
CREATE TABLE IF NOT EXISTS printer_assignments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    printer_id   UUID NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
    service_type VARCHAR(50) NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (printer_id, service_type)
);

-- Remote print queue. branch_id is SET NULL on branch delete so print history
-- survives.
CREATE TABLE IF NOT EXISTS print_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
    printer_id      UUID REFERENCES printers(id) ON DELETE SET NULL,
    content         JSONB NOT NULL,
    target          VARCHAR(50) DEFAULT 'KITCHEN',   -- KITCHEN | BILL | BAR
    status          VARCHAR(50) DEFAULT 'PENDING',
    idempotency_key VARCHAR(255),
    queued_by       VARCHAR(255),
    service_type    VARCHAR(50),                     -- KOT | BILL | RECEIPT | ...
    error_message   TEXT,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Printable document templates (HTML with {{placeholders}}). branch_id NULL
-- = global template; at most one default per type per branch.
CREATE TABLE IF NOT EXISTS document_templates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(255) NOT NULL,
    type          VARCHAR(50) NOT NULL CHECK (type IN ('KOT', 'INVOICE', 'RECEIPT', 'PAYOUT', 'BILL', 'CUSTOM_ORDER')),
    description   TEXT,
    template_html TEXT NOT NULL,
    template_css  TEXT,
    placeholders  JSONB DEFAULT '[]',
    branch_id     UUID REFERENCES branches(id),
    is_active     BOOLEAN DEFAULT TRUE,
    is_default    BOOLEAN DEFAULT FALSE,
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_by    VARCHAR(255),                      -- username (display)
    updated_by_id UUID,
    updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_doc_templates_updated_by FOREIGN KEY (updated_by_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Student pre-ordering. fnb_sessions: the student app opens a session before
-- checkout, and an order is only accepted against an active session.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fnb_sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id    UUID REFERENCES branches(id),
    status       VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'ABANDONED')),
    ip_address   VARCHAR(45),
    user_agent   TEXT,
    started_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

-- One row per calendar day; incremented atomically with
-- INSERT ... ON CONFLICT DO UPDATE to issue daily order numbers.
CREATE TABLE IF NOT EXISTS student_order_sequences (
    order_date    DATE    PRIMARY KEY,
    last_sequence INTEGER NOT NULL DEFAULT 0
);

-- Student pre-orders: PENDING -> LOADED_TO_POS -> COMPLETED | CANCELLED.
-- Not financial records; they become transactions at POS checkout.
CREATE TABLE IF NOT EXISTS student_orders (
    id            VARCHAR(20)   PRIMARY KEY,         -- e.g. '2026-06-02-0001'
    session_id    UUID          REFERENCES fnb_sessions(id) ON DELETE SET NULL,
    branch_id     UUID          REFERENCES branches(id),
    student_email VARCHAR(255)  NOT NULL,
    items         JSONB         NOT NULL,            -- [{id,name,price,category,quantity,itemTotal}]
    total_amount  NUMERIC(10,2) NOT NULL,
    status        VARCHAR(30)   NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'LOADED_TO_POS', 'COMPLETED', 'CANCELLED')),
    ip_address    VARCHAR(45),
    created_at    TIMESTAMPTZ   DEFAULT CURRENT_TIMESTAMP,
    loaded_at     TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- Audit and housekeeping
-- ---------------------------------------------------------------------------

-- Audit log, range-partitioned by month on `timestamp` (partitions: section 5).
-- PostgreSQL cannot enforce FKs from this table cheaply across dynamically
-- created partitions; trg_audit_logs_fk (section 9) checks user_id/branch_id.
-- Retention: prune_audit_logs(365), run nightly by the server.
CREATE TABLE IF NOT EXISTS audit_logs (
    id        SERIAL,
    user_id   UUID,
    user_name VARCHAR(255),
    action    VARCHAR(255) NOT NULL,
    details   TEXT,
    branch_id UUID,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Last refresh time of each materialized view (written by the server after
-- every REFRESH).
CREATE TABLE IF NOT EXISTS mv_refresh_log (
    view_name         VARCHAR(100) PRIMARY KEY,
    last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 5. PARTITIONS
-- =============================================================================
-- A DEFAULT partition plus the current and next two months. The server's
-- partition-maintenance job keeps creating months ahead.

CREATE TABLE IF NOT EXISTS transactions_default PARTITION OF transactions DEFAULT;
CREATE TABLE IF NOT EXISTS audit_logs_default   PARTITION OF audit_logs   DEFAULT;

DO $$
DECLARE
    parent TEXT;
    i      INT;
    d      DATE;
    tbl    TEXT;
BEGIN
    FOREACH parent IN ARRAY ARRAY['transactions', 'audit_logs'] LOOP
        FOR i IN 0..2 LOOP
            d   := DATE_TRUNC('month', CURRENT_DATE + make_interval(months => i));
            tbl := parent || '_' || TO_CHAR(d, 'YYYY_MM');
            IF to_regclass('public.' || tbl) IS NULL THEN
                BEGIN
                    EXECUTE format(
                        'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
                        tbl, parent, d, (d + INTERVAL '1 month')::date
                    );
                EXCEPTION WHEN check_violation THEN
                    -- Rows for this month already sit in the DEFAULT partition;
                    -- leave them there rather than fail the whole apply.
                    RAISE WARNING 'partition % not created: matching rows exist in %_default', tbl, parent;
                END;
            END IF;
        END LOOP;
    END LOOP;
END $$;


-- =============================================================================
-- 6. CONSTRAINT RECONCILIATION (existing installs only)
-- =============================================================================
-- CREATE TABLE IF NOT EXISTS does not touch an existing table, so align
-- constraints whose definition changed. Each block is a no-op when the
-- constraint already matches.

DO $$
BEGIN
    -- document_templates.type: CANCEL_KOT (table orders) is retired.
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'document_templates_type_check'
          AND conrelid = 'document_templates'::regclass
          AND pg_get_constraintdef(oid) LIKE '%CANCEL_KOT%'
    ) THEN
        DELETE FROM printer_assignments WHERE service_type = 'CANCEL_KOT';
        DELETE FROM document_templates  WHERE type = 'CANCEL_KOT';
        ALTER TABLE document_templates DROP CONSTRAINT document_templates_type_check;
        ALTER TABLE document_templates ADD CONSTRAINT document_templates_type_check
            CHECK (type IN ('KOT', 'INVOICE', 'RECEIPT', 'PAYOUT', 'BILL', 'CUSTOM_ORDER'));
    END IF;

    -- payment_methods.qr_type: only 'none' and 'static' remain.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'payment_methods_qr_type_check'
          AND conrelid = 'payment_methods'::regclass
    ) THEN
        UPDATE payment_methods SET qr_type = 'none'
        WHERE qr_type IS NULL OR qr_type NOT IN ('none', 'static');
        ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_qr_type_check
            CHECK (qr_type IN ('none', 'static'));
    END IF;

    -- print_jobs.branch_id: SET NULL (keep print history), not CASCADE.
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'print_jobs_branch_id_fkey'
          AND conrelid = 'print_jobs'::regclass
          AND confdeltype <> 'n'
    ) THEN
        ALTER TABLE print_jobs DROP CONSTRAINT print_jobs_branch_id_fkey;
        ALTER TABLE print_jobs ADD CONSTRAINT print_jobs_branch_id_fkey
            FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
    END IF;
END $$;


-- =============================================================================
-- 7. INDEXES
-- =============================================================================

-- users / refresh_tokens / api_keys
CREATE INDEX IF NOT EXISTS idx_users_branch_id            ON users (branch_id);
CREATE INDEX IF NOT EXISTS idx_users_role                 ON users (role);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id     ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash  ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at  ON refresh_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash              ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_branch_id         ON api_keys (branch_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_created_by        ON api_keys (created_by);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_prefix_unique ON api_keys (prefix) WHERE revoked_at IS NULL;

-- staff
CREATE INDEX IF NOT EXISTS idx_staff_name              ON staff (name);
CREATE INDEX IF NOT EXISTS idx_staff_name_trgm         ON staff USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_staff_email             ON staff (email);
CREATE INDEX IF NOT EXISTS idx_staff_department        ON staff (department);
CREATE INDEX IF NOT EXISTS idx_staff_mobile            ON staff (mobile_number);
CREATE INDEX IF NOT EXISTS idx_staff_monthly_allowance ON staff (monthly_allowance);
CREATE INDEX IF NOT EXISTS idx_staff_current_balance   ON staff (current_balance);
CREATE INDEX IF NOT EXISTS idx_staff_spent             ON staff ((monthly_allowance - current_balance));
CREATE INDEX IF NOT EXISTS idx_staff_payable_calc      ON staff ((CASE WHEN current_balance < 0 THEN ABS(current_balance) ELSE 0 END));
CREATE INDEX IF NOT EXISTS idx_staff_branch_id         ON staff (branch_id);

-- consumers
CREATE INDEX IF NOT EXISTS idx_consumers_name      ON consumers (name);
CREATE INDEX IF NOT EXISTS idx_consumers_name_trgm ON consumers USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_consumers_email     ON consumers (email);
CREATE INDEX IF NOT EXISTS idx_consumers_category  ON consumers (category);
CREATE INDEX IF NOT EXISTS idx_consumers_mobile    ON consumers (mobile_number);
CREATE INDEX IF NOT EXISTS idx_consumers_branch_id ON consumers (branch_id);

-- categories / menu
CREATE INDEX IF NOT EXISTS idx_categories_branch_id   ON categories (branch_id);
CREATE INDEX IF NOT EXISTS idx_categories_name_branch ON categories (name, branch_id);
CREATE INDEX IF NOT EXISTS idx_menu_name              ON menu USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_menu_category          ON menu (category);
CREATE INDEX IF NOT EXISTS idx_menu_price             ON menu (price);
CREATE INDEX IF NOT EXISTS idx_menu_branch_id         ON menu (branch_id);
CREATE INDEX IF NOT EXISTS idx_menu_available         ON menu (available);

-- transactions (created on the parent; PostgreSQL propagates to partitions)
CREATE INDEX IF NOT EXISTS idx_transactions_date                ON transactions (date);
CREATE INDEX IF NOT EXISTS idx_transactions_branch_id           ON transactions (branch_id);
CREATE INDEX IF NOT EXISTS idx_transactions_branch_created      ON transactions (branch_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_consumer_id_partial ON transactions (consumer_id) WHERE consumer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_staff_id            ON transactions (staff_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id             ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_method      ON transactions (payment_method);
CREATE INDEX IF NOT EXISTS idx_transactions_recipient_name      ON transactions (recipient_name);
CREATE INDEX IF NOT EXISTS idx_transactions_order_source        ON transactions (order_source) WHERE order_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_items_gin           ON transactions USING GIN (items);
CREATE INDEX IF NOT EXISTS idx_transactions_reports_composite   ON transactions (branch_id, status, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_dashboard_composite ON transactions (branch_id, date DESC, status) WHERE status != 'REFUNDED';
CREATE INDEX IF NOT EXISTS idx_transactions_completed           ON transactions (date) WHERE status = 'COMPLETED';
CREATE INDEX IF NOT EXISTS idx_transactions_client_request_id   ON transactions (client_request_id) WHERE client_request_id IS NOT NULL;

-- financial_ledger
CREATE INDEX IF NOT EXISTS idx_financial_ledger_entity       ON financial_ledger (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_entity_type  ON financial_ledger (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_entity_id    ON financial_ledger (entity_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_ref_entity   ON financial_ledger (reference_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_reference_id ON financial_ledger (reference_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_branch_id    ON financial_ledger (branch_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_branch_date  ON financial_ledger (branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_created_at   ON financial_ledger (created_at);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_created_by   ON financial_ledger (created_by);

-- payment_methods
CREATE INDEX IF NOT EXISTS idx_payment_methods_branch_id ON payment_methods (branch_id);

-- printing
CREATE INDEX IF NOT EXISTS idx_printers_branch              ON printers (branch_id);
CREATE INDEX IF NOT EXISTS idx_printer_assignments_printer  ON printer_assignments (printer_id);
CREATE INDEX IF NOT EXISTS idx_printer_assignments_service  ON printer_assignments (service_type);
CREATE INDEX IF NOT EXISTS idx_print_jobs_branch_status     ON print_jobs (branch_id, status);
CREATE INDEX IF NOT EXISTS idx_print_jobs_created_at        ON print_jobs (created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_print_jobs_idempotency_key ON print_jobs (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- document_templates: one default per (type, branch); one global default per type
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_templates_default
    ON document_templates (type, branch_id, is_default) WHERE is_default = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_templates_global_default
    ON document_templates (type, is_default) WHERE is_default = TRUE AND branch_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_document_templates_type_branch ON document_templates (type, branch_id, is_active);
CREATE INDEX IF NOT EXISTS idx_document_templates_created_by  ON document_templates (created_by);

-- self-service / student orders
CREATE INDEX IF NOT EXISTS idx_fnb_sessions_branch_id         ON fnb_sessions (branch_id);
CREATE INDEX IF NOT EXISTS idx_fnb_sessions_status            ON fnb_sessions (status);
CREATE INDEX IF NOT EXISTS idx_student_orders_status          ON student_orders (status);
CREATE INDEX IF NOT EXISTS idx_student_orders_branch_id       ON student_orders (branch_id);
CREATE INDEX IF NOT EXISTS idx_student_orders_created_at      ON student_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_orders_email           ON student_orders (student_email);

-- audit_logs (parent; propagated to partitions)
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp        ON audit_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id          ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action           ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_id        ON audit_logs (branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_timestamp ON audit_logs (branch_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_name_trgm   ON audit_logs USING GIN (user_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_trgm      ON audit_logs USING GIN (action gin_trgm_ops);


-- =============================================================================
-- 8. FUNCTIONS
-- =============================================================================

-- Maintains updated_at on UPDATE.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

-- Branch context for row-level security. Transaction-local (is_local = true),
-- so call it inside BEGIN ... COMMIT: SELECT set_branch_context($1);
CREATE OR REPLACE FUNCTION set_branch_context(p_branch_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('app.current_branch_id', p_branch_id::text, true);
END;
$$;

-- Current branch context, or NULL when none is set.
CREATE OR REPLACE FUNCTION current_branch_id()
RETURNS UUID LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_val TEXT;
BEGIN
    BEGIN
        v_val := current_setting('app.current_branch_id', true);
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;
    IF v_val IS NULL OR v_val = '' THEN
        RETURN NULL;
    END IF;
    RETURN v_val::UUID;
END;
$$;

-- Referential checks for the partitioned tables (fired on every partition).
CREATE OR REPLACE FUNCTION trg_audit_logs_fk_check()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id) THEN
        RAISE EXCEPTION 'audit_logs FK violation: user_id % does not exist in users', NEW.user_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF NEW.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches WHERE id = NEW.branch_id) THEN
        RAISE EXCEPTION 'audit_logs FK violation: branch_id % does not exist in branches', NEW.branch_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_transactions_fk_check()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id) THEN
        RAISE EXCEPTION 'transactions FK violation: user_id % does not exist in users', NEW.user_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF NEW.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches WHERE id = NEW.branch_id) THEN
        RAISE EXCEPTION 'transactions FK violation: branch_id % does not exist in branches', NEW.branch_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

-- Transactions whose staff_id is neither a synthetic ID nor an existing user.
CREATE OR REPLACE FUNCTION detect_orphaned_staff_transactions()
RETURNS TABLE (
    transaction_id   UUID,
    transaction_date TIMESTAMPTZ,
    staff_id         VARCHAR(50),
    branch_id        UUID,
    total_amount     NUMERIC(10, 2)
) LANGUAGE sql STABLE AS $$
    SELECT t.id, t.date, t.staff_id, t.branch_id, t.total_amount
    FROM transactions t
    WHERE t.staff_id IS NOT NULL
      AND t.staff_id NOT LIKE 'POS-%'
      AND t.staff_id NOT LIKE 'COUPON_%'
      AND t.staff_id <> 'TABLE_ORDER'
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id::text = t.staff_id)
    ORDER BY t.date DESC;
$$;
COMMENT ON FUNCTION detect_orphaned_staff_transactions() IS
'Returns transactions whose staff_id is not a synthetic system ID (POS-N, COUPON_<n>, TABLE_ORDER) and does not match any row in users. transactions.staff_id intentionally has no FK.';

-- Audit-log retention. Drops whole monthly partitions older than the cutoff
-- (instant), then row-deletes the boundary month and the DEFAULT partition.
-- Called nightly by the server as prune_audit_logs(365).
CREATE OR REPLACE FUNCTION prune_audit_logs(retention_days INT DEFAULT 365)
RETURNS JSON LANGUAGE plpgsql AS $$
DECLARE
    r                  RECORD;
    partition_end_date DATE;
    cutoff             TIMESTAMPTZ := NOW() - (retention_days || ' days')::INTERVAL;
    dropped            INT := 0;
    deleted            BIGINT := 0;
BEGIN
    FOR r IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_inherits  i ON c.oid = i.inhrelid
        JOIN pg_class     p ON p.oid = i.inhparent
        WHERE n.nspname = 'public'
          AND p.relname = 'audit_logs'
          AND c.relname ~ '^audit_logs_\d{4}_\d{2}$'
        ORDER BY c.relname
    LOOP
        partition_end_date :=
            TO_DATE(REGEXP_REPLACE(r.relname, '^audit_logs_(\d{4})_(\d{2})$', '\1-\2-01'), 'YYYY-MM-DD')
            + INTERVAL '1 month';
        IF partition_end_date::TIMESTAMPTZ < cutoff THEN
            EXECUTE format('DROP TABLE IF EXISTS %I', r.relname);
            dropped := dropped + 1;
        END IF;
    END LOOP;

    DELETE FROM audit_logs WHERE timestamp < cutoff;
    GET DIAGNOSTICS deleted = ROW_COUNT;

    RETURN json_build_object('dropped_partitions', dropped, 'deleted_rows', deleted);
END;
$$;


-- =============================================================================
-- 9. TRIGGERS
-- =============================================================================
-- Created only when missing, so re-applying takes no table locks.

DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN
        SELECT * FROM (VALUES
            ('update_print_jobs_updated_at',         'print_jobs',         'BEFORE UPDATE',           'update_updated_at_column'),
            ('update_system_settings_updated_at',    'system_settings',    'BEFORE UPDATE',           'update_updated_at_column'),
            ('update_document_templates_updated_at', 'document_templates', 'BEFORE UPDATE',           'update_updated_at_column'),
            ('update_staff_updated_at',              'staff',              'BEFORE UPDATE',           'update_updated_at_column'),
            ('update_consumers_updated_at',          'consumers',          'BEFORE UPDATE',           'update_updated_at_column'),
            ('update_categories_updated_at',         'categories',         'BEFORE UPDATE',           'update_updated_at_column'),
            ('update_menu_updated_at',               'menu',               'BEFORE UPDATE',           'update_updated_at_column'),
            ('update_payment_methods_updated_at',    'payment_methods',    'BEFORE UPDATE',           'update_updated_at_column'),
            ('trg_audit_logs_fk',                    'audit_logs',         'BEFORE INSERT OR UPDATE', 'trg_audit_logs_fk_check'),
            ('trg_transactions_fk',                  'transactions',       'BEFORE INSERT OR UPDATE', 'trg_transactions_fk_check')
        ) AS v(trigger_name, table_name, timing, function_name)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgname = t.trigger_name
              AND tgrelid = ('public.' || t.table_name)::regclass
        ) THEN
            EXECUTE format('CREATE TRIGGER %I %s ON %I FOR EACH ROW EXECUTE FUNCTION %I()',
                           t.trigger_name, t.timing, t.table_name, t.function_name);
        END IF;
    END LOOP;
END $$;


-- =============================================================================
-- 10. MATERIALIZED VIEWS
-- =============================================================================
-- Refreshed by the server (REFRESH ... CONCURRENTLY needs the unique indexes).

-- Per-branch daily sales. Balance settlements are not sales and are excluded
-- from every revenue/count column. Coupon and table-order columns report
-- historical rows of those retired modules.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_branch_daily_sales AS
SELECT
    branch_id,
    date::date AS sales_date,
    COUNT(CASE WHEN order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN 1 END) AS total_transactions,
    SUM(CASE WHEN order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN total_amount ELSE 0 END) AS total_revenue,
    SUM(CASE WHEN status = 'COMPLETED' AND order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN total_amount ELSE 0 END) AS completed_revenue,
    SUM(CASE WHEN status = 'REFUNDED'  AND order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN total_amount ELSE 0 END) AS refunded_revenue,
    SUM(CASE WHEN staff_id IS NOT NULL AND staff_id <> 'POS-N' AND staff_id NOT LIKE 'COUPON_%'
                  AND order_source NOT IN ('TABLE','TABLE_SPLIT','SETTLEMENT') AND items::text NOT ILIKE '%Balance Settlement%' THEN total_amount ELSE 0 END) AS staff_revenue,
    COUNT(CASE WHEN staff_id IS NOT NULL AND staff_id <> 'POS-N' AND staff_id NOT LIKE 'COUPON_%'
                    AND order_source NOT IN ('TABLE','TABLE_SPLIT','SETTLEMENT') AND items::text NOT ILIKE '%Balance Settlement%' THEN 1 END) AS staff_count,
    SUM(CASE WHEN consumer_id IS NOT NULL AND order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN total_amount ELSE 0 END) AS consumer_revenue,
    COUNT(CASE WHEN consumer_id IS NOT NULL AND order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN 1 END) AS consumer_count,
    SUM(CASE WHEN staff_id LIKE 'COUPON_%' AND order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN total_amount ELSE 0 END) AS coupon_revenue,
    COUNT(CASE WHEN staff_id LIKE 'COUPON_%' AND order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN 1 END) AS coupon_count,
    SUM(CASE WHEN staff_id = 'POS-N' AND order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN total_amount ELSE 0 END) AS pos_n_revenue,
    COUNT(CASE WHEN staff_id = 'POS-N' AND order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN 1 END) AS pos_n_count,
    SUM(CASE WHEN order_source IN ('TABLE','TABLE_SPLIT') THEN total_amount ELSE 0 END) AS table_revenue,
    COUNT(CASE WHEN order_source IN ('TABLE','TABLE_SPLIT') THEN 1 END) AS table_count
FROM transactions
GROUP BY branch_id, date::date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_branch_daily_sales_unique
    ON mv_branch_daily_sales (branch_id, sales_date);

-- Per-branch daily item sales (flattened from transactions.items).
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_item_sales_summary AS
SELECT
    branch_id,
    date::date AS sales_date,
    item->>'name'     AS item_name,
    item->>'category' AS item_category,
    SUM(COALESCE((item->>'quantity')::int, 0)) AS total_quantity,
    SUM((item->>'price')::numeric * COALESCE((item->>'quantity')::int, 0)) AS total_revenue
FROM transactions,
LATERAL jsonb_array_elements(items) AS item
WHERE status = 'COMPLETED'
GROUP BY branch_id, date::date, item->>'name', item->>'category';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_item_sales_summary_unique
    ON mv_item_sales_summary (branch_id, sales_date, item_name, item_category);


-- =============================================================================
-- 11. ROW-LEVEL SECURITY
-- =============================================================================
-- Branch isolation, opt-in per request: with no branch context set
-- (current_branch_id() IS NULL) every row is visible; once the application calls
-- set_branch_context(), only that branch's rows (and rows with no branch) are.
-- FORCE applies the policy to the table owner too (the application role).

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['consumers', 'staff', 'transactions', 'financial_ledger'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_class
            WHERE oid = ('public.' || tbl)::regclass AND relrowsecurity AND relforcerowsecurity
        ) THEN
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
            EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = tbl AND policyname = 'rls_' || tbl || '_branch'
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I USING (current_branch_id() IS NULL OR branch_id IS NULL OR branch_id = current_branch_id())',
                'rls_' || tbl || '_branch', tbl
            );
        END IF;
    END LOOP;
END $$;


-- =============================================================================
-- 12. SEED DATA
-- =============================================================================
-- Inserts only what is missing; never overwrites user edits. The first admin
-- account, its role and the main branch are created by the in-app setup flow.

-- Global default payment method
INSERT INTO payment_methods (id, name, type, is_default, is_active, branch_id)
VALUES ('sys-default-cash', 'Cash', 'cash', TRUE, TRUE, NULL)
ON CONFLICT DO NOTHING;

-- Materialized-view refresh tracking
INSERT INTO mv_refresh_log (view_name, last_refreshed_at) VALUES
    ('mv_branch_daily_sales', NOW()),
    ('mv_item_sales_summary', NOW())
ON CONFLICT DO NOTHING;

-- Default email templates (JSON: subject, body, description, placeholders)
INSERT INTO system_settings (key, value) VALUES
('email_template_admin_report',
 '{"subject":"Monthly Staff Report - {{month}} {{year}}","body":"<h2 style=\"color:#333\">Monthly Staff Report</h2><p>Dear Admin,</p><p>Please find the monthly staff consumption report for <strong>{{month}} {{year}}</strong> attached below.</p><table style=\"border-collapse:collapse;width:100%\"><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Total Staff:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">{{totalStaff}}</td></tr><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Total Transactions:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">{{totalTransactions}}</td></tr><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Total Amount:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">Rs. {{totalAmount}}</td></tr></table><br><p>Regards,<br>CafeFlow POS System</p>","description":"Monthly report sent to system admin.","placeholders":["{{month}}","{{year}}","{{totalStaff}}","{{totalTransactions}}","{{totalAmount}}"]}'
) ON CONFLICT DO NOTHING;

INSERT INTO system_settings (key, value) VALUES
('email_template_staff_reset',
 '{"subject":"Staff Allowance Reset Notification - {{month}} {{year}}","body":"<h2 style=\"color:#333\">Allowance Reset Notification</h2><p>Dear Admin,</p><p>Staff allowances have been reset for <strong>{{month}} {{year}}</strong>.</p><table style=\"border-collapse:collapse;width:100%\"><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Total Staff Reset:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">{{totalStaff}}</td></tr><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Reset Amount:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">Rs. {{resetAmount}}</td></tr><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Reset Date:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">{{resetDate}}</td></tr></table><br><p>Regards,<br>CafeFlow POS System</p>","description":"Sent when staff balances are reset.","placeholders":["{{month}}","{{year}}","{{totalStaff}}","{{resetAmount}}","{{resetDate}}"]}'
) ON CONFLICT DO NOTHING;

INSERT INTO system_settings (key, value) VALUES
('email_template_consumer_reset',
 '{"subject":"Consumer Allowance Reset Notification - {{month}} {{year}}","body":"<h2 style=\"color:#333\">Consumer Allowance Reset</h2><p>Dear Admin,</p><p>Consumer allowances have been successfully reset for <strong>{{month}} {{year}}</strong>.</p><table style=\"border-collapse:collapse;width:100%\"><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Total Consumers Reset:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">{{totalConsumers}}</td></tr><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Reset Amount:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">Rs. {{resetAmount}}</td></tr><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Reset Date:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">{{resetDate}}</td></tr></table><br><p>Regards,<br>CafeFlow POS System</p>","description":"Sent when consumer balances are reset.","placeholders":["{{month}}","{{year}}","{{totalConsumers}}","{{resetAmount}}","{{resetDate}}"]}'
) ON CONFLICT DO NOTHING;

INSERT INTO system_settings (key, value) VALUES
('email_template_staff_bulk_import',
 '{"subject":"Staff Bulk Import Summary - {{date}}","body":"<h2 style=\"color:#333\">Staff Bulk Import Complete</h2><p>Dear Admin,</p><p>The staff bulk import operation has been completed on <strong>{{date}}</strong>.</p><table style=\"border-collapse:collapse;width:100%\"><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Total Imported:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">{{totalImported}}</td></tr><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Successful:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">{{successCount}}</td></tr><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Failed:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">{{failCount}}</td></tr></table><br><p>Regards,<br>CafeFlow POS System</p>","description":"Summary report after bulk importing staff.","placeholders":["{{date}}","{{totalImported}}","{{successCount}}","{{failCount}}"]}'
) ON CONFLICT DO NOTHING;

INSERT INTO system_settings (key, value) VALUES
('email_template_monthly_statement',
 '{"subject":"Your Monthly Statement - {{month}} {{year}}","body":"<h2 style=\"color:#333\">Monthly Consumption Statement</h2><p>Dear {{name}},</p><p>Please find your personal consumption statement for <strong>{{month}} {{year}}</strong> attached.</p><table style=\"border-collapse:collapse;width:100%\"><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Period:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">{{startDate}} to {{endDate}}</td></tr><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Total Transactions:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">{{totalTransactions}}</td></tr><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Total Amount:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">Rs. {{totalAmount}}</td></tr></table><br><p>If you have any questions, please contact the administrator.</p><p>Regards,<br>CafeFlow POS System</p>","description":"Personal consumption report for staff members.","placeholders":["{{name}}","{{month}}","{{year}}","{{startDate}}","{{endDate}}","{{totalTransactions}}","{{totalAmount}}"]}'
) ON CONFLICT DO NOTHING;

INSERT INTO system_settings (key, value) VALUES
('email_template_statement_attachment',
 '{"subject":"Account Statement - {{startDate}} to {{endDate}}","body":"<h2 style=\"color:#333\">Account Statement</h2><p>Dear {{name}},</p><p>Please find your account statement for the period <strong>{{startDate}}</strong> to <strong>{{endDate}}</strong> attached to this email.</p><table style=\"border-collapse:collapse;width:100%\"><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Account:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">{{email}}</td></tr><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Total Transactions:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">{{totalTransactions}}</td></tr><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Total Amount:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">Rs. {{totalAmount}}</td></tr></table><br><p>For any queries, please contact the administrator.</p><p>Copyright &copy; {{year}} CafeFlow POS</p>","description":"Email body when sending a transaction statement attachment.","placeholders":["{{name}}","{{email}}","{{startDate}}","{{endDate}}","{{totalTransactions}}","{{totalAmount}}","{{year}}"]}'
) ON CONFLICT DO NOTHING;

INSERT INTO system_settings (key, value) VALUES
('email_template_bulk_statement_completion',
 '{"subject":"Bulk Statement Sending Complete - {{date}}","body":"<h2 style=\"color:#333\">Bulk Statement Sending Complete</h2><p>Dear Admin,</p><p>The bulk statement sending job completed on <strong>{{date}}</strong>.</p><table style=\"border-collapse:collapse;width:100%\"><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Total Recipients:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">{{totalRecipients}}</td></tr><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Successfully Sent:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">{{successCount}}</td></tr><tr><td style=\"padding:8px;border:1px solid #ddd\"><strong>Failed:</strong></td><td style=\"padding:8px;border:1px solid #ddd\">{{failCount}}</td></tr></table><br><p>Regards,<br>CafeFlow POS System</p>","description":"Summary report after sending batch statements.","placeholders":["{{date}}","{{totalRecipients}}","{{successCount}}","{{failCount}}"]}'
) ON CONFLICT DO NOTHING;

-- Global default document templates (ESC/POS-friendly HTML: <center>, <b>,
-- <hr>, <br>, <table width="x%">; the CSS is for browser preview only).
INSERT INTO document_templates (name, type, description, template_html, template_css, placeholders, is_default, is_active)
SELECT v.name, v.type, v.description, v.template_html, s.css, v.placeholders::jsonb, TRUE, TRUE
FROM (VALUES
    ('Default KOT Template', 'KOT',
     'Standard Kitchen Order Ticket template for 80mm thermal printers',
     '<center><b>{{branchName}}</b></center><center><b>KOT</b></center><hr>Order: {{orderId}}<br>{{timestamp}}<hr><table><tr><th width="55%">Item</th><th width="15%" align="center">Qty</th><th width="30%" align="right">Amt</th></tr>{{#items}}<tr><td width="55%">{{name}}</td><td width="15%" align="center">{{quantity}}</td><td width="30%" align="right">{{itemTotal}}</td></tr>{{/items}}</table><hr><table><tr><td width="60%"><b>Total:</b></td><td width="40%" align="right"><b>Rs. {{totalAmount}}</b></td></tr></table>Payment: {{paymentMethod}}<hr><center>By: {{cashierName}}</center><center><b>*** ORDER CONFIRMED ***</b></center><center>Printed: {{printTime}}</center>',
     '["{{branchName}}", "{{orderId}}", "{{orderNumber}}", "{{timestamp}}", "{{date}}", "{{time}}", "{{printTime}}", "{{staffName}}", "{{staffId}}", "{{customerName}}", "{{consumerId}}", "{{items}}", "{{name}}", "{{quantity}}", "{{price}}", "{{itemTotal}}", "{{totalAmount}}", "{{paymentMethod}}", "{{orderType}}", "{{transactionType}}", "{{cashierName}}"]'),
    ('Default Custom Order Template', 'CUSTOM_ORDER',
     'Slip for custom/event orders printed when items are added via Add Custom Item',
     '<center><b>{{branchName}}</b></center><center><b>CUSTOM ORDER</b></center><hr>Event: {{eventName}}<br>By: {{eventBy}}<br>Staff: {{staffName}}<br>{{date}} {{time}}<hr><table><tr><th width="55%">Item</th><th width="15%" align="center">Qty</th><th width="30%" align="right">Amt</th></tr>{{#items}}<tr><td width="55%">{{name}}</td><td width="15%" align="center">{{quantity}}</td><td width="30%" align="right">{{itemTotal}}</td></tr>{{/items}}</table><hr><table><tr><td width="60%"><b>TOTAL</b></td><td width="40%" align="right"><b>Rs. {{totalAmount}}</b></td></tr></table><hr><center>Printed: {{printTime}}</center>',
     '["{{branchName}}", "{{eventName}}", "{{eventBy}}", "{{staffName}}", "{{cashierName}}", "{{date}}", "{{time}}", "{{timestamp}}", "{{printTime}}", "{{items}}", "{{name}}", "{{quantity}}", "{{price}}", "{{itemTotal}}", "{{remarks}}", "{{totalAmount}}", "{{itemCount}}"]'),
    ('Default Bill Template', 'BILL',
     'Customer bill with itemized charges',
     '<center><b>{{branchName}}</b></center><center><b>BILL</b></center><hr>Ref: {{orderId}}<br>{{timestamp}}<br>By: {{cashierName}}<hr><table><tr><th width="55%">Item</th><th width="15%" align="center">Qty</th><th width="30%" align="right">Amt</th></tr>{{#items}}<tr><td width="55%">{{name}}</td><td width="15%" align="center">{{quantity}}</td><td width="30%" align="right">{{itemTotal}}</td></tr>{{/items}}</table><hr><table><tr><td width="60%"><b>TOTAL</b></td><td width="40%" align="right"><b>Rs. {{totalAmount}}</b></td></tr><tr><td width="60%">Payment:</td><td width="40%" align="right">{{paymentMethod}}</td></tr></table><hr><center><b>THANK YOU!</b></center><center>Printed: {{printTime}}</center>',
     '["{{branchName}}", "{{billNumber}}", "{{orderId}}", "{{orderNumber}}", "{{date}}", "{{time}}", "{{timestamp}}", "{{printTime}}", "{{customerName}}", "{{consumerId}}", "{{staffName}}", "{{cashierName}}", "{{items}}", "{{name}}", "{{quantity}}", "{{price}}", "{{itemTotal}}", "{{subtotal}}", "{{tax}}", "{{totalAmount}}", "{{paymentMethod}}", "{{dueAmount}}", "{{transactionType}}"]'),
    ('Default Receipt Template', 'RECEIPT',
     'Compact payment receipt for 80mm thermal printers',
     '<center><b>{{branchName}}</b></center><center><b>RECEIPT</b></center><hr>Ref: {{receiptNumber}}<br>{{timestamp}}<br>By: {{cashierName}}<hr><table><tr><th width="55%">Item</th><th width="15%" align="center">Qty</th><th width="30%" align="right">Amt</th></tr>{{#items}}<tr><td width="55%">{{name}}</td><td width="15%" align="center">{{quantity}}</td><td width="30%" align="right">{{itemTotal}}</td></tr>{{/items}}</table><hr><table><tr><td width="60%"><b>TOTAL</b></td><td width="40%" align="right"><b>Rs. {{totalAmount}}</b></td></tr><tr><td width="60%">Payment:</td><td width="40%" align="right">{{paymentMethod}}</td></tr></table><hr><center><b>THANK YOU!</b></center><center>Printed: {{printTime}}</center>',
     '["{{branchName}}", "{{receiptNumber}}", "{{orderId}}", "{{orderNumber}}", "{{date}}", "{{time}}", "{{timestamp}}", "{{printTime}}", "{{customerName}}", "{{consumerId}}", "{{staffName}}", "{{cashierName}}", "{{items}}", "{{name}}", "{{quantity}}", "{{price}}", "{{itemTotal}}", "{{subtotal}}", "{{tax}}", "{{totalAmount}}", "{{paymentMethod}}", "{{transactionType}}"]'),
    ('Default Invoice Template', 'INVOICE',
     'Standard customer invoice with itemized breakdown and payment details',
     '<center><b>{{branchName}}</b></center><center><b>INVOICE</b></center><hr>Invoice: {{invoiceNumber}}<br>{{date}}<br>Customer: {{customerName}}<br>By: {{cashierName}}<hr><table><tr><th width="55%">Item</th><th width="15%" align="center">Qty</th><th width="30%" align="right">Amt</th></tr>{{#items}}<tr><td width="55%">{{name}}</td><td width="15%" align="center">{{quantity}}</td><td width="30%" align="right">{{itemTotal}}</td></tr>{{/items}}</table><hr><table><tr><td width="60%">Subtotal:</td><td width="40%" align="right">Rs. {{subtotal}}</td></tr><tr><td width="60%">Tax:</td><td width="40%" align="right">Rs. {{tax}}</td></tr><tr><td width="60%"><b>TOTAL</b></td><td width="40%" align="right"><b>Rs. {{totalAmount}}</b></td></tr></table><hr><center>Printed: {{printTime}}</center>',
     '["{{branchName}}", "{{invoiceNumber}}", "{{orderId}}", "{{orderNumber}}", "{{date}}", "{{time}}", "{{timestamp}}", "{{printTime}}", "{{customerName}}", "{{consumerId}}", "{{staffName}}", "{{cashierName}}", "{{items}}", "{{name}}", "{{quantity}}", "{{price}}", "{{itemTotal}}", "{{subtotal}}", "{{tax}}", "{{totalAmount}}", "{{paymentMethod}}", "{{transactionType}}"]'),
    ('Default Payout Template', 'PAYOUT',
     'Staff payout slip with recipient, amount, reason, and authorization details',
     '<center><b>{{branchName}}</b></center><center><b>PAYOUT</b></center><hr>Payout: {{payoutNumber}}<br>{{date}}<br>To: {{recipientName}}<br>Reason: {{reason}}<br>Approved: {{approvedBy}}<hr><table><tr><td width="60%"><b>AMOUNT</b></td><td width="40%" align="right"><b>Rs. {{amount}}</b></td></tr></table><hr><center>By: {{cashierName}}</center><center>Printed: {{printTime}}</center>',
     '["{{branchName}}", "{{payoutNumber}}", "{{date}}", "{{time}}", "{{timestamp}}", "{{printTime}}", "{{recipientName}}", "{{amount}}", "{{reason}}", "{{approvedBy}}", "{{cashierName}}"]')
) AS v(name, type, description, template_html, placeholders)
CROSS JOIN (SELECT '* { box-sizing: border-box; } body { font-family: "Courier New", Courier, monospace; font-size: 13px; margin: 0; padding: 8px; background: white; width: 72mm; } center { display: block; text-align: center; } hr { border: none; border-top: 1px dashed #000; margin: 6px 0; } table { width: 100%; border-collapse: collapse; margin: 4px 0; table-layout: fixed; } th, td { padding: 3px 0; vertical-align: top; word-break: break-word; font-size: 13px; } @media print { @page { size: auto; margin: 0; } body { padding: 0; } }'::text AS css) AS s
WHERE NOT EXISTS (
    SELECT 1 FROM document_templates d
    WHERE d.type = v.type AND d.is_default = TRUE AND d.branch_id IS NULL
);


-- =============================================================================
-- 13. DATA RECONCILIATION (existing installs only)
-- =============================================================================
-- Remove references to retired modules from stored data. Every statement is
-- filtered so it matches nothing on a fresh or already-clean database.

-- Permissions of retired modules
UPDATE roles
SET permissions = permissions
    - 'VIEW_ANALYTICS' - 'ACCESS_CUSTOMER_DISPLAY' - 'MANAGE_BRANDING'
    - 'COUPON_VIEW' - 'COUPON_GENERATE' - 'COUPON_EDIT' - 'COUPON_DELETE'
    - 'COUPON_BULK_IMPORT' - 'COUPON_VERIFY' - 'COUPON_PRINT'
    - 'VIEW_INVENTORY' - 'MANAGE_INVENTORY' - 'INVENTORY_MANAGE'
    - 'RECEIVE_STOCK' - 'TRANSFER_STOCK' - 'VIEW_TRANSFERS'
    - 'ACCESS_TABLE_ORDERS' - 'MANAGE_TABLES'
    - 'SELF_SERVICE_VIEW_LOGS'
WHERE permissions ?| ARRAY[
    'VIEW_ANALYTICS', 'ACCESS_CUSTOMER_DISPLAY', 'MANAGE_BRANDING',
    'COUPON_VIEW', 'COUPON_GENERATE', 'COUPON_EDIT', 'COUPON_DELETE',
    'COUPON_BULK_IMPORT', 'COUPON_VERIFY', 'COUPON_PRINT',
    'VIEW_INVENTORY', 'MANAGE_INVENTORY', 'INVENTORY_MANAGE',
    'RECEIVE_STOCK', 'TRANSFER_STOCK', 'VIEW_TRANSFERS',
    'ACCESS_TABLE_ORDERS', 'MANAGE_TABLES',
    'SELF_SERVICE_VIEW_LOGS'];

-- API key scopes of retired modules. A key scoped only to retired paths is
-- revoked (with no scope left it would fall back to unscoped legacy access);
-- other keys just lose the retired entries.
UPDATE api_keys
SET revoked_at = NOW()
WHERE revoked_at IS NULL
  AND scope ~* '(^|,)\s*(inventory|tables)\s*(,|$)'
  AND NOT EXISTS (
      SELECT 1 FROM unnest(string_to_array(scope, ',')) AS s
      WHERE btrim(lower(s)) NOT IN ('inventory', 'tables', '')
  );

UPDATE api_keys
SET scope = (
        SELECT string_agg(btrim(s), ',')
        FROM unnest(string_to_array(scope, ',')) AS s
        WHERE btrim(lower(s)) NOT IN ('inventory', 'tables', '')
    )
WHERE revoked_at IS NULL
  AND scope ~* '(^|,)\s*(inventory|tables)\s*(,|$)';

-- Document-template placeholders of retired modules
UPDATE document_templates
SET placeholders = placeholders
        - '{{tableNumber}}' - '{{guestCount}}' - '{{kotNumber}}'
        - '{{couponCode}}' - '{{couponRecipientName}}' - '{{couponEventTitle}}',
    updated_at = NOW()
WHERE placeholders ?| ARRAY['{{tableNumber}}', '{{guestCount}}', '{{kotNumber}}',
                            '{{couponCode}}', '{{couponRecipientName}}', '{{couponEventTitle}}'];

UPDATE document_templates
SET template_html = replace(replace(template_html,
        'Table: {{tableNumber}}<br>', ''),
        '<br>Guests: {{guestCount}}', ''),
    updated_at = NOW()
WHERE is_default = TRUE AND branch_id IS NULL
  AND type IN ('KOT', 'BILL')
  AND (template_html LIKE '%Table: {{tableNumber}}<br>%' OR template_html LIKE '%<br>Guests: {{guestCount}}%');

-- Settings of retired modules: stored branding, and custom Excel template
-- references in email templates (attachments use the built-in templates).
DELETE FROM system_settings WHERE key = 'app_branding';

UPDATE system_settings
SET value = (value::jsonb - 'attachmentTemplateId')::text,
    updated_at = NOW()
WHERE key LIKE 'email\_template%'
  AND CASE WHEN value LIKE '%attachmentTemplateId%'
           THEN value::jsonb ? 'attachmentTemplateId'
           ELSE FALSE END;

-- =============================================================================
-- End of schema
-- =============================================================================
