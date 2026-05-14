import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';

export function useUserDateTime() {
  const auth = useAuthStore();
  const { locale } = useI18n();

  const timeZone = computed(() => auth.user?.timezone ?? 'UTC');

  const dateTimeLocale = computed(() => (locale.value === 'fa' ? 'fa-IR' : 'en-US'));

  function formatDateTime(
    input: string | Date | null | undefined,
    options?: Intl.DateTimeFormatOptions
  ): string {
    if (input === null || input === undefined || input === '') return '—';
    const d = typeof input === 'string' ? new Date(input) : input;
    if (Number.isNaN(d.getTime())) return typeof input === 'string' ? input : '—';
    return new Intl.DateTimeFormat(dateTimeLocale.value, {
      timeZone: timeZone.value,
      dateStyle: 'medium',
      timeStyle: 'short',
      ...options,
    }).format(d);
  }

  return { timeZone, formatDateTime };
}

function supportedIanaTimeZones(): string[] | null {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    if (typeof fn === 'function') return fn.call(Intl, 'timeZone').slice().sort();
  } catch {
    /* ignore */
  }
  return null;
}

const fallbackTimeZones = [
  'UTC',
  'Asia/Tehran',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
];

export function listIanaTimeZones(): string[] {
  return supportedIanaTimeZones() ?? fallbackTimeZones;
}
