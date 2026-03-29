# Pay by Invoice

A CLI tool for BigCommerce B2B Edition that creates invoices for arbitrary amounts against B2B orders.

## Setup

1. Copy `.env.example` to `.env` and fill in your credentials
2. Install dependencies: `bun install`

## Usage

```bash
bun src/index.ts <orderId> <amount> [--description "..."]
```

- `bun src/index.ts 101 283.25` — creates an invoice for $283.25 with auto-generated description
- `bun src/index.ts 101 283.25 --description "50% deposit"` — custom description
- `bun src/index.ts 101 200.00 --description "Progress payment"` — subsequent invoice (auto-detected)

The tool auto-detects whether this is the first or a subsequent invoice for the order. The first invoice links to the order via `orderNumber`; subsequent invoices use `externalId` to avoid the B2B API's one-invoice-per-order constraint.

Invoice numbers are auto-sequenced as `INV-{orderId}-001`, `INV-{orderId}-002`, etc.

## Tests

```bash
bun test
```

## API Verification Scripts

Scripts in `scripts/` verify API connectivity and response shapes. Run them in order — each tests progressively more complex interactions. All default to order ID `101`.

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
