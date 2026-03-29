// Verify GET /orders/{bcOrderId} (B2B Edition)
import {
  getEnv,
  getOrderId,
  B2B_BASE,
  b2bHeaders,
  logSection,
  logSuccess,
  logError,
  logWarn,
  handleResponse,
} from "./helpers.ts";

const { storeHash, authToken } = getEnv();
const orderId = getOrderId();

logSection(`Fetching B2B Order for BC Order #${orderId}`);

const url = `${B2B_BASE}/orders/${orderId}`;
console.log(`GET ${url}\n`);

try {
  const response = await fetch(url, {
    headers: b2bHeaders(authToken, storeHash),
  });
  const result = (await handleResponse(response, "B2B order")) as {
    code: number;
    data: Array<Record<string, unknown>>;
  };

  logSection("Full Response");
  console.log(JSON.stringify(result, null, 2));

  const b2bOrder = result.data[0];
  if (!b2bOrder) {
    logError("No B2B order data returned (data array is empty)");
    process.exit(1);
  }

  logSection("B2B Order Summary");
  for (const field of [
    "companyId",
    "invoiceId",
    "invoiceNumber",
    "invoiceStatus",
    "isInvoiceOrder",
    "poNumber",
    "currencyCode",
    "channelId",
  ]) {
    console.log(`  ${field}: ${JSON.stringify(b2bOrder[field])}`);
  }

  // Validation checks
  logSection("Validation");

  const companyId = b2bOrder["companyId"] as number | undefined;
  if (companyId && companyId !== 0) {
    logSuccess(`companyId is present: ${companyId}`);
  } else {
    logWarn("companyId is missing or zero — not a B2B company order");
  }

  const invoiceId = b2bOrder["invoiceId"];
  if (invoiceId === null || invoiceId === undefined || invoiceId === 0) {
    logSuccess("No existing invoice on this order");
  } else {
    logWarn(
      `Order already has an invoice: invoiceId=${invoiceId}, invoiceNumber=${b2bOrder["invoiceNumber"]}`,
    );
  }

  logSuccess("B2B order fetch successful");
} catch (err) {
  logError(String(err));
  process.exit(1);
}
