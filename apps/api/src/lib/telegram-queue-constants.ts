export const TELEGRAM_QUOTA_QUEUE = 'telegram-quota';
export const TELEGRAM_QUOTA_JOB_NAME = 'hourly-quota-check';
export const TELEGRAM_QUOTA_REPEAT_JOB_ID = 'telegram-hourly-quota-check';

/** Default: every hour at minute 0. Override with `TELEGRAM_QUOTA_CRON_PATTERN` in root `.env`. */
export const DEFAULT_TELEGRAM_QUOTA_CRON_PATTERN = '0 * * * *';

/** Max successful alerts per linked account within the rolling window. */
export const TELEGRAM_ALERT_MAX_PER_ACCOUNT = 3;
export const TELEGRAM_ALERT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Stored on SKIPPED logs when the per-account alert cap is reached (one log per window). */
export const TELEGRAM_RATE_LIMIT_SKIP_MESSAGE =
  'Rate limit: 3 alerts per account in the last 7 days.';
