// TypeScript interfaces for API request/response shapes

/** v2 GET /orders/{id} — trimmed to fields we actually use */
export interface BCOrder {
  id: number;
  status: string;
  status_id: number;
  total_inc_tax: string;
  currency_code: string;
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

/** Item from GET /invoices list */
export interface InvoiceListItem {
  id: number;
  invoiceNumber: string;
  orderNumber?: string;
  externalId?: string;
}

/** GET /invoices response */
export interface InvoiceListResponse {
  code: number;
  data: InvoiceListItem[];
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
