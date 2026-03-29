# Pay-by-Invoice — Specification

## 1. Overview

A CLI tool for BigCommerce B2B Edition that creates invoices for **arbitrary amounts** against an order. Instead of replicating order line items and splitting costs by percentage, each invoice contains a single descriptive line item at the specified amount. Buyers already see the full order detail in B2B Edition — the invoice just needs to say what the payment is for.

## 2. Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **Testing:** `bun test`
- **Environment:** `.env` (auto-loaded by Bun — no dotenv)

## 3. Environment Variables

```
BC_STORE_HASH=     # Store hash — used in v2 API URLs and as X-Store-Hash header for B2B API
BC_AUTH_TOKEN=     # API token — used as X-Auth-Token header for both v2 and B2B APIs
```

## 4. CLI Usage

```
bun src/index.ts <orderId> <amount> [--description "..."]
```

- `orderId` — required, the BC order to invoice against
- `amount` — required, the invoice amount (arbitrary positive number)
- `--description` — optional, defaults to "Deposit for Order #101" (first invoice) or "Payment for Order #101" (subsequent)

### Examples

```bash
bun src/index.ts 101 283.25                                  # first invoice, auto-description
bun src/index.ts 101 283.25 --description "50% deposit"      # first invoice, custom description
bun src/index.ts 101 200.00 --description "Progress payment"  # subsequent invoice
```

## 5. APIs

### v2 Orders API

Base URL: `https://api.bigcommerce.com/stores/{BC_STORE_HASH}/v2`

Auth headers:
```
X-Auth-Token: {BC_AUTH_TOKEN}
Accept: application/json
Content-Type: application/json
```

| Endpoint | Purpose |
|----------|---------|
| `GET /orders/{id}` | Fetch order total, billing address, currency |

Key fields from `GET /orders/{id}`:
- `id`, `status`, `status_id`
- `total_inc_tax`, `currency_code`
- `billing_address` — `{ first_name, last_name, street_1, street_2, city, state, zip, country }`

### B2B Edition Orders API

Base URL: `https://api-b2b.bigcommerce.com/api/v3/io`

Auth headers:
```
X-Auth-Token: {BC_AUTH_TOKEN}
X-Store-Hash: {BC_STORE_HASH}
```

| Endpoint | Purpose |
|----------|---------|
| `GET /orders/{bcOrderId}` | Fetch companyId, check existing invoice (invoiceId) |

Key fields from `GET /orders/{bcOrderId}` response (in `data`):
- `companyId` — B2B Company ID (used as `customerId` on invoices)
- `invoiceId` — existing invoice ID (nullable; null = no invoice linked)
- `invoiceNumber`, `invoiceStatus`
- `poNumber`, `currencyCode`, `channelId`

### B2B Edition Invoice API

Base URL: `https://api-b2b.bigcommerce.com/api/v3/io/ip`

Auth headers: same as B2B Orders API above.

| Endpoint | Purpose |
|----------|---------|
| `GET /invoices?customerId={companyId}` | List existing invoices for sequence numbering |
| `POST /invoices` | Create invoice with detailed payload (external source) |

#### `POST /invoices` Request Body

Required fields:
- `invoiceNumber` (string) — must be unique
- `originalBalance` — `{ code: string, value: number }`
- `openBalance` — `{ code: string, value: number }`
- `customerId` (string) — B2B Edition Company ID

Optional fields used by this tool:
- `type` (string) — always `"Invoice"`
- `status` (integer) — 0=Open
- `source` (number) — `1` for external
- `orderNumber` (string) — links invoice to order (first invoice only)
- `externalId` (string) — order reference for subsequent invoices
- `purchaseOrderNumber` (string) — PO number from the order
- `details` — line items, addresses, cost lines (see payload structure below)

#### Invoice Payload Structure

Each invoice contains a **single line item** and a **single cost line**:

```ts
{
  invoiceNumber: "INV-101-001",
  type: "Invoice",
  status: 0,
  source: 1,
  orderNumber: "101",           // first invoice only
  // externalId: "ORD-101",     // subsequent invoices only
  customerId: "11702148",
  originalBalance: { code: "USD", value: 283.25 },
  openBalance: { code: "USD", value: 283.25 },
  details: {
    header: {
      costLines: [
        { amount: { code: "USD", value: "283.25" }, description: "Total" }
      ],
      billingAddress: { firstName, lastName, street1, street2, city, state, zipCode, country },
      shippingAddresses: []
    },
    details: {
      lineItems: [
        { sku: "INV", quantity: "1", unitPrice: { code: "USD", value: "283.25" }, description: "50% deposit", type: "physical" }
      ]
    }
  }
}
```

#### `POST /invoices` Response

Success (200):
```json
{ "code": 200, "data": { "id": 12 }, "meta": { "message": "Success" } }
```

Error (400):
```json
{ "code": 400, "data": { "errMsg": "The invoice number already exists." }, "meta": { "message": "Bad Requests Error" } }
```

### One-Invoice-Per-Order Constraint & Workaround

The `POST /invoices` endpoint enforces a uniqueness constraint on `orderNumber`. To create multiple invoices for a single order:

- **First invoice:** `orderNumber: "101"` — linked to the order in B2B Edition
- **Subsequent invoices:** no `orderNumber`, `externalId: "ORD-101"` — references the order without triggering the constraint

