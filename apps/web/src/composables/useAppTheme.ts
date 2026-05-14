import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePreferredDark, useStorage } from '@vueuse/core';
import { darkTheme, dateEnUS, dateFaIR, enUS, faIR } from 'naive-ui';

export type ThemeMode = 'system' | 'light' | 'dark';

export function useAppTheme() {
  const mode = useStorage<ThemeMode>('netlifyhub-theme', 'system');
  const prefersDark = usePreferredDark();
  const { locale } = useI18n();

  const naiveTheme = computed(() => {
    if (mode.value === 'dark') return darkTheme;
    if (mode.value === 'light') return null;
    return prefersDark.value ? darkTheme : null;
  });

  const naiveLocale = computed(() => (locale.value === 'fa' ? faIR : enUS));
  const naiveDateLocale = computed(() => (locale.value === 'fa' ? dateFaIR : dateEnUS));

  return { mode, naiveTheme, naiveLocale, naiveDateLocale };
}
