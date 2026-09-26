# StockSense — API & Database Reference

Stack: **Next.js 16 route handlers** (REST-style, JSON) over **SQLite** via Node's built-in `node:sqlite` driver. All endpoints return a consistent JSON envelope; errors are typed `HttpError` responses (`401/403/404/400`) with optional per-field details. Auth is session-cookie based (bcrypt password hashes, hashed session tokens, OTP codes for self-service password reset).

## Authentication & roles

- **Roles:** `MANAGER` (all 14 capabilities), `STAFF` (transfers, adjustments, validate receipt/transfer/adjustment, cancel).
- Session tokens are stored hashed; sessions can be revoked. OTP reset codes expire and cap attempts.
- Every mutation endpoint checks a **capability** (`create_receipt`, `validate_delivery`, `manage_users`, …) — see the "Access" column.

## API — 40 endpoints

### Auth (5)
| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | public | Sign in, create session |
| POST | `/api/auth/signup` | public | Self sign-up (staff role) |
| POST | `/api/auth/logout` | session | Revoke current session |
| POST | `/api/auth/forgot` | public | Issue OTP code for password reset |
| POST | `/api/auth/reset` | public | Consume OTP, set new password |

### Products & catalog (6)
| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/products` | session | List/filter (query, category, stock health, sort, paging) |
| POST | `/api/products` | `manage_products` | Create product |
| GET | `/api/products/:id` | session | Product detail incl. per-location balances |
| PATCH | `/api/products/:id` | `manage_products` | Update product |
| DELETE | `/api/products/:id` | `manage_products` | Deactivate/remove product |
| POST | `/api/products/:id/stock` | `create_adjustment` or `manage_products` | **"Update stock from here"**: books + validates a real ADJUSTMENT document so the change flows through ledger/audit (no direct balance edits) |

### Categories, partners, warehouses & locations (10)
| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET / POST | `/api/categories` | session / `manage_products` | List / create category |
| PATCH / DELETE | `/api/categories/:id` | `manage_products` | Update / delete category |
| GET / POST | `/api/partners` | session / `manage_settings` | List / create vendors & customers |
| PATCH / DELETE | `/api/partners/:id` | `manage_settings` | Update / delete partner |
| GET / POST | `/api/warehouses` | session / `manage_warehouses` | List / create warehouses |
| PATCH / DELETE | `/api/warehouses/:id` | `manage_warehouses` | Update / delete warehouse |
| GET / POST | `/api/locations` | session / `manage_warehouses` | List / create storage locations |
| PATCH / DELETE | `/api/locations/:id` | `manage_warehouses` | Update / delete location |

### Documents — the core workflow (8)
| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/documents` | session | List by type/status/date/priority (Receipts, Deliveries, Transfers, Adjustments) |
| POST | `/api/documents` | `create_<type>` | Create document with lines; type ∈ RECEIPT / DELIVERY / TRANSFER / ADJUSTMENT |
| GET via UI | `documentHref()` | — | Server helper maps type → list/detail page |
| PATCH | `/api/documents/:id` | `create_<type>` (owner floor) | Edit draft (lines, schedule, partner, notes) |
| DELETE | `/api/documents/:id` | `cancel_document` | Delete draft / cancel per state machine |
| POST | `/api/documents/:id/actions` | per action (see below) | **Workflow engine** — body `{ action }` |
| | `action: "confirm"` | creator or validator | Draft → Ready (reserves stock for deliveries) |
| | `action: "validate"` | `validate_<type>` (manager sign-off) | Ready → Done; posts stock moves; unblocks Waiting deliveries; syncs alerts |
| | `action: "cancel"` | `cancel_document` | Releases reservations; terminal state |
| | `action: "reset"` | creator or validator | Done/Canceled → Draft (reversible demo safety) |
| | response | — | `{ document, moves, promoted }` — moves posted & documents unblocked |

