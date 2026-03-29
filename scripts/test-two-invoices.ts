// Test: Can we create two invoices (50% deposit + 50% balance) for a single order?
import {
  getEnv,
  getOrderId,
  V2_BASE,
  B2B_BASE,
  B2B_INVOICE_BASE,
  v2Headers,
  b2bHeaders,
  logSection,
  logSuccess,
  logError,
  logWarn,
  handleResponse,
} from "./helpers.ts";

const { storeHash, authToken } = getEnv();
const orderId = getOrderId();
const headers = b2bHeaders(authToken, storeHash);

logSection(`Two-Invoice Test for BC Order #${orderId}`);

const createdInvoiceIds: number[] = [];

try {
  // Fetch order total
  const orderRes = await fetch(`${V2_BASE(storeHash)}/orders/${orderId}`, {
    headers: v2Headers(authToken),
  });
  const order = (await handleResponse(orderRes, "v2 order")) as Record<string, unknown>;
  const currencyCode = (order["currency_code"] as string) || "USD";
  const totalIncTax = parseFloat(order["total_inc_tax"] as string);

  // Fetch B2B order for companyId
  const b2bRes = await fetch(`${B2B_BASE}/orders/${orderId}`, { headers });
  const b2bResult = (await handleResponse(b2bRes, "B2B order")) as {
    code: number;
    data: Record<string, unknown> | Array<Record<string, unknown>>;
  };
  const b2bOrder = Array.isArray(b2bResult.data) ? b2bResult.data[0] : b2bResult.data;
  const companyId = String(b2bOrder!["companyId"]);

  const depositAmount = Math.round(totalIncTax * 50) / 100;
  const balanceAmount = Math.round((totalIncTax - depositAmount) * 100) / 100;
  const ts = Date.now();

  console.log(`  Total:   $${totalIncTax} ${currencyCode}`);
  console.log(`  Deposit: $${depositAmount} (50%)`);
  console.log(`  Balance: $${balanceAmount} (50%)`);

  // --- Invoice 1: 50% deposit ---
  logSection("Invoice 1: 50% Deposit");
  const deposit = {
    invoiceNumber: `TEST-DEP-${orderId}-${ts}`,
    type: "Invoice",
    status: 0,
    source: 1,
    orderNumber: String(orderId),
    customerId: companyId,
    originalBalance: { code: currencyCode, value: depositAmount },
    openBalance: { code: currencyCode, value: depositAmount },
  };
  console.log(JSON.stringify(deposit, null, 2));

  const depRes = await fetch(`${B2B_INVOICE_BASE}/invoices`, {
    method: "POST",
    headers,
    body: JSON.stringify(deposit),
  });
  const depResult = (await handleResponse(depRes, "create deposit invoice")) as {
    code: number;
    data: { id: number };
  };
  createdInvoiceIds.push(depResult.data.id);
  logSuccess(`Deposit invoice created — ID: ${depResult.data.id}`);

  // --- Invoice 2: 50% balance (no orderNumber — use externalId to avoid uniqueness constraint) ---
  logSection("Invoice 2: 50% Balance");
  const balance = {
    invoiceNumber: `TEST-BAL-${orderId}-${ts}`,
    type: "Invoice",
    status: 0,
    source: 1,
    externalId: String(orderId),
    customerId: companyId,
    originalBalance: { code: currencyCode, value: balanceAmount },
    openBalance: { code: currencyCode, value: balanceAmount },
  };
  console.log(JSON.stringify(balance, null, 2));

  const balRes = await fetch(`${B2B_INVOICE_BASE}/invoices`, {
    method: "POST",
    headers,
    body: JSON.stringify(balance),
  });
  const balResult = (await handleResponse(balRes, "create balance invoice")) as {
    code: number;
    data: { id: number };
  };
  createdInvoiceIds.push(balResult.data.id);
  logSuccess(`Balance invoice created — ID: ${balResult.data.id}`);

  // --- Verify both invoices exist for the company ---
  logSection("Verification: List invoices for company");
  const listRes = await fetch(
    `${B2B_INVOICE_BASE}/invoices?customerId=${companyId}`,
    { headers },
  );
  const listResult = (await handleResponse(listRes, "list invoices")) as {
    code: number;
    data: Array<{ id: number; invoiceNumber: string; orderNumber?: string; externalId?: string }>;
  };

  const ourIds = new Set(createdInvoiceIds);
  const found = listResult.data.filter((inv) => ourIds.has(inv.id));
  console.log(`  Found ${found.length}/${createdInvoiceIds.length} invoices for company ${companyId}:`);
  for (const inv of found) {
    console.log(`    - ${inv.invoiceNumber} (ID: ${inv.id}, orderNumber: ${inv.orderNumber ?? "—"}, externalId: ${inv.externalId ?? "—"})`);
  }
  if (found.length === createdInvoiceIds.length) {
    logSuccess("Both invoices verified in listing");
  } else {
    logError(`Expected ${createdInvoiceIds.length} invoices, found ${found.length}`);
  }

  // --- Result ---
  logSection("Result");
  logSuccess(`Two invoices created for order #${orderId}:`);
  console.log(`  Deposit: ID ${createdInvoiceIds[0]} — $${depositAmount}`);
  console.log(`  Balance: ID ${createdInvoiceIds[1]} — $${balanceAmount}`);
} catch (err) {
  logError(String(err));
} finally {
  // --- Cleanup ---
  if (createdInvoiceIds.length > 0) {
    logSection("Cleanup");
    for (const id of createdInvoiceIds) {
      try {
        const delRes = await fetch(`${B2B_INVOICE_BASE}/invoices/${id}`, {
          method: "DELETE",
          headers,
        });
        await handleResponse(delRes, `delete invoice ${id}`);
        logSuccess(`Deleted invoice ${id}`);
      } catch (err) {
        logWarn(`Failed to delete invoice ${id}: ${err}`);
      }
    }
  }
}
