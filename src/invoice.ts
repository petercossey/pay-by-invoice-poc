// Validation logic + invoice payload builder

import type {
  BCOrder,
  B2BOrder,
  CreateInvoicePayload,
  InvoiceListItem,
} from "./types.ts";

/**
 * Validate that the order is eligible for invoicing.
 * Throws if the order is not a B2B order (missing companyId).
 */
export function validateOrder(b2bOrder: B2BOrder, orderId: number): void {
  if (!b2bOrder.companyId || b2bOrder.companyId === 0) {
    throw new Error(
      `Order ${orderId} is not a B2B order (companyId: ${b2bOrder.companyId})`,
    );
  }
}

/**
 * Determine whether this is the first invoice for the order and
 * what sequence number to use.
 *
 * - isFirstInvoice: true when the B2B order has no invoiceId yet
 * - sequenceNumber: count of existing INV-{orderId}-* invoices + 1
 */
export function determineInvoiceContext(
  b2bOrder: B2BOrder,
  existingInvoices: InvoiceListItem[],
  orderId: number,
): { isFirstInvoice: boolean; sequenceNumber: number } {
  const isFirstInvoice =
    b2bOrder.invoiceId === null ||
    b2bOrder.invoiceId === undefined ||
    b2bOrder.invoiceId === 0;

  const prefix = `INV-${orderId}-`;
  const existing = existingInvoices.filter((inv) =>
    inv.invoiceNumber.startsWith(prefix),
  );

  return {
    isFirstInvoice,
    sequenceNumber: existing.length + 1,
  };
}

interface BuildOptions {
  amount: number;
  description: string;
  sequenceNumber: number;
  isFirstInvoice: boolean;
}

/**
 * Build an invoice payload with a single descriptive line item.
 * Omits channelId (causes 404 on the B2B Invoice API).
 */
export function buildInvoicePayload(
  bcOrder: BCOrder,
  b2bOrder: B2BOrder,
  options: BuildOptions,
): CreateInvoicePayload {
  const { amount, description, sequenceNumber, isFirstInvoice } = options;
  const currencyCode = bcOrder.currency_code || "USD";

  const seqStr = String(sequenceNumber).padStart(3, "0");
  const invoiceNumber = `INV-${bcOrder.id}-${seqStr}`;

  const billing = bcOrder.billing_address;

  // First invoice uses orderNumber; subsequent use externalId
  const orderIdentifier = isFirstInvoice
    ? { orderNumber: String(bcOrder.id) }
    : { externalId: `ORD-${bcOrder.id}` };

  const payload: CreateInvoicePayload = {
    invoiceNumber,
    type: "Invoice",
    status: 0,
    source: 1,
    ...orderIdentifier,
    customerId: String(b2bOrder.companyId),
    originalBalance: { code: currencyCode, value: amount },
    openBalance: { code: currencyCode, value: amount },
    details: {
      header: {
        costLines: [
          {
            amount: { code: currencyCode, value: String(amount) },
            description: "Total",
          },
        ],
        billingAddress: {
          firstName: billing?.first_name ?? "",
          lastName: billing?.last_name ?? "",
          street1: billing?.street_1 ?? "",
          street2: billing?.street_2 ?? "",
          city: billing?.city ?? "",
          state: billing?.state ?? "",
          zipCode: billing?.zip ?? "",
          country: billing?.country ?? "",
        },
        shippingAddresses: [],
      },
      details: {
        lineItems: [
          {
            sku: "INV",
            quantity: "1",
            unitPrice: { code: currencyCode, value: String(amount) },
            description,
            type: "physical",
          },
        ],
      },
    },
  };

  if (b2bOrder.poNumber) {
    payload.purchaseOrderNumber = b2bOrder.poNumber;
  }

  return payload;
}
