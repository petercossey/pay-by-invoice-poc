// CLI entry point — arg parsing, orchestration, console output

import { getConfig, fetchBCOrder, fetchBCOrderProducts, fetchB2BOrder, createInvoice } from "./api.ts";
import { validateOrder, buildInvoicePayload, getPercentageForType, getSequenceForType, INVOICE_TYPE_CONFIG } from "./invoice.ts";
import type { InvoiceType } from "./types.ts";

const VALID_TYPES: InvoiceType[] = ["deposit", "balance"];

function parseArgs(): { orderId: number; invoiceTypes: InvoiceType[] } {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: bun src/index.ts <orderId> [deposit] [balance]");
    process.exit(1);
  }
  const orderId = parseInt(arg, 10);
  if (isNaN(orderId)) {
    console.error(`Invalid order ID: ${arg}`);
    process.exit(1);
  }

  // Parse invoice types from remaining args, default to ["deposit"]
  const typeArgs = process.argv.slice(3).map((a) => a.toLowerCase());
  const invoiceTypes: InvoiceType[] = typeArgs.length > 0
    ? typeArgs.filter((t): t is InvoiceType => VALID_TYPES.includes(t as InvoiceType))
    : ["deposit"];

  if (invoiceTypes.length === 0) {
    console.error(`Invalid invoice type(s). Valid types: ${VALID_TYPES.join(", ")}`);
    process.exit(1);
  }

  return { orderId, invoiceTypes };
}

async function main() {
  const { orderId, invoiceTypes } = parseArgs();
  const config = getConfig();

  const typeLabels = invoiceTypes.map((t) => INVOICE_TYPE_CONFIG[t].type).join(" + ");
  console.log(`\nCreating ${typeLabels} for order #${orderId}...\n`);

  // Fetch order data once (shared across invoice types)
  console.log("Fetching BC order...");
  const bcOrder = await fetchBCOrder(orderId, config);
  console.log(`  total_inc_tax: ${bcOrder.total_inc_tax} ${bcOrder.currency_code}`);

  console.log("Fetching BC order products...");
  const products = await fetchBCOrderProducts(orderId, config);
  console.log(`  ${products.length} product(s)`);

  console.log("Fetching B2B order...");
  const b2bOrder = await fetchB2BOrder(orderId, config);
  console.log(`  companyId: ${b2bOrder.companyId}`);

  // Process each invoice type in sequence
  const results: Array<{ type: InvoiceType; invoiceId: number; invoiceNumber: string; amount: number; currency: string }> = [];

  for (const invoiceType of invoiceTypes) {
    const percentage = getPercentageForType(invoiceType);
    const sequenceNumber = getSequenceForType(invoiceType);
    const config_label = INVOICE_TYPE_CONFIG[invoiceType];

    console.log(`\n--- ${config_label.type} (${percentage * 100}%) ---`);

    // Validate
    validateOrder(b2bOrder, orderId, invoiceType);

    // Build and create invoice
    const payload = buildInvoicePayload(bcOrder, products, b2bOrder, { type: invoiceType, sequenceNumber });
    console.log(`Creating invoice ${payload.invoiceNumber}...`);
    console.log(`  Amount: ${payload.originalBalance.value} ${payload.originalBalance.code}`);

    const result = await createInvoice(payload, config);

    console.log(`  Created! Invoice ID: ${result.data.id}`);
    results.push({
      type: invoiceType,
      invoiceId: result.data.id,
      invoiceNumber: payload.invoiceNumber,
      amount: payload.originalBalance.value,
      currency: payload.originalBalance.code,
    });
  }

  // Summary
  console.log(`\n=== Summary ===`);
  for (const r of results) {
    console.log(`  ${INVOICE_TYPE_CONFIG[r.type].type}: ${r.invoiceNumber} — ${r.amount} ${r.currency} (ID: ${r.invoiceId})`);
  }
  console.log();
}

try {
  await main();
} catch (err) {
  console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
