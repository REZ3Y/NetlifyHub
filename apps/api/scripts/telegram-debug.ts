/**
 * Run the quota monitor logic locally with a per-account report (no queue).
 * Usage: pnpm telegram:debug
 */
import './ensure-root-env.js';
import { loadEnv } from '../src/config/env.js';
import { prisma } from '../src/db/prisma.js';
import { fetchLinkedNetlifyAccountUsage } from '../src/services/netlify-account-usage.service.js';
import {
  getTelegramNotificationSettings,
  getTelegramSettingsForWorker,
  resolveTelegramBotToken,
} from '../src/services/telegram-settings.service.js';
import { sendTelegramMessage } from '../src/services/telegram-send.service.js';
import { countRecentSentAlertsForAccount } from '../src/services/telegram-notification-log.service.js';

const env = loadEnv();

function usagePercent(used: number, included: number): number | null {
  if (!Number.isFinite(used) || !Number.isFinite(included) || included <= 0) return null;
  return Math.round((used / included) * 1000) / 10;
}

async function main() {
  const sendTest = process.argv.includes('--send-test');

  console.log('--- Telegram debug ---\n');

  const dto = await getTelegramNotificationSettings();
  console.log('Panel settings:');
  console.log('  enabled:', dto.enabled);
  console.log('  hasBotToken:', dto.hasBotToken);
  console.log('  recipients:', dto.recipientChatIds.join(', ') || '(none)');
  console.log('  bandwidthThreshold:', dto.bandwidthThresholdPercent + '%');
  console.log('  creditThreshold:', dto.creditThresholdPercent + '%');

  const workerSettings = await getTelegramSettingsForWorker();
  if (!workerSettings) {
    console.log('\nWorker would SKIP: settings not ready (enabled + token + recipients required).');
    process.exit(1);
  }

  const plainToken = await resolveTelegramBotToken(env, workerSettings.botTokenEncrypted);
  console.log('  botTokenDecrypt:', plainToken ? 'OK' : 'FAILED (check TOKEN_ENCRYPTION_KEY)');

  if (sendTest && plainToken) {
    console.log('\nSending test message to each recipient...');
    for (const chatId of workerSettings.recipientChatIds) {
      const res = await sendTelegramMessage(
        env,
        workerSettings.botTokenEncrypted,
        workerSettings.proxyUserId,
        chatId,
        'NetlifyHub test: Telegram delivery works.'
      );
      console.log('  ', chatId, res.ok ? 'OK' : `FAIL: ${res.error}`);
    }
  }

  const accounts = await prisma.netlifyLinkedAccount.findMany({
    where: { enabled: true },
    select: { id: true, userId: true, label: true, email: true, fullName: true },
  });

  console.log(`\nEnabled linked accounts: ${accounts.length}`);
  if (!accounts.length) {
    console.log('No enabled accounts — nothing to check.');
    process.exit(0);
  }

  let wouldAlert = 0;
  for (const account of accounts) {
    const label =
      account.label?.trim() || account.fullName?.trim() || account.email?.trim() || account.id;
    console.log(`\n• ${label} (${account.id})`);

    const usageResult = await fetchLinkedNetlifyAccountUsage(env, account.userId, account.id, {
      refresh: true,
    });
    if (!usageResult.ok) {
      console.log('  usage: ERROR —', usageResult.message);
      continue;
    }

    const u = usageResult.usage;
    if (u.credits && u.credits.included > 0) {
      const pct = usagePercent(u.credits.used, u.credits.included);
      const threshold = workerSettings.creditThresholdPercent;
      console.log(
        `  credits: ${u.credits.usedLabel} / ${u.credits.includedLabel} (${pct}% vs threshold ${threshold}%)`
      );
      if (pct !== null && pct >= threshold) {
        const recent = await countRecentSentAlertsForAccount(account.id);
        if (recent >= 3) {
          console.log('  → would SKIP (rate limit: 3 alerts in 7 days)');
        } else {
          console.log('  → would SEND alert');
          wouldAlert += 1;
        }
      } else {
        console.log('  → no alert (below threshold)');
      }
    } else if (u.bandwidth && u.bandwidth.included > 0) {
      const pct = usagePercent(u.bandwidth.used, u.bandwidth.included);
      const threshold = workerSettings.bandwidthThresholdPercent;
      console.log(
        `  bandwidth: ${u.bandwidth.usedLabel} / ${u.bandwidth.includedLabel} (${pct}% vs threshold ${threshold}%)`
      );
      if (pct !== null && pct >= threshold) {
        const recent = await countRecentSentAlertsForAccount(account.id);
        if (recent >= 3) {
          console.log('  → would SKIP (rate limit: 3 alerts in 7 days)');
        } else {
          console.log('  → would SEND alert');
          wouldAlert += 1;
        }
      } else {
        console.log('  → no alert (below threshold)');
      }
    } else {
      console.log('  → no alert (no credits/bandwidth quota from Netlify API)');
    }
  }

  console.log(`\nSummary: ${wouldAlert} account(s) would trigger an alert on the next run.`);
  console.log(
    'Tip: Alerts only fire when usage ≥ threshold. Use --send-test to verify bot token + chat IDs.'
  );

  const logCount = await prisma.telegramNotificationLog.count();
  console.log(`\nNotification logs in DB: ${logCount} (see panel → Telegram → Logs)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
