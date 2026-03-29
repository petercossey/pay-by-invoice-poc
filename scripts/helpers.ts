// Shared helpers for API verification scripts

export function getEnv() {
  const storeHash = process.env["BC_STORE_HASH"];
  const authToken = process.env["BC_AUTH_TOKEN"];

  if (!storeHash) {
    logError("BC_STORE_HASH is not set in .env");
    process.exit(1);
  }
  if (!authToken) {
    logError("BC_AUTH_TOKEN is not set in .env");
    process.exit(1);
  }

  return { storeHash, authToken };
}

export function getOrderId(): number {
  const arg = process.argv[2];
  if (!arg) {
    return 101;
  }
  const id = parseInt(arg, 10);
  if (isNaN(id)) {
    logError(`Invalid order ID: ${arg}`);
    process.exit(1);
  }
  return id;
}

export function getRequiredArg(name: string): string {
  const arg = process.argv[2];
  if (!arg) {
    logError(`Usage: bun <script> <${name}>`);
    process.exit(1);
  }
  return arg;
}

export const V2_BASE = (storeHash: string) =>
  `https://api.bigcommerce.com/stores/${storeHash}/v2`;

export const B2B_BASE = "https://api-b2b.bigcommerce.com/api/v3/io";

export const B2B_INVOICE_BASE = "https://api-b2b.bigcommerce.com/api/v3/io/ip";

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

export function logSection(title: string) {
  console.log(`\n\x1b[36m${"=".repeat(60)}\x1b[0m`);
  console.log(`\x1b[36m  ${title}\x1b[0m`);
  console.log(`\x1b[36m${"=".repeat(60)}\x1b[0m\n`);
}

export function logSuccess(msg: string) {
  console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
}

export function logError(msg: string) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
}

export function logWarn(msg: string) {
  console.log(`\x1b[33m⚠ ${msg}\x1b[0m`);
}

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

  const data: unknown = await response.json();
  return data;
}
