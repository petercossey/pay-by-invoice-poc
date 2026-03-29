import { describe, it, expect } from "bun:test";
import {
  validateOrder,
  determineInvoiceContext,
  buildInvoicePayload,
} from "./invoice.ts";
import type { BCOrder, B2BOrder, InvoiceListItem } from "./types.ts";

// --- Test fixtures ---

function makeBCOrder(overrides: Partial<BCOrder> = {}): BCOrder {
  return {
    id: 101,
    status: "Completed",
    status_id: 10,
    total_inc_tax: "566.50",
    currency_code: "USD",
    billing_address: {
      first_name: "Jane",
      last_name: "Doe",
      street_1: "123 Main St",
      street_2: "Suite 4",
      city: "Austin",
      state: "TX",
      zip: "78701",
      country: "United States",
    },
    ...overrides,
  };
}

function makeB2BOrder(overrides: Partial<B2BOrder> = {}): B2BOrder {
  return {
    id: 50,
    bcOrderId: 101,
    companyId: 11702148,
    invoiceId: null,
    invoiceNumber: null,
    invoiceStatus: null,
    isInvoiceOrder: 0,
    poNumber: "PO-2024-001",
    currencyCode: "USD",
    channelId: null,
    totalIncTax: 566.5,
    ...overrides,
  };
}

function makeInvoiceListItem(
  overrides: Partial<InvoiceListItem> = {},
): InvoiceListItem {
  return {
    id: 1,
    invoiceNumber: "INV-101-001",
    ...overrides,
  };
}

// --- validateOrder ---

describe("validateOrder", () => {
  it("throws when companyId is 0", () => {
    const order = makeB2BOrder({ companyId: 0 });
    expect(() => validateOrder(order, 101)).toThrow("not a B2B order");
  });

  it("throws when companyId is null-ish", () => {
    const order = makeB2BOrder({ companyId: null as unknown as number });
    expect(() => validateOrder(order, 101)).toThrow("not a B2B order");
  });

  it("passes for a valid order with no invoice", () => {
    const order = makeB2BOrder();
    expect(() => validateOrder(order, 101)).not.toThrow();
  });

  it("passes when order already has an invoice (no longer blocked)", () => {
    const order = makeB2BOrder({ invoiceId: 999, invoiceNumber: 12345 });
    expect(() => validateOrder(order, 101)).not.toThrow();
  });
});

// --- determineInvoiceContext ---

describe("determineInvoiceContext", () => {
  it("detects first invoice when no existing invoices", () => {
    const result = determineInvoiceContext([], 101);
    expect(result.isFirstInvoice).toBe(true);
    expect(result.sequenceNumber).toBe(1);
  });

  it("detects subsequent invoice when existing invoices match the order", () => {
    const existing = [makeInvoiceListItem({ invoiceNumber: "INV-101-001" })];
    const result = determineInvoiceContext(existing, 101);
    expect(result.isFirstInvoice).toBe(false);
    expect(result.sequenceNumber).toBe(2);
  });

  it("returns sequenceNumber 1 when no existing invoices match", () => {
    const result = determineInvoiceContext([], 101);
    expect(result.sequenceNumber).toBe(1);
  });

  it("returns sequenceNumber 2 when one existing invoice matches", () => {
    const existing = [makeInvoiceListItem({ invoiceNumber: "INV-101-001" })];
    const result = determineInvoiceContext(existing, 101);
    expect(result.sequenceNumber).toBe(2);
  });

  it("returns sequenceNumber 3 when two existing invoices match", () => {
    const existing = [
      makeInvoiceListItem({ invoiceNumber: "INV-101-001" }),
      makeInvoiceListItem({ invoiceNumber: "INV-101-002" }),
    ];
    const result = determineInvoiceContext(existing, 101);
    expect(result.sequenceNumber).toBe(3);
  });

  it("ignores invoices for other orders", () => {
    const existing = [
      makeInvoiceListItem({ invoiceNumber: "INV-101-001" }),
      makeInvoiceListItem({ invoiceNumber: "INV-200-001" }),
      makeInvoiceListItem({ invoiceNumber: "INV-300-001" }),
    ];
    const result = determineInvoiceContext(existing, 101);
    expect(result.sequenceNumber).toBe(2);
    expect(result.isFirstInvoice).toBe(false);
  });
});

// --- buildInvoicePayload ---

