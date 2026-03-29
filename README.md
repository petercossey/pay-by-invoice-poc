# Pay by Invoice

A CLI proof-of-concept for BigCommerce B2B Edition that creates deposit invoices for a percentage of an order's total.

## Setup

1. Copy `.env.example` to `.env` and fill in your credentials
2. Install dependencies: `bun install`

## Usage

```bash
bun src/index.ts <orderId>
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

# 4. Full workflow — reads all 3 APIs then creates a real test invoice
bun scripts/verify-create-invoice.ts [orderId]

# 5. Delete a test invoice created by step 4
bun scripts/cleanup-invoice.ts <invoiceId>

# 6. Two-invoice workaround — creates deposit + balance invoices for one order
bun scripts/test-two-invoices.ts [orderId]
```
