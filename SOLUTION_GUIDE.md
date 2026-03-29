# Solution Guide: Multiple Invoices per B2B Order

## Problem Statement

BigCommerce B2B Edition provides an Invoice API that allows stores to create invoices against orders. However, the API enforces a **one-invoice-per-order constraint** through a uniqueness check on the `orderNumber` field. Any attempt to create a second invoice with the same `orderNumber` is rejected.

This constraint prevents common B2B billing patterns where multiple invoices need to be issued against a single order:

- **Deposit and balance** — collect a percentage up front, invoice the remainder on fulfilment.
- **Progress payments** — bill at milestones throughout a long-running order.
- **Partial deliveries** — invoice each shipment separately as goods are dispatched.
- **Custom billing schedules** — negotiate payment terms that split the total across multiple due dates.

Without a way to create multiple invoices per order, stores must resort to manual workarounds outside the platform, losing visibility and reconciliation benefits that the B2B Invoice system provides.

---

## Solution Overview

The B2B Invoice API accepts invoices from two sources: those generated internally by B2B Edition (`source: 0`) and those created externally (`source: 1`). External invoices are not subject to the same lifecycle constraints as internal ones.

By creating invoices with `source: 1`, each containing a single descriptive line item at an arbitrary amount, we can issue multiple invoices against a single order. The one-invoice-per-order constraint is bypassed by using the `orderNumber` field for the first invoice (which links it to the order in the B2B Edition UI) and the `externalId` field for all subsequent invoices (which maintains a reference to the order without triggering the uniqueness check).

Each invoice is independent — it carries its own amount, description, and invoice number. The amounts are not validated against the order total, giving full flexibility over how the order value is divided.

---

## Use Cases

**Deposit + Balance**
Issue a 50% deposit invoice when the order is placed, then a balance invoice when the goods ship. Both invoices reference the same order and appear against the same company.

**Progress Payments**
For a large order fulfilled over weeks or months, issue invoices at each milestone — 30% on order, 30% on production complete, 40% on delivery.

**Partial Deliveries**
When an order ships in multiple consignments, issue a separate invoice for each shipment reflecting only the items included.

**Custom Billing Schedules**
Split an order total across agreed payment dates — monthly instalments, quarterly billing, or any other negotiated schedule.

---

## APIs Involved

Three APIs are used in the workflow. Each serves a distinct purpose and has its own authentication and base URL.

### BigCommerce v2 Orders API

- **Purpose:** Retrieve order details including the total, currency, and billing address.
- **Base URL:** `https://api.bigcommerce.com/stores/{storeHash}/v2`
- **Authentication:** `X-Auth-Token` header with a BigCommerce API token that has read access to Orders.
- **Key endpoint:** `GET /orders/{orderId}`

This API provides the billing address (used to populate the invoice) and the order total and currency (used as reference context, though the invoice amount is independently specified).

### B2B Edition Orders API

- **Purpose:** Retrieve B2B-specific order metadata, most importantly the `companyId` that identifies the B2B buyer.
- **Base URL:** `https://api-b2b.bigcommerce.com/api/v3/io`
- **Authentication:** `X-Auth-Token` header with the same API token, plus an `X-Store-Hash` header identifying the store.
- **Key endpoint:** `GET /orders/{bcOrderId}`

This API confirms the order belongs to a B2B company (required for invoicing) and provides the company ID that the invoice must be associated with.

### B2B Edition Invoice API

- **Purpose:** List existing invoices and create new ones.
- **Base URL:** `https://api-b2b.bigcommerce.com/api/v3/io/ip`
- **Authentication:** Same as the B2B Orders API — `X-Auth-Token` and `X-Store-Hash` headers.
- **Key endpoints:** `GET /invoices?customerId={companyId}` and `POST /invoices`

This is the primary API for the solution. Existing invoices are listed to determine sequencing, and new invoices are created with the appropriate payload.

---

## API Flow

The workflow for creating an invoice follows these steps:

### 1. Fetch order context

Call the v2 Orders API and the B2B Orders API to retrieve the order details. The v2 response provides the billing address and currency. The B2B response provides the `companyId` and reveals whether an invoice has already been linked to this order.

### 2. Validate B2B eligibility

Confirm the order belongs to a B2B company by checking that `companyId` is present and non-zero. Orders placed by guest or non-B2B customers cannot have invoices created against them.

### 3. Determine invoice sequence

Call the Invoice API to list all invoices for the company. Filter for invoices whose invoice number matches the pattern `INV-{orderId}-*`. The count of matching invoices determines:

- Whether this is the **first** invoice for this order (count is zero).
- What **sequence number** to assign (count + 1).

### 4. Build the invoice payload

Construct the invoice payload using data from both API responses. The payload includes a single line item at the specified amount, billing address mapped from the v2 order, and either `orderNumber` (first invoice) or `externalId` (subsequent invoices) to reference the order.

### 5. Create the invoice

POST the payload to the Invoice API. On success, the API returns the new invoice's ID. The invoice is immediately visible in the B2B Edition buyer portal under the company's invoice list.

---

## The One-Invoice-Per-Order Constraint

The B2B Invoice API uses the `orderNumber` field to link an invoice to an order in the B2B Edition UI. When an invoice is created with `orderNumber: "101"`, it appears linked to order 101 in both the admin and buyer portal.