describe("buildInvoicePayload", () => {
  const bcOrder = makeBCOrder();
  const b2bOrder = makeB2BOrder();
  const defaultOptions = {
    amount: 283.25,
    description: "50% deposit",
    sequenceNumber: 1,
    isFirstInvoice: true,
  };

  it("sets originalBalance and openBalance to the given amount", () => {
    const payload = buildInvoicePayload(bcOrder, b2bOrder, defaultOptions);
    expect(payload.originalBalance.value).toBe(283.25);
    expect(payload.openBalance.value).toBe(283.25);
    expect(payload.originalBalance.code).toBe("USD");
  });

  it("formats invoice number as INV-{orderId}-001", () => {
    const payload = buildInvoicePayload(bcOrder, b2bOrder, defaultOptions);
    expect(payload.invoiceNumber).toBe("INV-101-001");
  });

  it("formats invoice number with correct sequence", () => {
    const payload = buildInvoicePayload(bcOrder, b2bOrder, {
      ...defaultOptions,
      sequenceNumber: 3,
    });
    expect(payload.invoiceNumber).toBe("INV-101-003");
  });

  it("creates a single line item with sku INV", () => {
    const payload = buildInvoicePayload(bcOrder, b2bOrder, defaultOptions);
    const items = payload.details.details.lineItems;
    expect(items).toHaveLength(1);
    expect(items[0].sku).toBe("INV");
    expect(items[0].quantity).toBe("1");
    expect(items[0].unitPrice.value).toBe("283.25");
    expect(items[0].description).toBe("50% deposit");
  });

  it("creates a single Total cost line", () => {
    const payload = buildInvoicePayload(bcOrder, b2bOrder, defaultOptions);
    const costLines = payload.details.header.costLines;
    expect(costLines).toHaveLength(1);
    expect(costLines[0].description).toBe("Total");
    expect(costLines[0].amount.value).toBe("283.25");
  });

  it("uses orderNumber for first invoice", () => {
    const payload = buildInvoicePayload(bcOrder, b2bOrder, defaultOptions);
    expect(payload.orderNumber).toBe("101");
    expect(payload.externalId).toBeUndefined();
  });

  it("uses externalId for subsequent invoices", () => {
    const payload = buildInvoicePayload(bcOrder, b2bOrder, {
      ...defaultOptions,
      isFirstInvoice: false,
      sequenceNumber: 2,
    });
    expect(payload.externalId).toBe("ORD-101");
    expect(payload.orderNumber).toBeUndefined();
  });

  it("maps billing address fields correctly", () => {
    const payload = buildInvoicePayload(bcOrder, b2bOrder, defaultOptions);
    const addr = payload.details.header.billingAddress;
    expect(addr.firstName).toBe("Jane");
    expect(addr.lastName).toBe("Doe");
    expect(addr.street1).toBe("123 Main St");
    expect(addr.street2).toBe("Suite 4");
    expect(addr.city).toBe("Austin");
    expect(addr.state).toBe("TX");
    expect(addr.zipCode).toBe("78701");
    expect(addr.country).toBe("United States");
  });

  it("does not include channelId in the payload", () => {
    const payload = buildInvoicePayload(bcOrder, b2bOrder, defaultOptions);
    expect("channelId" in payload).toBe(false);
  });

  it("sets type to Invoice", () => {
    const payload = buildInvoicePayload(bcOrder, b2bOrder, defaultOptions);
    expect(payload.type).toBe("Invoice");
  });

  it("sets source to 1 (external)", () => {
    const payload = buildInvoicePayload(bcOrder, b2bOrder, defaultOptions);
    expect(payload.source).toBe(1);
  });

  it("sets status to 0 (Open)", () => {
    const payload = buildInvoicePayload(bcOrder, b2bOrder, defaultOptions);
    expect(payload.status).toBe(0);
  });

  it("includes purchaseOrderNumber when present", () => {
    const payload = buildInvoicePayload(bcOrder, b2bOrder, defaultOptions);
    expect(payload.purchaseOrderNumber).toBe("PO-2024-001");
  });

  it("omits purchaseOrderNumber when empty", () => {
    const order = makeB2BOrder({ poNumber: "" });
    const payload = buildInvoicePayload(bcOrder, order, defaultOptions);
    expect(payload.purchaseOrderNumber).toBeUndefined();
  });

  it("uses currency_code from the BC order", () => {
    const order = makeBCOrder({ currency_code: "CAD" });
    const payload = buildInvoicePayload(order, b2bOrder, defaultOptions);
    expect(payload.originalBalance.code).toBe("CAD");
    expect(payload.details.details.lineItems[0].unitPrice.code).toBe("CAD");
    expect(payload.details.header.costLines[0].amount.code).toBe("CAD");
  });
});
