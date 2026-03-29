// Verify POST /invoices — chains all read APIs then creates an invoice
import {
  getConfig,
  V2_BASE,
  B2B_BASE,
  B2B_INVOICE_BASE,
  v2Headers,
  b2bHeaders,
  handleResponse,
} from "../src/api.ts";
import { getOrderId, logSection, logSuccess, logError, logWarn } from "./log.ts";

const { storeHash, authToken } = getConfig();
const orderId = getOrderId();

logSection(`Creating Test Invoice for BC Order #${orderId}`);

try {
  // Step 1: Fetch BC order (v2)
  logSection("Step 1: Fetch BC Order (v2)");
  const orderUrl = `${V2_BASE(storeHash)}/orders/${orderId}`;
  console.log(`GET ${orderUrl}`);
  const orderRes = await fetch(orderUrl, { headers: v2Headers(authToken) });
  const order = (await handleResponse(orderRes, "v2 order")) as Record<
    string,
    unknown
  >;
  logSuccess(
    `Order #${order["id"]}: total_inc_tax=${order["total_inc_tax"]}, currency=${order["currency_code"]}`,
  );

  // Step 2: Fetch B2B order
  logSection("Step 2: Fetch B2B Order");
  const b2bUrl = `${B2B_BASE}/orders/${orderId}`;
  console.log(`GET ${b2bUrl}`);
  const b2bRes = await fetch(b2bUrl, {
    headers: b2bHeaders(authToken, storeHash),
  });
  const b2bResult = (await handleResponse(b2bRes, "B2B order")) as {
    code: number;
    data: Record<string, unknown> | Array<Record<string, unknown>>;
  };
  const b2bOrder = Array.isArray(b2bResult.data) ? b2bResult.data[0] : b2bResult.data;
  if (!b2bOrder) {
    throw new Error("No B2B order data returned");
  }
  logSuccess(
    `B2B order: companyId=${b2bOrder["companyId"]}, poNumber=${b2bOrder["poNumber"]}`,
  );

  // Step 3: Validate
  logSection("Step 3: Validate");
  const companyId = b2bOrder["companyId"] as number;
  if (!companyId || companyId === 0) {
    throw new Error(
      `Order ${orderId} is not a B2B order (companyId: ${companyId})`,
    );
  }
  logSuccess(`companyId is valid: ${companyId}`);

  const existingInvoiceId = b2bOrder["invoiceId"];
  if (
    existingInvoiceId !== null &&
    existingInvoiceId !== undefined &&
    existingInvoiceId !== 0
  ) {
    logWarn(
      `Order already has invoice: invoiceId=${existingInvoiceId}, invoiceNumber=${b2bOrder["invoiceNumber"]}`,
    );
    logWarn("Proceeding anyway for testing purposes...");
  } else {
    logSuccess("No existing invoice on this order");
  }

  // Step 4: Build invoice payload
  logSection("Step 4: Build Invoice Payload");
  const currencyCode = (order["currency_code"] as string) || "USD";
  const totalIncTax = parseFloat(order["total_inc_tax"] as string);
  const timestamp = Date.now();
  const invoiceNumber = `TEST-INV-${orderId}-${timestamp}`;

  const billing = order["billing_address"] as Record<string, string>;

  const payload = {
    invoiceNumber,
    type: "Invoice",
    status: 0,
    source: 1,
    orderNumber: String(orderId),
    purchaseOrderNumber: (b2bOrder["poNumber"] as string) || undefined,
    customerId: String(companyId),
    originalBalance: { code: currencyCode, value: totalIncTax },
    openBalance: { code: currencyCode, value: totalIncTax },
    details: {
      header: {
        costLines: [
          {
            amount: { code: currencyCode, value: String(totalIncTax) },
            description: "Total",
          },
        ],
        billingAddress: {
          firstName: billing?.["first_name"] ?? "",
          lastName: billing?.["last_name"] ?? "",
          street1: billing?.["street_1"] ?? "",
          street2: billing?.["street_2"] ?? "",
          city: billing?.["city"] ?? "",
          state: billing?.["state"] ?? "",
          zipCode: billing?.["zip"] ?? "",
          country: billing?.["country"] ?? "",
        },
        shippingAddresses: [],
      },
      details: {
        lineItems: [
          {
            sku: "INV",
            quantity: "1",
            unitPrice: { code: currencyCode, value: String(totalIncTax) },
            description: `Test invoice for Order #${orderId}`,
            type: "physical",
          },
        ],
      },
    },
  };

  // Remove undefined purchaseOrderNumber
  if (!payload.purchaseOrderNumber) {
    delete payload.purchaseOrderNumber;
  }

  logSection("Invoice Payload");
  console.log(JSON.stringify(payload, null, 2));

  // Step 5: Create the invoice
  logSection("Step 5: Create Invoice");
  const invoiceUrl = `${B2B_INVOICE_BASE}/invoices`;
  console.log(`POST ${invoiceUrl}\n`);

  const createRes = await fetch(invoiceUrl, {
    method: "POST",
    headers: b2bHeaders(authToken, storeHash),
    body: JSON.stringify(payload),
  });

  const invoiceResult = (await handleResponse(createRes, "create invoice")) as {
    code: number;
    data: { id: number };
    meta: { message: string };
  };

  logSection("Result");
  console.log(JSON.stringify(invoiceResult, null, 2));
  logSuccess(
    `Invoice created! ID: ${invoiceResult.data.id}, Number: ${invoiceNumber}`,
  );
  console.log(
    `\nTo clean up: bun scripts/cleanup-invoice.ts ${invoiceResult.data.id}`,
  );
} catch (err) {
  logError(String(err));
  process.exit(1);
}