### Users, notifications & settings (6)
| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET / POST | `/api/users` | `manage_users` | List team / invite user |
| PATCH | `/api/users/:id` | `manage_users` | Update role, profile, active flag (can't deactivate yourself) |
| POST | `/api/users/:id` | `manage_users` | Manager-driven password reset |
| GET / POST | `/api/notifications` | session | Feed (low stock, out of stock, late docs) / mark read |
| POST | `/api/settings/data` | `manage_settings` | Data tools: **reseed demo data** / clear, typed confirmation required |

## Database — SQLite (`data/stocksense.db`), 16 tables

Migrations are ordered SQL batches in `src/lib/db/schema.ts`, applied in one transaction and tracked in `schema_migrations`. All money/quantity columns are `REAL`; timestamps are ISO strings.

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Team accounts | `login_id`*, `email`*, `password_hash`, `role` (MANAGER/STAFF), `accent`, `is_active` |
| `sessions` | Auth sessions (hashed tokens) | `user_id`→users, `token_hash`*, `expires_at`, `revoked_at` |
| `otp_codes` | Self-service password reset | `user_id`, `purpose`, `code_hash`, `attempts`/`max_attempts`, `expires_at`, `consumed_at` |
| `warehouses` | Sites | `name`, `short_code`*, `is_default` |
| `locations` | Storage bins inside a warehouse; hierarchical | `warehouse_id`→warehouses, `parent_id`→locations, `kind` (INTERNAL/INPUT/OUTPUT/PRODUCTION/TRANSIT), UNIQUE(warehouse, short_code) |
| `categories` | Product groupings | `name`*, `code`, `color` (accent token) |
| `partners` | Vendors & customers | `name`, `kind` (VENDOR/CUSTOMER/BOTH), `gstin` |
| `products` | Catalog | `sku`*, `barcode`, `category_id`, `uom`, `cost_price`, `sale_price`, `reorder_point`, `reorder_qty` |
| `stock_balances` | Derived quantity per product × location | UNIQUE(product_id, location_id), `quantity`, `reserved` — **recomputed from the ledger, never edited directly** |
| `documents` | The 4 workflow doc types | `reference`* (e.g. `WH/IN/0013`), `type`, `status` (DRAFT→WAITING→READY→DONE/CANCELED), `warehouse_id`, from/to locations, `partner_id`, `schedule_date`, `responsible_id`, `priority`, `seq` |
| `document_lines` | Doc line items | `document_id`→documents (cascade), `product_id`, `quantity`, `done_quantity`, `reserved_qty`, `unit_cost`, `position` |
| `stock_moves` | **Append-only ledger** — the source of truth | `reference`, `document_id`, `document_type`, `product_id`, from/to location, `direction` (IN/OUT), `quantity`, `unit_cost`, `balance_after`, `created_by` |
| `reorder_rules` | Per-product/warehouse replenishment policy (auto-draft POs is on the roadmap; `auto_draft` flag already in schema) | `product_id`, `warehouse_id`, `min_qty`, `max_qty`, `qty_to_order`, `auto_draft` |
| `notifications` | Alert feed with dedupe | `kind` (LOW_STOCK/OUT_OF_STOCK/DOCUMENT_LATE/…), `severity`, `entity_type`/`entity_id`, `dedupe_key`*, `is_read` |
| `activity_log` | Who-did-what audit trail | `user_id`/`user_name`, `action` (e.g. `DOCUMENT_VALIDATE`), `entity_type`/`entity_id`, `summary`, `meta` JSON |
| `counters` | Reference-number sequences per warehouse/type | `key`*, `value` |

**Design invariant:** `stock_balances` is a *projection* of `stock_moves`. The only path that changes stock is validating a document, which appends moves and recomputes balances — so every number on screen can be traced to signed, timestamped ledger entries (and exported to CSV).

## Data model at a glance

```
warehouses ─┬─< locations ─┬─< stock_balances >─┬─ products >─ categories
            │              │                     │
            └─< documents ─┴─< document_lines >──┘
                    │                   (users, partners)
                    └─< stock_moves  (append-only ledger)

users ─< sessions / otp_codes        reorder_rules >─ products (+ warehouses/locations)
notifications · activity_log · counters (independent utility tables)
```

## Run it

```bash
npm install
npm run setup      # migrate + seed demo data
npm run dev        # http://localhost:3100  (manager / Manage@123)
npm test           # 36 vitest cases
```
