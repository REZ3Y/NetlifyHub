export const TELEGRAM_QUOTA_QUEUE = 'telegram-quota';
export const TELEGRAM_QUOTA_JOB_NAME = 'hourly-quota-check';
export const TELEGRAM_QUOTA_REPEAT_JOB_ID = 'telegram-hourly-quota-check';

/** Max successful alerts per linked account within the rolling window. */
export const TELEGRAM_ALERT_MAX_PER_ACCOUNT = 3;
export const TELEGRAM_ALERT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
