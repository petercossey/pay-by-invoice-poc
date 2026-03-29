// Validation logic + invoice payload builder

import type {
  BCOrder,
  BCOrderProduct,
  B2BOrder,
  CreateInvoicePayload,
  InvoiceType,
  InvoiceOptions,
} from "./types.ts";

export const DEPOSIT_PERCENTAGE = 0.5;

/** Per-type configuration for invoice labels and terms */
export const INVOICE_TYPE_CONFIG = {
  deposit: {
    type: "Deposit Invoice",
    termsConditions: `This invoice represents a ${DEPOSIT_PERCENTAGE * 100}% deposit. A balance invoice will follow for the remaining amount.`,
    descriptionPrefix: `[${DEPOSIT_PERCENTAGE * 100}% Deposit]`,
    comment: `${DEPOSIT_PERCENTAGE * 100}% deposit payment`,
  },
  balance: {
    type: "Balance Invoice",
    termsConditions: `This invoice represents the remaining ${(1 - DEPOSIT_PERCENTAGE) * 100}% balance after the initial deposit.`,
    descriptionPrefix: "[Balance]",
    comment: `Remaining ${(1 - DEPOSIT_PERCENTAGE) * 100}% balance`,
  },
} as const;

/** Get the percentage of the total for a given invoice type */
export function getPercentageForType(type: InvoiceType): number {
  return type === "deposit" ? DEPOSIT_PERCENTAGE : 1 - DEPOSIT_PERCENTAGE;
}

/** Get the sequence number for a given invoice type */
export function getSequenceForType(type: InvoiceType): number {
  return type === "deposit" ? 1 : 2;
}

/**
 * Validate that the order is eligible for invoicing.
 * Throws if the order is not a B2B order.
 * For deposit invoices, also throws if the order already has an invoice.
 * Balance invoices skip the existing-invoice check.
 */
export function validateOrder(
  b2bOrder: B2BOrder,
  orderId: number,
  invoiceType: InvoiceType = "deposit",
): void {
  if (!b2bOrder.companyId || b2bOrder.companyId === 0) {
    throw new Error(
      `Order ${orderId} is not a B2B order (companyId: ${b2bOrder.companyId})`,
    );
  }
  if (
    invoiceType !== "balance" &&
    b2bOrder.invoiceId !== null &&
    b2bOrder.invoiceId !== undefined &&
    b2bOrder.invoiceId !== 0
  ) {
    throw new Error(
      `Order ${orderId} already has invoice #${b2bOrder.invoiceNumber} (invoiceId: ${b2bOrder.invoiceId})`,
    );
  }
}

/**
 * Build an invoice payload for the given type at the appropriate percentage of the order total.
 * Omits channelId (causes 404 on the B2B Invoice API).
 */
export function buildInvoicePayload(
  bcOrder: BCOrder,
  products: BCOrderProduct[],
  b2bOrder: B2BOrder,
  options?: InvoiceOptions,
): CreateInvoicePayload {
  const invoiceType = options?.type ?? "deposit";
  const sequenceNumber = options?.sequenceNumber ?? getSequenceForType(invoiceType);
  const percentage = getPercentageForType(invoiceType);
  const config = INVOICE_TYPE_CONFIG[invoiceType];

  const currencyCode = bcOrder.currency_code || "USD";
  const totalIncTax = parseFloat(bcOrder.total_inc_tax);
  const invoiceAmount = totalIncTax * percentage;

  const seqStr = String(sequenceNumber).padStart(3, "0");
  const invoiceNumber = `INV-${bcOrder.id}-${seqStr}`;

  // Scale cost lines by percentage
  const subtotal =
    parseFloat(bcOrder.subtotal_inc_tax || "0") * percentage;
  const freight =
    parseFloat(bcOrder.shipping_cost_inc_tax || "0") * percentage;
  const tax = parseFloat(bcOrder.total_tax || "0") * percentage;
  const discount =
    -(parseFloat(bcOrder.discount_amount || "0") * percentage);

  const billing = bcOrder.billing_address;

  // Deposit invoices use orderNumber; balance invoices use externalId
  const orderIdentifier =
    invoiceType === "deposit"
      ? { orderNumber: String(bcOrder.id) }
      : { externalId: `ORD-${bcOrder.id}-BAL` };

  const payload: CreateInvoicePayload = {
    invoiceNumber,
    type: config.type,
    status: 0,
    source: 1,
    ...orderIdentifier,
    customerId: String(b2bOrder.companyId),
    termsConditions: config.termsConditions,
    originalBalance: { code: currencyCode, value: invoiceAmount },
    openBalance: { code: currencyCode, value: invoiceAmount },
    details: {
      header: {
        costLines: [
          {
            amount: { code: currencyCode, value: String(subtotal) },
            description: "Subtotal",
          },
          {
            amount: { code: currencyCode, value: String(freight) },
            description: "Freight",
          },
          {
            amount: { code: currencyCode, value: String(tax) },
            description: "Sales Tax",
          },
          {
            amount: { code: currencyCode, value: String(discount) },
            description: "Discount",
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
        lineItems: products.map((p) => ({
          sku: p.sku || "UNKNOWN",
          quantity: String(p.quantity),
          unitPrice: {
            code: currencyCode,
            value: String(
              parseFloat(p.price_inc_tax || "0") * percentage,
            ),
          },
          description: `${config.descriptionPrefix} ${p.name || ""}`.trim(),
          comments: config.comment,
          type: p.type || "physical",
        })),
      },
    },
  };

  // Add PO number if present
  if (b2bOrder.poNumber) {
    payload.purchaseOrderNumber = b2bOrder.poNumber;
  }

  return payload;
}
