import { apiCapability, body, handle, HttpError, oneOf, optionalText } from '@/lib/http';
import { checkHealth } from '@/lib/repo/insights';
import { recomputeBalances } from '@/lib/repo/inventory';
import { wipe, seed } from '@/lib/db/seed';
import { logActivity, syncStockAlerts } from '@/lib/repo/activity';
import { dbFile } from '@/lib/db';

const ACTIONS = ['check', 'recompute', 'reseed'] as const;

export async function POST(request: Request) {
  return handle(async () => {
    const user = await apiCapability('manage_settings');
    const payload = await body<{ action?: string; confirmation?: string }>(request);
    const action = oneOf(payload.action, ACTIONS, 'Action');

    if (action === 'check') {
      return { health: checkHealth(), file: dbFile() };
    }

    if (action === 'recompute') {
      const fixed = recomputeBalances();
      syncStockAlerts();
      const health = checkHealth();
      logActivity({
        userId: user.id,
        userName: user.name,
        action: 'DATA_RECOMPUTE',
        entityType: 'system',
        summary: `Recomputed balances from the ledger — ${fixed} row(s) corrected`,
        meta: { fixed },
      });
      return { fixed, health, file: dbFile() };
    }

    // Reseeding is destructive: it wipes every document, movement and balance
    // before replaying the demo dataset. Typed confirmation guards it.
    if (optionalText(payload.confirmation) !== 'RESEED') {
      throw new HttpError('Type RESEED to confirm — this replaces every document and movement.', 400, {
        confirmation: 'Type RESEED exactly',
      });
    }

    wipe();
    const result = await seed();
    logActivity({
      userId: user.id,
      userName: user.name,
      action: 'DATA_RESEED',
      entityType: 'system',
      summary: `Reseeded the demo dataset — ${result.counts.documents} documents, ${result.counts.moves} ledger rows`,
    });
    return { result: { counts: result.counts, users: result.users }, health: checkHealth() };
  });
}
