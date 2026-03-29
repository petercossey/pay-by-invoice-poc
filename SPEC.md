# Pay-by-Invoice POC — Specification

## 1. Overview

A CLI proof-of-concept for BigCommerce B2B Edition that creates **deposit invoices** for a percentage of an order's total. It uses the detailed `POST /invoices` endpoint (acting as an external invoicing source with `source: 1`) to build invoices with controlled amounts, line items, and addresses — rather than the simple auto-create endpoint which mirrors the full order total.

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

## 4. APIs

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
| `GET /orders/{id}` | Fetch order totals, billing address, currency, status |
| `GET /orders/{id}/products` | Fetch line items (sku, name, quantity, price) |

Key fields from `GET /orders/{id}`:
- `id`, `status`, `status_id`
- `total_inc_tax`, `total_ex_tax`, `total_tax`, `subtotal_inc_tax`
- `shipping_cost_inc_tax`, `handling_cost_inc_tax`, `wrapping_cost_inc_tax`
- `discount_amount`, `coupon_discount`
- `currency_code`
- `billing_address` — `{ first_name, last_name, street_1, street_2, city, state, zip, country }`
- `channel_id`

Key fields from `GET /orders/{id}/products`:
- `sku`, `name`, `quantity`
- `price_inc_tax`, `price_ex_tax`
- `total_inc_tax`, `total_ex_tax`
- `type` (physical, digital)

### B2B Edition Orders API

Base URL: `https://api-b2b.bigcommerce.com/api/v3/io`

Auth headers:
```
X-Auth-Token: {BC_AUTH_TOKEN}
X-Store-Hash: {BC_STORE_HASH}
```

| Endpoint | Purpose |
|----------|---------|
| `GET /orders/{bcOrderId}` | Fetch companyId, check existing invoice (invoiceId/invoiceNumber) |

Key fields from `GET /orders/{bcOrderId}` response (in `data[]`):
- `companyId` — B2B Company ID (used as `customerId` on invoices)
- `invoiceId` — existing invoice ID (nullable; null = no invoice)
- `invoiceNumber` — existing invoice number (nullable)
- `invoiceStatus` — 0=Open, 1=Partial, 2=Paid (nullable)
- `isInvoiceOrder` — 0=standard order, 1=invoice payment order
- `channelId`, `poNumber`, `currencyCode`

### B2B Edition Invoice API

Base URL: `https://api-b2b.bigcommerce.com/api/v3/io/ip`

Auth headers: same as B2B Orders API above.

| Endpoint | Purpose |
|----------|---------|
| `POST /invoices` | Create invoice with detailed payload (external source) |

#### `POST /invoices` Request Body

Required fields:
- `invoiceNumber` (string) — must be unique
- `originalBalance` — `{ code: string, value: number }` e.g. `{ code: "USD", value: 100 }`
- `openBalance` — `{ code: string, value: number }` — same as originalBalance for a new invoice
- `customerId` (string) — B2B Edition Company ID

Optional fields used by this POC:
- `type` (string) — default `"Invoice"`
- `dueDate` (integer) — Unix timestamp
- `status` (integer) — 0=Open, 1=Partial paid, 2=Completed (default: 0)
- `orderNumber` (string) — BC order ID to link the invoice to the order
- `purchaseOrderNumber` (string) — PO number from the order
- `source` (number) — `1` for external (this POC always uses `1`)
- `channelId` (integer) — BC channel ID
- `details` — nested object with line items, addresses, and cost breakdown:

