// Fetch wrappers with auth headers for v2 + B2B APIs

import type {
  BCOrder,
  B2BOrder,
  B2BApiResponse,
  CreateInvoicePayload,
  InvoiceResponse,
  InvoiceListResponse,
  InvoiceListItem,
} from "./types.ts";

// --- Config ---

export interface Config {
  storeHash: string;
  authToken: string;
}

export function getConfig(): Config {
  const storeHash = process.env["BC_STORE_HASH"];
  const authToken = process.env["BC_AUTH_TOKEN"];

  if (!storeHash) throw new Error("BC_STORE_HASH is not set in environment");
  if (!authToken) throw new Error("BC_AUTH_TOKEN is not set in environment");

  return { storeHash, authToken };
}

// --- URL builders ---

export const V2_BASE = (storeHash: string) =>
  `https://api.bigcommerce.com/stores/${storeHash}/v2`;

export const B2B_BASE = "https://api-b2b.bigcommerce.com/api/v3/io";

export const B2B_INVOICE_BASE =
  "https://api-b2b.bigcommerce.com/api/v3/io/ip";

// --- Header factories ---

export function v2Headers(token: string): Record<string, string> {
  return {
    "X-Auth-Token": token,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export function b2bHeaders(
  token: string,
  storeHash: string,
): Record<string, string> {
  return {
    "X-Auth-Token": token,
    "X-Store-Hash": storeHash,
    "Content-Type": "application/json",
  };
}

// --- Error handling ---

export async function handleResponse(
  response: Response,
  label: string,
): Promise<unknown> {
  if (!response.ok) {
    const text = await response.text();
    let errMsg = text;
    try {
      const parsed = JSON.parse(text) as {
        code?: number;
        data?: { errMsg?: string };
        meta?: { message?: string };
      };
      if (parsed.data?.errMsg) {
        errMsg = `${parsed.data.errMsg} (code: ${parsed.code})`;
      }
    } catch {
      // use raw text
    }
    throw new Error(`${label}: HTTP ${response.status} — ${errMsg}`);
  }

  return response.json();
}

// --- API functions ---

export async function fetchBCOrder(
  orderId: number,
  config: Config,
): Promise<BCOrder> {
  const url = `${V2_BASE(config.storeHash)}/orders/${orderId}`;
  const res = await fetch(url, { headers: v2Headers(config.authToken) });
  return (await handleResponse(res, "v2 order")) as BCOrder;
}

export async function fetchB2BOrder(
  orderId: number,
  config: Config,
): Promise<B2BOrder> {
  const url = `${B2B_BASE}/orders/${orderId}`;
  const res = await fetch(url, {
    headers: b2bHeaders(config.authToken, config.storeHash),
  });
  const result = (await handleResponse(res, "B2B order")) as B2BApiResponse<
    B2BOrder | B2BOrder[]
  >;
  // API may return data as object or array — normalize
  const order = Array.isArray(result.data)
    ? result.data[0]
    : result.data;
  if (!order) {
    throw new Error("No B2B order data returned");
  }
  return order;
}

export async function fetchInvoicesForCompany(
  companyId: number,
  config: Config,
): Promise<InvoiceListItem[]> {
  const url = `${B2B_INVOICE_BASE}/invoices?customerId=${companyId}`;
  const res = await fetch(url, {
    headers: b2bHeaders(config.authToken, config.storeHash),
  });
  const result = (await handleResponse(
    res,
    "list invoices",
  )) as InvoiceListResponse;
  return result.data;
}

export async function createInvoice(
  payload: CreateInvoicePayload,
  config: Config,
): Promise<InvoiceResponse> {
  const url = `${B2B_INVOICE_BASE}/invoices`;
  const res = await fetch(url, {
    method: "POST",
    headers: b2bHeaders(config.authToken, config.storeHash),
    body: JSON.stringify(payload),
  });
  return (await handleResponse(res, "create invoice")) as InvoiceResponse;
}