### channelId — Intentionally Omitted

Sending `channelId` in the payload returns `404 — "Store channels not exist"`. The field is optional per the API spec and is omitted from all payloads.

## 6. Flow

1. Parse `orderId`, `amount`, optional `--description` from CLI args
2. Validate env vars (`BC_STORE_HASH`, `BC_AUTH_TOKEN`)
3. **Fetch BC order** + **B2B order** in parallel
4. **Validate:** order has a B2B `companyId` (not null/0)
5. **List existing invoices** for the company (`GET /invoices?customerId={companyId}`)
6. **Determine context:**
   - `isFirstInvoice`: B2B order's `invoiceId` is null/0
   - `sequenceNumber`: count of existing `INV-{orderId}-*` invoices + 1
7. **Generate invoice number:** `INV-{orderId}-{seq}` (e.g. `INV-101-001`)
8. **Build payload** with single line item + single cost line
9. **Create invoice** via `POST /invoices` with `source: 1`
10. **Log result** — invoice ID, number, amount, description

## 7. Business Rules

- Order must belong to a B2B company (`companyId` is present and non-zero)
- Invoice amount is user-supplied (not derived from order total)
- Invoice number format: `INV-{bcOrderId}-{seq}` where seq is zero-padded to 3 digits
- Sequence is auto-determined by counting existing invoices for the order
- First invoice uses `orderNumber` to link to the order; subsequent use `externalId`
- `openBalance` and `originalBalance` are both set to the specified amount
- `source` is always `1` (external)
- `type` is always `"Invoice"` (no deposit/balance distinction)
- Description defaults to "Deposit for Order #X" (first) or "Payment for Order #X" (subsequent)

## 8. Project Structure

```
src/
  index.ts        # CLI entry point — arg parsing, orchestration, console output
  api.ts          # Fetch wrappers with auth headers for v2 + B2B APIs
  invoice.ts      # Validation logic + invoice context + payload builder
  types.ts        # TypeScript interfaces for API request/response shapes
  api.test.ts     # Tests for API client (mocked fetch)
  invoice.test.ts # Tests for validation, context detection, payload building
scripts/
  log.ts                     # Shared logging + CLI helpers for scripts
  verify-v2-order.ts         # Test v2 order fetch
  verify-v2-order-products.ts # Test v2 order products fetch
  verify-b2b-order.ts        # Test B2B order fetch
  verify-create-invoice.ts   # End-to-end invoice creation test
  test-two-invoices.ts       # Two-invoice creation + cleanup test
  cleanup-invoice.ts         # Delete a test invoice by ID
```

## 9. Key Types

```ts
interface BCOrder {
  id: number
  status: string
  status_id: number
  total_inc_tax: string
  currency_code: string
  billing_address: {
    first_name: string; last_name: string
    street_1: string; street_2: string
    city: string; state: string; zip: string; country: string
  }
}

interface B2BOrder {
  id: number
  bcOrderId: number
  companyId: number
  invoiceId: number | null
  invoiceNumber: number | null
  invoiceStatus: number | null
  isInvoiceOrder: number
  poNumber: string
  currencyCode: string
  channelId: number | null
  totalIncTax: number
}

interface InvoiceListItem {
  id: number
  invoiceNumber: string
  orderNumber?: string
  externalId?: string
}

interface CreateInvoicePayload {
  invoiceNumber: string
  type: string
  status: number
  source: number
  orderNumber?: string
  externalId?: string
  purchaseOrderNumber?: string
  customerId: string
  originalBalance: { code: string; value: number }
  openBalance: { code: string; value: number }
  details: {
    header: {
      costLines: Array<{ amount: { code: string; value: string }; description: string }>
      billingAddress: { firstName, lastName, street1, street2, city, state, zipCode, country }
      shippingAddresses: Array<{ ... }>
    }
    details: {
      lineItems: Array<{
        sku: string; quantity: string
        unitPrice: { code: string; value: string }
        description: string; type: string
      }>
    }
  }
}

interface InvoiceResponse {
  code: number
  data: { id: number }
  meta: { message: string }
}
```

## 10. Error Handling

- Check `response.ok` on every fetch call; parse B2B error format `{ code, data: { errMsg }, meta: { message } }`
- Descriptive error messages referencing the order, e.g. `"Order 123 is not a B2B order (no companyId)"`
- Top-level `try/catch` in `index.ts` — log errors to stderr, exit with code 1 on failure
- Exit code 0 on success

## 11. Testing Strategy

- **Unit tests** using `bun test` with mocked `fetch` (via `spyOn(globalThis, "fetch")`)
- **Validation tests:** reject orders missing companyId
- **Context detection tests:** first vs subsequent invoice, sequence numbering
- **Payload builder tests:** correct amount, single line item, billing address mapping, orderNumber vs externalId
- **API client tests:** URL construction, auth headers, error parsing, invoice list
- **Manual integration test:** `bun src/index.ts <orderId> <amount>` against a sandbox store

## 12. Out of Scope

- No web server, webhooks, database, or UI
- No automatic amount calculation (user supplies exact amount)
- No batch processing (multiple orders)
- No retry logic or rate limiting
- No validation of amount against order total
