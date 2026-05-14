<script setup lang="ts">
import { computed } from 'vue';
import { RouterView } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAppTheme } from '@/composables/useAppTheme';

const { naiveTheme, naiveLocale, naiveDateLocale } = useAppTheme();
const { locale } = useI18n();
const dir = computed(() => (locale.value === 'fa' ? 'rtl' : 'ltr'));
</script>

<template>
  <n-config-provider
    :theme="naiveTheme"
    :locale="naiveLocale"
    :date-locale="naiveDateLocale"
    :dir="dir"
  >
    <n-global-style />
    <n-loading-bar-provider>
      <n-message-provider>
        <n-dialog-provider>
          <n-notification-provider>
            <RouterView />
          </n-notification-provider>
        </n-dialog-provider>
      </n-message-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}

body {
  font-family:
    'Inter',
    system-ui,
    -apple-system,
    'Segoe UI',
    Roboto,
    Helvetica,
    Arial,
    sans-serif;
}
</style>
