import { describe, it, expect } from "bun:test";
import {
  validateOrder,
  buildInvoicePayload,
  getPercentageForType,
  getSequenceForType,
  DEPOSIT_PERCENTAGE,
  INVOICE_TYPE_CONFIG,
} from "./invoice.ts";
import type { BCOrder, BCOrderProduct, B2BOrder } from "./types.ts";

// --- Test fixtures ---

function makeBCOrder(overrides: Partial<BCOrder> = {}): BCOrder {
  return {
    id: 101,
    status: "Completed",
    status_id: 10,
    total_inc_tax: "566.50",
    total_ex_tax: "500.00",
    total_tax: "66.50",
    subtotal_inc_tax: "556.50",
    shipping_cost_inc_tax: "10.00",
    handling_cost_inc_tax: "0.00",
    discount_amount: "0.00",
    currency_code: "USD",
    channel_id: 1,
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

function makeBCOrderProduct(
  overrides: Partial<BCOrderProduct> = {},
): BCOrderProduct {
  return {
    id: 1,
    sku: "TOY-001",
    name: "Toy Figure",
    quantity: 5,
    price_inc_tax: "113.30",
    price_ex_tax: "100.00",
    total_inc_tax: "566.50",
    type: "physical",
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

// --- getPercentageForType ---

describe("getPercentageForType", () => {
  it("returns DEPOSIT_PERCENTAGE for deposit", () => {
    expect(getPercentageForType("deposit")).toBe(DEPOSIT_PERCENTAGE);
  });

  it("returns 1 - DEPOSIT_PERCENTAGE for balance", () => {
    expect(getPercentageForType("balance")).toBe(1 - DEPOSIT_PERCENTAGE);
  });
});

// --- getSequenceForType ---

describe("getSequenceForType", () => {
  it("returns 1 for deposit", () => {
    expect(getSequenceForType("deposit")).toBe(1);
  });

  it("returns 2 for balance", () => {
    expect(getSequenceForType("balance")).toBe(2);
  });
});

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

  it("throws when invoiceId already exists (deposit)", () => {
    const order = makeB2BOrder({ invoiceId: 999, invoiceNumber: 12345 });
    expect(() => validateOrder(order, 101, "deposit")).toThrow(
      "already has invoice",
    );
  });

  it("passes for a valid order with no invoice", () => {
    const order = makeB2BOrder();
    expect(() => validateOrder(order, 101)).not.toThrow();
  });

  it("passes when invoiceId is 0 (no invoice)", () => {
    const order = makeB2BOrder({ invoiceId: 0 });
    expect(() => validateOrder(order, 101)).not.toThrow();
  });

  it("allows existing invoice for balance type", () => {
    const order = makeB2BOrder({ invoiceId: 999, invoiceNumber: 12345 });
    expect(() => validateOrder(order, 101, "balance")).not.toThrow();
  });

  it("still rejects missing companyId for balance type", () => {
    const order = makeB2BOrder({ companyId: 0 });
    expect(() => validateOrder(order, 101, "balance")).toThrow(
      "not a B2B order",
    );
  });
});

// --- buildInvoicePayload (default / deposit) ---

describe("buildInvoicePayload", () => {
  const bcOrder = makeBCOrder();
  const products = [makeBCOrderProduct()];
  const b2bOrder = makeB2BOrder();

  it("calculates deposit as 50% of total_inc_tax", () => {
    const payload = buildInvoicePayload(bcOrder, products, b2bOrder);
    const expected = 566.5 * DEPOSIT_PERCENTAGE;
    expect(payload.originalBalance.value).toBe(expected);
  });

  it("sets originalBalance and openBalance to the same deposit amount", () => {
    const payload = buildInvoicePayload(bcOrder, products, b2bOrder);
    expect(payload.originalBalance.value).toBe(payload.openBalance.value);
    expect(payload.originalBalance.code).toBe(payload.openBalance.code);
  });

  it("scales line item unit prices by deposit percentage", () => {
    const payload = buildInvoicePayload(bcOrder, products, b2bOrder);
    const item = payload.details.details.lineItems[0];
    const expectedPrice = parseFloat("113.30") * DEPOSIT_PERCENTAGE;
    expect(item.unitPrice.value).toBe(String(expectedPrice));
  });

  it("scales cost lines by deposit percentage", () => {
    const payload = buildInvoicePayload(bcOrder, products, b2bOrder);
    const costLines = payload.details.header.costLines;

    const subtotal = costLines.find((c) => c.description === "Subtotal");
    expect(subtotal?.amount.value).toBe(
      String(parseFloat("556.50") * DEPOSIT_PERCENTAGE),
    );

    const freight = costLines.find((c) => c.description === "Freight");
    expect(freight?.amount.value).toBe(
      String(parseFloat("10.00") * DEPOSIT_PERCENTAGE),
    );

    const tax = costLines.find((c) => c.description === "Sales Tax");
    expect(tax?.amount.value).toBe(
      String(parseFloat("66.50") * DEPOSIT_PERCENTAGE),
    );
  });

  it("formats invoice number as INV-{orderId}-001", () => {
    const payload = buildInvoicePayload(bcOrder, products, b2bOrder);
    expect(payload.invoiceNumber).toBe("INV-101-001");
  });

  it("maps billing address fields correctly", () => {
    const payload = buildInvoicePayload(bcOrder, products, b2bOrder);
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
    const payload = buildInvoicePayload(bcOrder, products, b2bOrder);
    expect("channelId" in payload).toBe(false);
  });

  it("sets source to 1 (external)", () => {
    const payload = buildInvoicePayload(bcOrder, products, b2bOrder);
    expect(payload.source).toBe(1);
  });

  it("sets status to 0 (Open)", () => {
    const payload = buildInvoicePayload(bcOrder, products, b2bOrder);
    expect(payload.status).toBe(0);
  });

  it("includes purchaseOrderNumber when present", () => {
    const payload = buildInvoicePayload(bcOrder, products, b2bOrder);
    expect(payload.purchaseOrderNumber).toBe("PO-2024-001");
  });

  it("omits purchaseOrderNumber when empty", () => {
    const order = makeB2BOrder({ poNumber: "" });
    const payload = buildInvoicePayload(bcOrder, products, order);
    expect(payload.purchaseOrderNumber).toBeUndefined();
  });

  it("preserves line item quantity as string", () => {
    const payload = buildInvoicePayload(bcOrder, products, b2bOrder);
    const item = payload.details.details.lineItems[0];
    expect(item.quantity).toBe("5");
  });

  it("uses currency_code from the BC order", () => {
    const order = makeBCOrder({ currency_code: "CAD" });
    const payload = buildInvoicePayload(order, products, b2bOrder);
    expect(payload.originalBalance.code).toBe("CAD");
    expect(payload.details.details.lineItems[0].unitPrice.code).toBe("CAD");
  });

  it("sets type to 'Deposit Invoice' by default", () => {
    const payload = buildInvoicePayload(bcOrder, products, b2bOrder);
    expect(payload.type).toBe("Deposit Invoice");
  });

  it("includes termsConditions for deposit", () => {
    const payload = buildInvoicePayload(bcOrder, products, b2bOrder);
    expect(payload.termsConditions).toBe(
      INVOICE_TYPE_CONFIG.deposit.termsConditions,
    );
  });

  it("prefixes line item descriptions with [50% Deposit]", () => {
    const payload = buildInvoicePayload(bcOrder, products, b2bOrder);
    const item = payload.details.details.lineItems[0];
    expect(item.description).toBe("[50% Deposit] Toy Figure");
  });

  it("adds comments to line items", () => {
    const payload = buildInvoicePayload(bcOrder, products, b2bOrder);
    const item = payload.details.details.lineItems[0];
    expect(item.comments).toBe("50% deposit payment");
  });

  it("uses orderNumber for deposit invoices", () => {
    const payload = buildInvoicePayload(bcOrder, products, b2bOrder);
    expect(payload.orderNumber).toBe("101");
    expect(payload.externalId).toBeUndefined();
  });
});

// --- buildInvoicePayload (balance) ---

describe("buildInvoicePayload (balance)", () => {
  const bcOrder = makeBCOrder();
  const products = [makeBCOrderProduct()];
  const b2bOrder = makeB2BOrder();
  const balanceOptions = { type: "balance" as const, sequenceNumber: 2 };

  it("calculates balance as 50% of total_inc_tax", () => {
    const payload = buildInvoicePayload(
      bcOrder,
      products,
      b2bOrder,
      balanceOptions,
    );
    const expected = 566.5 * (1 - DEPOSIT_PERCENTAGE);
    expect(payload.originalBalance.value).toBe(expected);
  });

  it("formats invoice number as INV-{orderId}-002", () => {
    const payload = buildInvoicePayload(
      bcOrder,
      products,
      b2bOrder,
      balanceOptions,
    );
    expect(payload.invoiceNumber).toBe("INV-101-002");
  });

  it("sets type to 'Balance Invoice'", () => {
    const payload = buildInvoicePayload(
      bcOrder,
      products,
      b2bOrder,
      balanceOptions,
    );
    expect(payload.type).toBe("Balance Invoice");
  });

  it("uses externalId instead of orderNumber", () => {
    const payload = buildInvoicePayload(
      bcOrder,
      products,
      b2bOrder,
      balanceOptions,
    );
    expect(payload.externalId).toBe("ORD-101-BAL");
    expect(payload.orderNumber).toBeUndefined();
  });

  it("includes termsConditions for balance", () => {
    const payload = buildInvoicePayload(
      bcOrder,
      products,
      b2bOrder,
      balanceOptions,
    );
    expect(payload.termsConditions).toBe(
      INVOICE_TYPE_CONFIG.balance.termsConditions,
    );
  });

  it("prefixes line item descriptions with [Balance]", () => {
    const payload = buildInvoicePayload(
      bcOrder,
      products,
      b2bOrder,
      balanceOptions,
    );
    const item = payload.details.details.lineItems[0];
    expect(item.description).toBe("[Balance] Toy Figure");
  });

  it("adds balance comments to line items", () => {
    const payload = buildInvoicePayload(
      bcOrder,
      products,
      b2bOrder,
      balanceOptions,
    );
    const item = payload.details.details.lineItems[0];
    expect(item.comments).toBe("Remaining 50% balance");
  });

  it("scales line item unit prices by balance percentage", () => {
    const payload = buildInvoicePayload(
      bcOrder,
      products,
      b2bOrder,
      balanceOptions,
    );
    const item = payload.details.details.lineItems[0];
    const expectedPrice = parseFloat("113.30") * (1 - DEPOSIT_PERCENTAGE);
    expect(item.unitPrice.value).toBe(String(expectedPrice));
  });

  it("scales cost lines by balance percentage", () => {
    const payload = buildInvoicePayload(
      bcOrder,
      products,
      b2bOrder,
      balanceOptions,
    );
    const costLines = payload.details.header.costLines;
    const balancePct = 1 - DEPOSIT_PERCENTAGE;

    const subtotal = costLines.find((c) => c.description === "Subtotal");
    expect(subtotal?.amount.value).toBe(
      String(parseFloat("556.50") * balancePct),
    );

    const freight = costLines.find((c) => c.description === "Freight");
    expect(freight?.amount.value).toBe(
      String(parseFloat("10.00") * balancePct),
    );

    const tax = costLines.find((c) => c.description === "Sales Tax");
    expect(tax?.amount.value).toBe(
      String(parseFloat("66.50") * balancePct),
    );
  });
});
