// Verify GET /v2/orders/{id}
import { getConfig, V2_BASE, v2Headers, handleResponse } from "../src/api.ts";
import { getOrderId, logSection, logSuccess, logError } from "./log.ts";

const { storeHash, authToken } = getConfig();
const orderId = getOrderId();

logSection(`Fetching BC Order #${orderId} (v2 API)`);

const url = `${V2_BASE(storeHash)}/orders/${orderId}`;
console.log(`GET ${url}\n`);

try {
  const response = await fetch(url, { headers: v2Headers(authToken) });
  const order = (await handleResponse(response, "v2 order")) as Record<
    string,
    unknown
  >;

  logSection("Full Response");
  console.log(JSON.stringify(order, null, 2));

  logSection("Summary");
  const fields = [
    "id",
    "status",
    "total_inc_tax",
    "total_ex_tax",
    "total_tax",
    "subtotal_inc_tax",
    "shipping_cost_inc_tax",
    "discount_amount",
    "currency_code",
    "channel_id",
  ] as const;

  for (const field of fields) {
    console.log(`  ${field}: ${JSON.stringify(order[field])}`);
  }

  console.log(`  billing_address:`);
  const billing = order["billing_address"] as Record<string, unknown> | undefined;
  if (billing) {
    for (const key of [
      "first_name",
      "last_name",
      "street_1",
      "street_2",
      "city",
      "state",
      "zip",
      "country",
    ]) {
      console.log(`    ${key}: ${JSON.stringify(billing[key])}`);
    }
  }

  logSuccess("v2 order fetch successful");
} catch (err) {
  logError(String(err));
  process.exit(1);
}
