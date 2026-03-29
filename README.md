# Pay by Invoice

A CLI tool for BigCommerce B2B Edition that creates invoices for arbitrary amounts against B2B orders.

## Setup

1. Copy `.env.example` to `.env` and fill in your credentials:
   - `BC_STORE_HASH` — your BigCommerce store hash
   - `BC_AUTH_TOKEN` — API token with read access to Orders
2. Install dependencies: `bun install`

## Usage

```bash
bun src/index.ts <orderId> <amount> [--description "..."]
```

- `orderId` — the BigCommerce order to invoice against
- `amount` — invoice amount (any positive number; not validated against order total)
- `--description` — optional; defaults to "Deposit for Order #X" (first invoice) or "Payment for Order #X" (subsequent)

### Examples

```bash
# First invoice with auto-generated description
bun src/index.ts 101 283.25

# First invoice with custom description
bun src/index.ts 101 283.25 --description "50% deposit"

# Subsequent invoice for the same order
bun src/index.ts 101 200.00 --description "Progress payment"
```

## How it works

The tool fetches order context from the BigCommerce v2 API and B2B API in parallel, then creates an invoice via the B2B Invoice API with `source: 1` (external). Each invoice contains a single line item at the specified amount.

The B2B Invoice API enforces a one-invoice-per-order constraint on the `orderNumber` field. To create multiple invoices against the same order, the first invoice uses `orderNumber` to link it in the B2B Edition UI, while subsequent invoices omit `orderNumber` and use `externalId` instead — maintaining traceability without triggering the constraint.

Invoice numbers are auto-sequenced as `INV-{orderId}-001`, `INV-{orderId}-002`, etc.

## Project structure

```
src/
  index.ts          CLI entry point — arg parsing, orchestration, console output
  api.ts            Fetch wrappers with auth headers for v2 + B2B APIs
  invoice.ts        Validation, invoice context detection, payload builder
  types.ts          TypeScript interfaces for API request/response shapes
  api.test.ts       Tests for API client (mocked fetch)
  invoice.test.ts   Tests for validation, context detection, payload building
scripts/
  log.ts                      Shared logging + CLI helpers for scripts
  verify-v2-order.ts          Test v2 order fetch
  verify-v2-order-products.ts Test v2 order products fetch
  verify-b2b-order.ts         Test B2B order fetch
  verify-create-invoice.ts    End-to-end invoice creation test
  test-two-invoices.ts        Two-invoice creation + cleanup test
  cleanup-invoice.ts          Delete a test invoice by ID
```

## Tests

```bash
bun test
```

## Verification scripts

Scripts in `scripts/` verify API connectivity and response shapes. All default to order ID `101`.

```bash
# 1. Fetch order totals, billing address, currency (v2 API)
bun scripts/verify-v2-order.ts [orderId]

# 2. Fetch order line items (v2 API)
bun scripts/verify-v2-order-products.ts [orderId]

# 3. Fetch B2B order — companyId, invoice status (B2B API)
bun scripts/verify-b2b-order.ts [orderId]

# 4. Full workflow — reads APIs then creates a real test invoice
bun scripts/verify-create-invoice.ts [orderId]

# 5. Delete a test invoice created by step 4
bun scripts/cleanup-invoice.ts <invoiceId>

# 6. Two-invoice test — creates two invoices for one order then cleans up
bun scripts/test-two-invoices.ts [orderId]
```

## Reference

See [SOLUTION_GUIDE.md](SOLUTION_GUIDE.md) for the full approach, API details, payload design, and known API quirks.
