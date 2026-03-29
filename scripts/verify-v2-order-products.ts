// Verify GET /v2/orders/{id}/products
import {
  getEnv,
  getOrderId,
  V2_BASE,
  v2Headers,
  logSection,
  logSuccess,
  logError,
  handleResponse,
} from "./helpers.ts";

const { storeHash, authToken } = getEnv();
const orderId = getOrderId();

logSection(`Fetching BC Order #${orderId} Products (v2 API)`);

const url = `${V2_BASE(storeHash)}/orders/${orderId}/products`;
console.log(`GET ${url}\n`);

try {
  const response = await fetch(url, { headers: v2Headers(authToken) });
  const products = (await handleResponse(
    response,
    "v2 order products",
  )) as Array<Record<string, unknown>>;

  logSection("Full Response");
  console.log(JSON.stringify(products, null, 2));

  logSection("Product Summary");
  for (const product of products) {
    console.log(`  ---`);
    for (const field of [
      "sku",
      "name",
      "quantity",
      "price_inc_tax",
      "price_ex_tax",
      "total_inc_tax",
      "type",
    ]) {
      console.log(`    ${field}: ${JSON.stringify(product[field])}`);
    }
  }

  logSuccess(`Found ${products.length} product(s)`);
} catch (err) {
  logError(String(err));
  process.exit(1);
}
