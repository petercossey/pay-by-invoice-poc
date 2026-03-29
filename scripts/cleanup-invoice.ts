// Delete a test invoice by ID
import { getConfig, B2B_INVOICE_BASE, b2bHeaders, handleResponse } from "../src/api.ts";
import { getRequiredArg, logSection, logSuccess, logError } from "./log.ts";

const { storeHash, authToken } = getConfig();
const invoiceId = getRequiredArg("invoiceId");

logSection(`Deleting Invoice #${invoiceId}`);

const url = `${B2B_INVOICE_BASE}/invoices/${invoiceId}`;
console.log(`DELETE ${url}\n`);

try {
  const response = await fetch(url, {
    method: "DELETE",
    headers: b2bHeaders(authToken, storeHash),
  });

  const result = await handleResponse(response, "delete invoice");
  console.log(JSON.stringify(result, null, 2));
  logSuccess(`Invoice #${invoiceId} deleted successfully`);
} catch (err) {
  logError(String(err));
  process.exit(1);
}
