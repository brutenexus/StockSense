/**
 * Database CLI — `npm run db:migrate | db:seed | db:reset`.
 *
 * Runs through `tsx` so it shares the exact same code path as the app.
 */
import { dbFile, getDb } from './index';
import { seed, wipe } from './seed';
import { logger } from '../logger';
import { checkHealth, dashboardSnapshot } from '../repo/insights';
import { recomputeBalances } from '../repo/inventory';

async function main() {
  const command = (process.argv[2] ?? 'migrate').toLowerCase();
  getDb();
  logger.info(`db: ${command} → ${dbFile()}`);

  switch (command) {
    case 'migrate': {
      logger.info('db: schema is up to date');
      break;
    }
    case 'seed': {
      const result = await seed();
      printResult(result);
      break;
    }
    case 'reset': {
      wipe();
      const result = await seed();
      printResult(result);
      break;
    }
    case 'wipe': {
      wipe();
      logger.info('db: all rows removed');
      break;
    }
    case 'verify': {
      const before = checkHealth();
      const fixed = before.balanced ? 0 : recomputeBalances();
      const after = checkHealth();
      const snapshot = dashboardSnapshot();
      /* eslint-disable no-console */
      console.log('\n  Ledger integrity');
      console.log(`    balance rows in sync      ${after.driftRows === 0 ? 'yes' : `no (${after.driftRows} drifted)`}`);
      console.log(`    negative balances         ${after.negativeRows}`);
      if (fixed) console.log(`    rows repaired             ${fixed}`);
      console.log('\n  Inventory snapshot');
      console.log(`    products in stock         ${snapshot.totals.products}`);
      console.log(`    units on hand             ${snapshot.totals.onHand}`);
      console.log(`    units reserved            ${snapshot.totals.reserved}`);
      console.log(`    stock value               Rs ${snapshot.totals.value.toLocaleString('en-IN')}`);
      console.log(`    low / out of stock        ${snapshot.health.low} / ${snapshot.health.out}`);
      console.log(`    pending docs              R${snapshot.documents.pending.RECEIPT} D${snapshot.documents.pending.DELIVERY} T${snapshot.documents.pending.TRANSFER} A${snapshot.documents.pending.ADJUSTMENT}`);
      console.log('');
      if (!after.balanced) process.exitCode = 1;
      break;
    }
    default:
      logger.error(`db: unknown command "${command}". Use migrate | seed | reset | wipe | verify.`);
      process.exitCode = 1;
  }
}

function printResult(result: Awaited<ReturnType<typeof seed>>) {
  /* eslint-disable no-console */
  console.log('\n  StockSense demo data is ready.\n');
  console.log('  Sign in with:');
  for (const user of result.users) {
    console.log(`    • ${user.loginId.padEnd(9)} / ${user.password.padEnd(11)}  ${user.role.padEnd(8)} ${user.name}`);
  }
  console.log('\n  Seeded:');
  for (const [key, value] of Object.entries(result.counts)) {
    console.log(`    ${key.padEnd(12)} ${value}`);
  }
  console.log('\n  Start the app:  npm run dev   →  http://localhost:3100\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