```ts
details: {
  header: {
    costLines: Array<{
      amount: { code: string, value: string }  // e.g. { code: "USD", value: "45.00" }
      description: string                       // e.g. "Subtotal", "Freight", "Sales Tax"
    }>
    billingAddress: {
      firstName: string, lastName: string,
      street1: string, street2: string,
      city: string, state: string, zipCode: string, country: string
    }
    shippingAddresses: Array<{
      firstName: string, lastName: string,
      street1: string, street2: string,
      city: string, state: string, zipCode: string, country: string
    }>
  }
  details: {
    lineItems: Array<{
      sku: string           // required
      quantity: string       // required (string, not number)
      unitPrice: { code: string, value: string }  // required
      description: string   // product name
      type: string          // "physical" | "digital"
    }>
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

### Invoice API — One-Invoice-Per-Order Constraint & Workaround

The `POST /invoices` endpoint enforces a uniqueness constraint on `orderNumber` — creating a second invoice with the same `orderNumber` returns `400 — "The invoice exists for this order"`.

**Workaround:** To create multiple invoices for a single order (e.g. deposit + balance), only the first invoice should set `orderNumber`. Additional invoices should omit `orderNumber` and instead set `externalId` to the order ID for the buyer's reference. This is the officially documented approach:

- **Invoice 1 (deposit):** `orderNumber: "101"` — linked to the order in B2B Edition
- **Invoice 2 (balance):** no `orderNumber`, `externalId: "101"` — references the order without triggering the uniqueness constraint

Both invoices appear under the company when queried via `GET /invoices?customerId={companyId}`.

## 5. POC Flow

```
bun src/index.ts <orderId>
```

1. Parse `orderId` from `process.argv[2]`
2. Validate env vars (`BC_STORE_HASH`, `BC_AUTH_TOKEN`) are set
3. **Fetch BC order** via `GET /v2/orders/{orderId}` — extract totals, billing address, currency, status, channel ID
4. **Fetch BC order products** via `GET /v2/orders/{orderId}/products` — extract line items
5. **Fetch B2B order** via `GET /orders/{orderId}` — extract `companyId`, check `invoiceId`
6. **Validate:**
   - Order has a B2B `companyId` (not null/0)
   - Order does not already have an invoice (`invoiceId` is null)
7. **Calculate deposit amount** — 50% of `total_inc_tax` (hardcoded constant)
8. **Generate invoice number** — format: `INV-{orderId}-001`
9. **Build invoice payload** with deposit-adjusted amounts, line items, billing address, cost lines
10. **Create invoice** via `POST /invoices` with `source: 1`
11. **Log result** — invoice ID, invoice number, deposit amount

## 6. Business Rules (v1)

- Order must belong to a B2B company (`companyId` is present and non-zero)
- Order must not already have an invoice (`invoiceId` is null)
- Deposit percentage is hardcoded at **50%** as a named constant — easy to change later
- Invoice number format: `INV-{bcOrderId}-{seq}` where seq is zero-padded to 3 digits, starting at `001`
- Line item quantities and prices on the invoice are scaled to reflect the deposit percentage
- `openBalance` and `originalBalance` are both set to the calculated deposit amount (new invoice, nothing paid yet)
- `source` is always `1` (external)

## 7. Project Structure

```
src/
  index.ts        # CLI entry point — arg parsing, orchestration, console output
  api.ts          # Fetch wrappers with auth headers for v2 + B2B APIs
  invoice.ts      # Validation logic + invoice payload builder + creation
  types.ts        # TypeScript interfaces for API request/response shapes
  api.test.ts     # Tests for API client (mocked fetch)
  invoice.test.ts # Tests for validation rules and payload building
```

## 8. Key Types

```ts
// From v2 GET /orders/{id}
interface BCOrder {
  id: number
  status: string
  status_id: number
  total_inc_tax: string
  total_ex_tax: string
  total_tax: string
  subtotal_inc_tax: string
  shipping_cost_inc_tax: string
  handling_cost_inc_tax: string
  discount_amount: string
  currency_code: string
  channel_id: number
  billing_address: {
    first_name: string
    last_name: string
    street_1: string
    street_2: string
    city: string
    state: string
    zip: string
    country: string
  }
}

// From v2 GET /orders/{id}/products
interface BCOrderProduct {
  id: number
  sku: string
  name: string
  quantity: number
  price_inc_tax: string
  price_ex_tax: string
  total_inc_tax: string
  type: string  // "physical" | "digital"
}

// From B2B GET /orders/{bcOrderId} — items in data[]
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
  channelId: number
  totalIncTax: number
}

// POST /invoices request body
interface CreateInvoicePayload {
  invoiceNumber: string
  type: string
  status: number
  source: number
  orderNumber: string
  purchaseOrderNumber?: string
  customerId: string
  channelId: number
  originalBalance: { code: string; value: number }
  openBalance: { code: string; value: number }
  details: {
    header: {
      costLines: Array<{ amount: { code: string; value: string }; description: string }>
      billingAddress: {
        firstName: string; lastName: string
        street1: string; street2: string
        city: string; state: string; zipCode: string; country: string
      }
      shippingAddresses: Array<{
        firstName: string; lastName: string
        street1: string; street2: string
        city: string; state: string; zipCode: string; country: string
      }>
    }
    details: {
      lineItems: Array<{
        sku: string
        quantity: string
        unitPrice: { code: string; value: string }
        description: string
        type: string
      }>
    }
  }
}

// POST /invoices response
interface InvoiceResponse {
  code: number
  data: { id: number }
  meta: { message: string }
}
```

## 9. Error Handling

- Check `response.ok` on every fetch call; if not OK, parse the response body for the B2B error format `{ code, data: { errMsg }, meta: { message } }`
- Descriptive error messages referencing the order, e.g. `"Order 123 already has invoice #456"`, `"Order 123 is not a B2B order (no companyId)"`
- Top-level `try/catch` in `index.ts` — log errors to stderr, exit with code 1 on failure
- Exit code 0 on success

## 10. Testing Strategy

- **Unit tests** using `bun test` with mocked `fetch` (via `mock.module` or `spyOn(globalThis, "fetch")`)
- **Validation tests:** reject orders that already have an invoice, missing companyId, etc.
- **Payload builder tests:** verify correct deposit calculation, line item scaling, address mapping, cost line generation
- **API client tests:** verify correct URL construction, auth headers, error parsing
- **Manual integration test:** `bun src/index.ts <orderId>` against a sandbox store

## 11. Out of Scope

- No web server, webhooks, database, or UI
- No shipment-based invoicing (future)
- No batch processing (multiple orders)
- No retry logic or rate limiting
- No configurable deposit percentage (hardcoded constant for now)

## 12. Future Evolution

- Shipment/fulfillment-based invoicing (invoice on ship)
- Configurable deposit percentage via CLI flag or env var
- Batch mode — accept multiple order IDs
- HTTP layer (`Bun.serve()`) for webhook-triggered invoicing
- Support for multiple invoices per order (deposit + balance)
