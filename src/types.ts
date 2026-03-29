// TypeScript interfaces for API request/response shapes

export type InvoiceType = "deposit" | "balance";

export interface InvoiceOptions {
  type: InvoiceType;
  sequenceNumber: number;
}

/** v2 GET /orders/{id} */
export interface BCOrder {
  id: number;
  status: string;
  status_id: number;
  total_inc_tax: string;
  total_ex_tax: string;
  total_tax: string;
  subtotal_inc_tax: string;
  shipping_cost_inc_tax: string;
  handling_cost_inc_tax: string;
  discount_amount: string;
  currency_code: string;
  channel_id: number;
  billing_address: {
    first_name: string;
    last_name: string;
    street_1: string;
    street_2: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
}

/** v2 GET /orders/{id}/products */
export interface BCOrderProduct {
  id: number;
  sku: string;
  name: string;
  quantity: number;
  price_inc_tax: string;
  price_ex_tax: string;
  total_inc_tax: string;
  type: string;
}

/** B2B GET /orders/{bcOrderId} — data field */
export interface B2BOrder {
  id: number;
  bcOrderId: number;
  companyId: number;
  invoiceId: number | null;
  invoiceNumber: number | null;
  invoiceStatus: number | null;
  isInvoiceOrder: number;
  poNumber: string;
  currencyCode: string;
  channelId: number | null;
  totalIncTax: number;
}

/** Generic B2B API response wrapper */
export interface B2BApiResponse<T> {
  code: number;
  data: T;
  meta: { message: string };
}

/** POST /invoices request body — channelId intentionally omitted (causes 404) */
export interface CreateInvoicePayload {
  invoiceNumber: string;
  type: string;
  status: number;
  source: number;
  orderNumber?: string;
  externalId?: string;
  purchaseOrderNumber?: string;
  termsConditions?: string;
  customerId: string;
  originalBalance: { code: string; value: number };
  openBalance: { code: string; value: number };
  details: {
    header: {
      costLines: Array<{
        amount: { code: string; value: string };
        description: string;
      }>;
      billingAddress: {
        firstName: string;
        lastName: string;
        street1: string;
        street2: string;
        city: string;
        state: string;
        zipCode: string;
        country: string;
      };
      shippingAddresses: Array<{
        firstName: string;
        lastName: string;
        street1: string;
        street2: string;
        city: string;
        state: string;
        zipCode: string;
        country: string;
      }>;
    };
    details: {
      lineItems: Array<{
        sku: string;
        quantity: string;
        unitPrice: { code: string; value: string };
        description: string;
        comments?: string;
        type: string;
      }>;
    };
  };
}

/** POST /invoices response */
export interface InvoiceResponse {
  code: number;
  data: { id: number };
  meta: { message: string };
}