However, the API enforces uniqueness on this field. Attempting to create a second invoice with `orderNumber: "101"` returns a `400` error indicating the order number is already associated with an invoice.

### The Workaround

The API also accepts an `externalId` field, which serves as a general-purpose external reference. This field does **not** have the same uniqueness constraint and does not trigger the one-per-order check.

The approach is:

- **First invoice** for an order: include `orderNumber` set to the order ID. This creates the visual link in the B2B Edition UI.
- **Subsequent invoices** for the same order: omit `orderNumber` entirely and instead include `externalId` set to a reference like `ORD-{orderId}`. This maintains traceability to the order without triggering the constraint.

Both fields are optional in the API spec, so either can be included or omitted independently. The first invoice gets the UI link; subsequent invoices are associated by convention through their invoice number prefix and `externalId`.

---

## Invoice Payload Design

### Single line item approach

Rather than mirroring the order's individual product line items, each invoice contains a **single line item** with a descriptive label (e.g., "50% deposit", "Progress payment 2 of 3") and the invoice amount as the unit price. This is simpler, avoids complex item-level splitting, and provides clear human-readable context for what each invoice represents.

The line item uses a fixed SKU of `"INV"`, a quantity of `1`, and a type of `"physical"`.

### Cost lines

The payload includes a single cost line with the description `"Total"` and the invoice amount. This populates the invoice summary in the B2B Edition UI.

### Billing address

The billing address is mapped from the v2 order's `billing_address` object. Field names are transformed from the v2 snake_case format (`first_name`, `street_1`, `zip`) to the Invoice API's camelCase format (`firstName`, `street1`, `zipCode`).

Shipping addresses are included as an empty array, as these invoices represent billing documents rather than shipping instructions.

### Omission of channelId

The `channelId` field is intentionally omitted from the invoice payload. Although it appears in the API spec as an optional field, including it — even with valid values — causes the API to return a `404` error with the message "Store channels not exist". The B2B Orders API also returns `channelId: null` for orders on this store. Omitting the field entirely avoids this issue with no loss of functionality.

### Field type inconsistencies

The Invoice API has inconsistent type expectations across similar fields:

- `originalBalance.value` and `openBalance.value` expect a **number** (e.g., `283.25`).
- `costLines[].amount.value` and `lineItems[].unitPrice.value` expect a **string** (e.g., `"283.25"`).
- `lineItems[].quantity` also expects a **string** (e.g., `"1"`).

These inconsistencies must be respected in the payload or the API will reject the request.

---

## Invoice Numbering

Invoices follow the convention:

```
INV-{orderId}-{sequence}
```

Where `{sequence}` is a zero-padded three-digit number starting at `001`. For example:

- `INV-101-001` — first invoice for order 101
- `INV-101-002` — second invoice for order 101
- `INV-101-003` — third invoice for order 101

The sequence number is determined dynamically by counting existing invoices that match the `INV-{orderId}-` prefix for the given company. This ensures numbering is always correct even if invoices are deleted and re-created.

The invoice number must be unique across all invoices in the store. The order-prefixed format ensures uniqueness while keeping the association to the source order immediately visible.

---

## Known API Behaviours

### channelId causes 404 errors

Including `channelId` in the `POST /invoices` payload — whether set to `1`, `null`, or any other value — causes the API to return `404` with the message "Store channels not exist". The field should always be omitted.

### B2B Order data field is inconsistently typed

The `GET /orders/{bcOrderId}` endpoint on the B2B Orders API returns a response where the `data` field is sometimes a single object and sometimes an array containing a single object. Consumers should normalise this by checking `Array.isArray(data)` before accessing the order.

### B2B error response format

Error responses from the B2B APIs follow a consistent structure:

```
{
  "code": <http_status>,
  "data": { "errMsg": "<human-readable message>" },
  "meta": { "message": "<error category>" }
}
```

The `data.errMsg` field contains the most useful diagnostic information. The `meta.message` field is a general category (e.g., "Bad Requests Error") and is less specific.

### v2 Order total is a string

The v2 Orders API returns `total_inc_tax` as a string (e.g., `"566.50"`) rather than a number. This requires explicit parsing when used in calculations or comparisons.

---

## Considerations

### What this approach covers

- Creating multiple invoices of arbitrary amounts against a single B2B order.
- Maintaining traceability between invoices and their source order through naming conventions and external IDs.
- Populating invoices with billing address and currency data from the source order.
- Sequential invoice numbering that survives deletions and re-creation.
- Invoices appearing in the B2B Edition buyer portal for the associated company.

### What this approach does not cover

- **Amount validation** — there is no check that invoice amounts sum to the order total. Invoices can be created for any amount, including amounts that exceed or fall short of the order value.
- **Automatic splitting** — the order total is not automatically divided. Each invoice amount must be explicitly specified.
- **Payment collection** — invoices created with `source: 1` (external) are not connected to BigCommerce's built-in payment processing. Payment collection and reconciliation must be handled outside the platform.
- **Invoice status management** — invoices are created with status `0` (Open). Updating invoice status as payments are received is a separate concern.
- **Multi-currency** — the invoice currency is always copied from the source order. Cross-currency invoicing is not addressed.
- **Concurrency** — if multiple invoices are created simultaneously for the same order, the sequence numbering could conflict. The listing-then-creating flow assumes sequential operation.
