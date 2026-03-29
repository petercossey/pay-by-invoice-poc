// Shared helpers for scripts

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
