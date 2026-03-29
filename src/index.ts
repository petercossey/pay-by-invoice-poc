// CLI entry point — arg parsing, orchestration, console output

import { getConfig, fetchBCOrder, fetchB2BOrder, fetchInvoicesForCompany, createInvoice } from "./api.ts";
import { validateOrder, determineInvoiceContext, buildInvoicePayload } from "./invoice.ts";

function parseArgs(): { orderId: number; amount: number; description?: string } {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: bun src/index.ts <orderId> <amount> [--description "..."]');
    process.exit(1);
  }

  const orderId = parseInt(args[0], 10);
  if (isNaN(orderId)) {
    console.error(`Invalid order ID: ${args[0]}`);
    process.exit(1);
  }

  const amount = parseFloat(args[1]);
  if (isNaN(amount) || amount <= 0) {
    console.error(`Invalid amount: ${args[1]} (must be a positive number)`);
    process.exit(1);
  }

  let description: string | undefined;
  const descIdx = args.indexOf("--description");
  if (descIdx !== -1 && args[descIdx + 1]) {
    description = args[descIdx + 1];
  }

  return { orderId, amount, description };
}

async function main() {
  const { orderId, amount, description } = parseArgs();
  const config = getConfig();

  console.log(`\nCreating invoice for order #${orderId} — $${amount}...\n`);

  // Fetch order data in parallel (no product fetch needed)
  console.log("Fetching order data...");
  const [bcOrder, b2bOrder] = await Promise.all([
    fetchBCOrder(orderId, config),
    fetchB2BOrder(orderId, config),
  ]);
  console.log(`  total_inc_tax: ${bcOrder.total_inc_tax} ${bcOrder.currency_code}`);
  console.log(`  companyId: ${b2bOrder.companyId}`);

  // Validate
  validateOrder(b2bOrder, orderId);

  // Determine first vs subsequent + sequence number
  console.log("Checking existing invoices...");
  const existingInvoices = await fetchInvoicesForCompany(b2bOrder.companyId, config);
  const { isFirstInvoice, sequenceNumber } = determineInvoiceContext(b2bOrder, existingInvoices, orderId);

  const label = isFirstInvoice ? "first invoice" : `invoice #${sequenceNumber}`;
  console.log(`  This will be the ${label}`);

  // Default description
  const invoiceDescription = description ??
    (isFirstInvoice ? `Deposit for Order #${orderId}` : `Payment for Order #${orderId}`);

  // Build and create
  const payload = buildInvoicePayload(bcOrder, b2bOrder, {
    amount,
    description: invoiceDescription,
    sequenceNumber,
    isFirstInvoice,
  });

  console.log(`\nCreating invoice ${payload.invoiceNumber}...`);
  console.log(`  Amount: ${payload.originalBalance.value} ${payload.originalBalance.code}`);
  console.log(`  Description: ${invoiceDescription}`);

  const result = await createInvoice(payload, config);

  console.log(`\n=== Created ===`);
  console.log(`  Invoice ID: ${result.data.id}`);
  console.log(`  Invoice Number: ${payload.invoiceNumber}`);
  console.log(`  Amount: ${amount} ${bcOrder.currency_code}`);
  console.log(`  Description: ${invoiceDescription}`);
  console.log();
}

try {
  await main();
} catch (err) {
  console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
