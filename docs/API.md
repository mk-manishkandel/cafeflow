# CafeFlow API

CafeFlow exposes two distinct APIs for external use. They are **not interchangeable**:

| | [Part 1: Integration API](#part-1-integration-api) | [Part 2: Student ordering API](#part-2-student-ordering-api) |
|---|---|---|
| Audience | Server-to-server integrations (HR, finance, reporting systems) | The browser-based student pre-ordering app |
| Auth | Static `X-API-Key` header | CSRF token + session cookie + origin allowlist |
| Paths | `/api/dashboard`, `/api/staff`, `/api/consumers`, `/api/transactions`, `/api/menu`, `/api/ledger` | `/api/public/*` |

All examples use `https://pos.example.com` as the POS base URL. Responses are JSON.
Errors come back as `{"error": "..."}` with a 4xx/5xx status. Timestamps are UTC
ISO-8601, so convert them to the server's configured timezone (`TZ`) for display.

---

## Part 1: Integration API

### Authentication

1. In CafeFlow, go to **Business Setup → API Keys → Generate Key** as an admin.
2. Name the key and choose a branch, or **System Wide** for cross-branch access.
3. Copy the key. It is shown **only once**; if it's lost, revoke it and generate a new one.

Send the key on every request:

```http
X-API-Key: pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

No OAuth, cookies, CSRF token or request signing are needed, and that includes
`POST`/`PUT`/`DELETE`. Keys don't expire. Revoking one takes effect immediately.

### Access model

Keys issued from Business Setup have a single **full** scope. It grants read access to the
dashboard, transactions, menu and ledger, plus read/write access to staff and consumers.
Nothing more fine-grained is enforced, so an integration should only call the endpoints
it needs.

A key can't do any of the following:

- Reach any other path, such as `/api/branches`, `/api/users`, `/api/roles` or
  `/api/print`. Those return `403`.
- Create, edit or delete menu items or POS transactions (menu and transactions are read-only).
- Override a staff or consumer balance directly (see [Caveats](#caveats)).

A **branch-scoped** key only sees and creates data in its own branch. A **System Wide**
key works across all branches. Every write made with a key is recorded in the Audit Log,
attributed as `API Key: <name> (<prefix>)`.

### Read endpoints

#### Dashboard

```http
GET /api/dashboard/stats?branchId=<uuid>&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
```

```json
{
  "totalRevenue": 125340.5,
  "totalCount": 842,
  "staffCount": 240,
  "menuCount": 96,
  "paymentBreakdown": [{ "name": "Cash", "type": "…", "revenue": 50000.0, "count": 300 }],
  "typeBreakdown": [
    { "name": "Staff", "revenue": 60000.0, "count": 400 },
    { "name": "Consumer", "revenue": 55340.5, "count": 400 },
    { "name": "POS-N", "revenue": 10000.0, "count": 42 }
  ],
  "salesChart": [{ "name": "Mon", "date": "2026-08-10", "sales": 15000.0 }],
  "topItems": [{ "name": "Chicken Momo", "quantity": 120, "revenue": 18000.0 }],
  "branchBreakdown": [{ "id": "…", "name": "Main Canteen", "revenue": 90000.0, "count": 600, "Staff": 40000.0, "Consumer": 45000.0, "POS-N": 5000.0 }],
  "recentPayments": [{ "id": "…", "date": "…", "amount": 380.0, "mop": "Cash", "type": "Staff", "branch": "Main Canteen" }]
}
```

#### Transactions (also used by the consumption and item sales reports)

```http
GET /api/transactions?branchId=<uuid>&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&userType=staff,consumer,pos-n&page=1&limit=100
```

- `staffId=<id>` or `consumerId=<uuid>` returns one person's itemised purchase history.
- `reportType=item_sales` returns quantity and revenue aggregated per item instead of raw rows.

```json
{
  "data": [{
    "id": "3f9e2a10-…", "staffId": "STF001", "consumerId": null, "staffName": "Jane Doe",
    "totalAmount": 380.0, "timestamp": "2026-08-18T09:12:00.000Z", "status": "COMPLETED",
    "items": [{ "name": "Chicken Momo", "price": 150, "quantity": 2 }],
    "branchId": "…", "branchName": "Main Canteen",
    "paymentMethod": "BALANCE", "cashierName": "cashier1"
  }],
  "pagination": { "total": 842, "page": 1, "limit": 100, "totalPages": 9 },
  "aggregates": { "totalAmount": 125340.5 }
}
```

#### Menu

```http
GET /api/menu?branchId=<uuid>&page=1&limit=20&search=&sortBy=name|price|category|available&sortOrder=asc|desc
GET /api/menu/categories
```

#### Account statement (ledger)

```http
GET /api/ledger?entityType=STAFF|CONSUMER&entityId=<id>&page=1&limit=50
```

Returns one person's balance changes (CREDIT/DEBIT) with the balance before and after
each entry, plus `currentBalance`. The `reference_id` field points at the source
transaction.

### Staff (read and write)

| Method & path | Notes |
|---|---|
| `GET /api/staff?page=&limit=&search=&status=ACTIVE\|INACTIVE\|ALL&sortBy=&sortOrder=` | Omit `page` for the full list |
| `POST /api/staff` | Body: `{ name, email, mobileNumber?, department?, monthlyAllowance?, status? }` → `{ "success": true }` |
| `PUT /api/staff/:id` | Same body. Don't send a changed `currentBalance` (returns `403`) |
| `DELETE /api/staff/:id` | Soft delete (`status = 'INACTIVE'`) |
| `POST /api/staff/:id/reset-allowance` | Reset one person's allowance |
| `POST /api/staff/reset-allowances` | Reset all. **Requires an `Idempotency-Key` header** |
| `POST /api/staff/bulk-import` | `{ "staffList": [{ name, email, department, monthlyAllowance }] }`, upserts by email, max 500 rows → `{ success, created, updated, errors }` |
| `GET /api/staff/export` | Excel file |

### Consumers (read and write)

| Method & path | Notes |
|---|---|
| `GET /api/consumers?page=&limit=&search=&status=&sortBy=&sortOrder=` | |
| `POST /api/consumers` | Body: `{ name, email, mobileNumber?, category? = "Part-time", openingBalance? }` → the created record |
| `PUT /api/consumers/:id` | Same body. There is no balance field |
| `DELETE /api/consumers/:id` | Soft delete (`is_active = false`). Returns `400` unless the balance is 0 |
| `POST /api/consumers/:id/settle` | `{ paymentAmount, paymentMethod, remarks? }`, with `0 < paymentAmount ≤ 999,999,999`. **Requires `Idempotency-Key`** |
| `POST /api/consumers/reset-allowances` | **Requires `Idempotency-Key`** |
| `GET /api/consumers/export` | Excel file |

`Idempotency-Key` (the legacy name `X-Idempotency-Key` is also accepted) must be unique
per logical operation; a UUID works. A request that repeats a key within 24 hours gets
the stored result back instead of running again. Requests without the header get `400`.

### Caveats

1. **New records go to the key's branch.** A branch-scoped key ignores any `branchId`
   you send. A System Wide key creates global records (`branch_id = NULL`) unless you
   pass `branchId`.
2. **Balances can't be set directly.** They change only through transactions, allowance
   resets or `settle`.
3. **Deletes are soft.** Financial history is always kept.
4. **`name` and `email` are required and can't be blank.** Emails are unique, and a
   duplicate returns `400 {"error": "Email already exists"}`.
5. **Branch-scoped keys can't touch other branches.** Writes to records in another
   branch return `404`/`403`.

### Errors

| Status | Meaning | Action |
|--------|---------|--------|
| `400` | Validation failure, duplicate email, non-zero balance on delete, missing `Idempotency-Key` | Fix the request |
| `401` | Missing, invalid or revoked key | Fix configuration; don't retry |
| `403` | Path outside the key's scope, cross-branch write, balance override | Fix the request; don't retry |
| `404` | Not found (or not visible to this key's branch) | Fix the request |
| `429` | Rate limited | Back off and retry |
| `500` | Server error | Retry with backoff; alert if it persists |

### Rate limits

Limits are counted per source IP:

| Scope | Limit |
|-------|-------|
| All `/api/*` requests | 120 / minute |
| `/api/transactions` | an additional 60 / minute |
| `reset-allowance(s)`, `settle` | 30 / minute |
| `staff/bulk-import` | 5 / 15 minutes |
| `consumers/reset-allowances` | an additional 3 / 15 minutes |

### Example

```js
const API = process.env.CAFEFLOW_API_BASE;      // e.g. https://pos.example.com
const KEY = process.env.CAFEFLOW_API_KEY;

async function call(method, path, body, headers = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${data.error}`);
  return data;
}

// Paginate through transactions
async function allTransactions(startDate, endDate) {
  const rows = [];
  for (let page = 1; ; page++) {
    const res = await call('GET', `/api/transactions?startDate=${startDate}&endDate=${endDate}&page=${page}&limit=200`);
    rows.push(...res.data);
    if (page >= res.pagination.totalPages) break;
  }
  return rows;
}

await call('POST', '/api/staff', { name: 'Jane Doe', email: 'jane@example.com', department: 'Science', monthlyAllowance: 5000 });
await call('POST', '/api/consumers/<id>/settle', { paymentAmount: 500, paymentMethod: 'CASH' },
           { 'Idempotency-Key': crypto.randomUUID() });
```

```bash
curl -s "https://pos.example.com/api/dashboard/stats?startDate=2026-08-01&endDate=2026-08-18" \
  -H "X-API-Key: $CAFEFLOW_API_KEY"
```

### Integration checklist

- [ ] The key is stored as a server-side secret and never exposed to browsers
- [ ] `401`/`403` responses are logged and alerted on, not retried
- [ ] `429` responses trigger backoff
- [ ] Large lists (staff, consumers, transactions) are paginated
- [ ] Financial endpoints send a fresh `Idempotency-Key` for each operation
- [ ] Consumer balances are settled to 0 before deleting
- [ ] The key's branch scope matches what the integration needs

---

## Part 2: Student ordering API

This is the API behind the bundled [`student-order/`](../student-order) app. Setup is
described in [DEPLOYMENT.md](../DEPLOYMENT.md#student-ordering-app).

### Flow

```
1. Setup   → GET CSRF token, GET branches, POST session
2. Order   → GET today's menu, POST the order → order ID (YYYY-MM-DD-NNNN)
3. Pickup  → cashier enters the order ID in the POS-N terminal; items load into the cart
```

### Security requirements

- **Origin allowlist.** `GET /api/public/student-menu` and `POST /api/public/student-orders`
  only accept requests whose `Origin` header exactly equals `STUDENT_ORDER_ALLOWED_ORIGIN`.
  Anything else gets `403`, as does every request when that variable is unset.
- **CSRF.** Every `POST` needs the `X-CSRF-Token` header. Send all requests with
  `credentials: 'include'` so the `_csrf_secret` cookie goes along.
- **Optional shared secret.** When the server sets `STUDENT_CLIENT_SECRET`, the two
  endpoints above also require the header `x-cafeflow-client: <secret>`, and return
  `401` without it.

### Endpoints

#### `GET /api/public/csrf-token`

```json
{ "csrfToken": "abc123…" }
```

Keep the token in memory and send it as `X-CSRF-Token` on every `POST`.

#### `GET /api/public/branches`

Lists branches that have self-service enabled.

```json
[{ "id": "550e8400-e29b-41d4-a716-446655440000", "name": "Main Canteen" }]
```

#### `POST /api/public/self-service/session`

```json
// request
{ "branchId": "550e8400-e29b-41d4-a716-446655440000" }
// response
{ "sessionId": "7f3c9a2e-1b4d-4e8f-9c0a-2d3e4f5a6b7c" }
```

Create one session per page load and keep it in memory, not `localStorage`. A session
is single-use and is completed when an order is placed.

#### `GET /api/public/student-menu?branchId=<uuid>`

Returns items marked as today's menu. Without `branchId`, it returns today's items for
every branch; each item includes `branchName`.

```json
[{ "id": "12", "name": "Chicken Momo", "price": 150.0, "category": "Snacks",
   "image": "/api/uploads/menu/momo.webp", "branchId": "…", "branchName": "Main Canteen" }]
```

#### `POST /api/public/student-orders`

```json
{
  "sessionId": "7f3c9a2e-…",
  "branchId": "550e8400-…",
  "studentEmail": "student@example.com",
  "items": [
    { "id": "12", "name": "Chicken Momo", "price": 150.0, "category": "Snacks", "quantity": 2 },
    { "id": "31", "name": "Orange Juice", "price": 80.0, "category": "Beverages", "quantity": 1 }
  ],
  "totalAmount": 380.0
}
```

| Field | Rules |
|-------|-------|
| `sessionId` | UUID of a valid, open session for this branch |
| `branchId` | UUID of a branch with self-service enabled |
| `studentEmail` | Valid email, max 255 characters |
| `items` | 1–50 items. `quantity` is an integer from 1 to 99 |
| `totalAmount` | Must match current menu prices within ±0.01 |

The server re-prices each item from the database and ignores the client-supplied
names and prices. If the total doesn't match, it returns
`400 {"error": "Menu prices have changed. Please refresh the menu and try again."}`.

A successful order returns `201 { "orderId": "2026-06-02-0001" }`. The order ID is the
date in the server timezone plus a daily sequence number. A confirmation email with the
order ID and an itemised summary is sent to `studentEmail`.

### Pickup at the POS

The cashier opens the **POS-N terminal** and enters the order ID. The order's items
load into the cart, and checkout proceeds as normal. Order status moves from `PENDING`
to `LOADED_TO_POS` to `COMPLETED`. Cancelled, completed and already-loaded orders are
rejected.

### Errors and rate limits

| Status | Cause |
|--------|-------|
| `400` | Validation failed (`details` array included), items no longer available, or total mismatch |
| `401` | Invalid or expired session, or a missing/invalid `x-cafeflow-client` header when the shared secret is enabled |
| `403` | Wrong `Origin`, allowlist not configured, self-service disabled for the branch, or bad CSRF token |
| `409` | Order already submitted for this session |
| `429` | Rate limited |

| Endpoint | Limit (per IP) |
|----------|----------------|
| `POST /api/public/student-orders` | 5 / minute |
| `POST /api/public/self-service/session` | 10 / minute |
| `GET /api/public/branches` | 60 / minute |
| Everything under `/api` | 120 / minute |
