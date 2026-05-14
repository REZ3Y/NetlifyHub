import { createI18n } from 'vue-i18n';
import { messages } from './messages';

function getInitialLocale(): string {
  if (typeof localStorage === 'undefined') return 'en';
  return localStorage.getItem('netlifyhub-locale') || 'en';
}

export const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: 'en',
  messages: {
    en: messages.en,
    fa: messages.fa,
  },
});
