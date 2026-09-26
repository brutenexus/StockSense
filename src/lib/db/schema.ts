/**
 * Schema migrations.
 *
 * StockSense talks directly to SQLite through Node's built-in `node:sqlite`
 * driver. Migrations are plain, ordered SQL batches applied inside a single
 * transaction and tracked in `schema_migrations`, which keeps the project free
 * of native build steps, code generation and external services.
 */
export type Migration = { id: string; sql: string };

export const MIGRATIONS: Migration[] = [
  {
    id: '001_core',
    sql: /* sql */ `
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      login_id      TEXT NOT NULL UNIQUE,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'STAFF',
      phone         TEXT,
      job_title     TEXT,
      accent        TEXT NOT NULL DEFAULT 'indigo',
      is_active     INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      user_agent TEXT,
      ip         TEXT,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS otp_codes (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose      TEXT NOT NULL DEFAULT 'PASSWORD_RESET',
      code_hash    TEXT NOT NULL,
      channel      TEXT NOT NULL DEFAULT 'EMAIL',
      destination  TEXT,
      attempts     INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at   TEXT NOT NULL,
      consumed_at  TEXT,
      created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_otp_lookup ON otp_codes(user_id, purpose, consumed_at);

    CREATE TABLE IF NOT EXISTS warehouses (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      short_code    TEXT NOT NULL UNIQUE,
      address       TEXT,
      contact_name  TEXT,
      contact_phone TEXT,
      is_default    INTEGER NOT NULL DEFAULT 0,
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS locations (
      id           TEXT PRIMARY KEY,
      warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      parent_id    TEXT REFERENCES locations(id) ON DELETE SET NULL,
      name         TEXT NOT NULL,
      short_code   TEXT NOT NULL,
      kind         TEXT NOT NULL DEFAULT 'INTERNAL',
      address      TEXT,
      is_active    INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL,
      UNIQUE (warehouse_id, short_code)
    );
    CREATE INDEX IF NOT EXISTS idx_locations_wh ON locations(warehouse_id);

    CREATE TABLE IF NOT EXISTS categories (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      code        TEXT,
      color       TEXT NOT NULL DEFAULT 'slate',
      description TEXT,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS partners (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      kind         TEXT NOT NULL DEFAULT 'VENDOR',
      contact_name TEXT,
      email        TEXT,
      phone        TEXT,
      address      TEXT,
      gstin        TEXT,
      is_active    INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id            TEXT PRIMARY KEY,
      sku           TEXT NOT NULL UNIQUE,
      barcode       TEXT,
      name          TEXT NOT NULL,
      description   TEXT,
      category_id   TEXT REFERENCES categories(id) ON DELETE SET NULL,
      uom           TEXT NOT NULL DEFAULT 'Unit',
      cost_price    REAL NOT NULL DEFAULT 0,
      sale_price    REAL NOT NULL DEFAULT 0,
      reorder_point REAL NOT NULL DEFAULT 0,
      reorder_qty   REAL NOT NULL DEFAULT 0,
      accent        TEXT NOT NULL DEFAULT 'slate',
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

    CREATE TABLE IF NOT EXISTS stock_balances (
      id          TEXT PRIMARY KEY,
      product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      quantity    REAL NOT NULL DEFAULT 0,
      reserved    REAL NOT NULL DEFAULT 0,
      updated_at  TEXT NOT NULL,
      UNIQUE (product_id, location_id)
    );
    CREATE INDEX IF NOT EXISTS idx_balance_location ON stock_balances(location_id);

    CREATE TABLE IF NOT EXISTS documents (
      id               TEXT PRIMARY KEY,
      reference        TEXT NOT NULL UNIQUE,
      type             TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'DRAFT',
      warehouse_id     TEXT NOT NULL REFERENCES warehouses(id),
      from_location_id TEXT REFERENCES locations(id),
      to_location_id   TEXT REFERENCES locations(id),
      partner_id       TEXT REFERENCES partners(id),
      partner_name     TEXT,
      schedule_date    TEXT,
      responsible_id   TEXT REFERENCES users(id),
      operation_type   TEXT,
      address          TEXT,
      priority         TEXT NOT NULL DEFAULT 'NORMAL',
      notes            TEXT,
      seq              INTEGER NOT NULL DEFAULT 1,
      created_by       TEXT REFERENCES users(id),
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL,
      confirmed_at     TEXT,
      done_at          TEXT,
      canceled_at      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_documents_type_status ON documents(type, status);
    CREATE INDEX IF NOT EXISTS idx_documents_schedule ON documents(schedule_date);

    CREATE TABLE IF NOT EXISTS document_lines (
      id             TEXT PRIMARY KEY,
      document_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      product_id     TEXT NOT NULL REFERENCES products(id),
      quantity       REAL NOT NULL DEFAULT 0,
      done_quantity  REAL NOT NULL DEFAULT 0,
      reserved_qty   REAL NOT NULL DEFAULT 0,
      uom            TEXT,
      unit_cost      REAL NOT NULL DEFAULT 0,
      position       INTEGER NOT NULL DEFAULT 0,
      note           TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_lines_document ON document_lines(document_id);
    CREATE INDEX IF NOT EXISTS idx_lines_product ON document_lines(product_id);

    CREATE TABLE IF NOT EXISTS stock_moves (
      id               TEXT PRIMARY KEY,
      reference        TEXT NOT NULL,
      document_id      TEXT REFERENCES documents(id) ON DELETE SET NULL,
      document_type    TEXT NOT NULL,
      document_line_id TEXT,
      product_id       TEXT NOT NULL REFERENCES products(id),
      from_location_id TEXT REFERENCES locations(id),
      to_location_id   TEXT REFERENCES locations(id),
      location_id      TEXT REFERENCES locations(id),
      quantity         REAL NOT NULL,
      direction        TEXT NOT NULL,
      unit_cost        REAL NOT NULL DEFAULT 0,
      balance_after    REAL,
      note             TEXT,
      created_by       TEXT REFERENCES users(id),
      created_at       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_moves_product ON stock_moves(product_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_moves_created ON stock_moves(created_at);
    CREATE INDEX IF NOT EXISTS idx_moves_document ON stock_moves(document_id);

    CREATE TABLE IF NOT EXISTS reorder_rules (
      id           TEXT PRIMARY KEY,
      product_id   TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      warehouse_id TEXT REFERENCES warehouses(id) ON DELETE CASCADE,
      location_id  TEXT REFERENCES locations(id) ON DELETE CASCADE,
      min_qty      REAL NOT NULL DEFAULT 0,
      max_qty      REAL NOT NULL DEFAULT 0,
      qty_to_order REAL NOT NULL DEFAULT 0,
      auto_draft   INTEGER NOT NULL DEFAULT 0,
      is_active    INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reorder_product ON reorder_rules(product_id);

    CREATE TABLE IF NOT EXISTS notifications (
      id          TEXT PRIMARY KEY,
      kind        TEXT NOT NULL,
      severity    TEXT NOT NULL DEFAULT 'INFO',
      title       TEXT NOT NULL,
      body        TEXT,
      entity_type TEXT,
      entity_id   TEXT,
      dedupe_key  TEXT UNIQUE,
      is_read     INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read, created_at);

    CREATE TABLE IF NOT EXISTS activity_log (
      id          TEXT PRIMARY KEY,
      user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
      user_name   TEXT,
      action      TEXT NOT NULL,
      entity_type TEXT,
      entity_id   TEXT,
      summary     TEXT,
      meta        TEXT,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);

    CREATE TABLE IF NOT EXISTS counters (
      key   TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );
  `,
  },
];
