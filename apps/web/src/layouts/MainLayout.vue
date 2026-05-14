<script setup lang="ts">
import { computed, h, ref } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  BookOutline,
  GridOutline,
  LogOutOutline,
  SettingsOutline,
  PersonAddOutline,
} from '@vicons/ionicons5';
import { NIcon, useMessage } from 'naive-ui';
import { useAppTheme, type ThemeMode } from '@/composables/useAppTheme';
import { useAuthStore } from '@/stores/auth';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const message = useMessage();
const { mode: themeMode } = useAppTheme();
const siderCollapsed = ref(false);

const dir = computed(() => (locale.value === 'fa' ? 'rtl' : 'ltr'));

function renderIcon(icon: typeof GridOutline) {
  return () => h(NIcon, null, { default: () => h(icon) });
}

const menuOptions = computed(() => [
  {
    label: t('nav.dashboard'),
    key: 'dashboard',
    icon: renderIcon(GridOutline),
  },
  {
    label: t('nav.registerNetlifyAccount'),
    key: 'registerNetlifyAccount',
    icon: renderIcon(PersonAddOutline),
  },
  {
    label: t('nav.settings'),
    key: 'settings',
    icon: renderIcon(SettingsOutline),
  },
]);

const activeKey = computed(() => {
  if (route.name === 'settings') return 'settings';
  if (route.name === 'registerNetlifyAccount') return 'registerNetlifyAccount';
  return 'dashboard';
});

const pathByMenuKey: Record<string, string> = {
  dashboard: '/',
  settings: '/settings',
  registerNetlifyAccount: '/netlify-accounts/register',
};

function onMenuSelect(key: string) {
  const path = pathByMenuKey[key];
  if (path !== undefined) void router.push(path);
}

async function onLogout() {
  await auth.logout();
  message.success(t('nav.logout'));
  void router.push({ name: 'login' });
}

function setLocale(lang: 'en' | 'fa') {
  locale.value = lang;
  localStorage.setItem('netlifyhub-locale', lang);
}

const themeSelectOptions = computed(() => [
  { label: t('common.themeSystem'), value: 'system' },
  { label: t('common.themeLight'), value: 'light' },
  { label: t('common.themeDark'), value: 'dark' },
]);

function onThemeSelect(v: ThemeMode) {
  themeMode.value = v;
}
</script>

<template>
  <n-layout has-sider position="absolute" :dir="dir">
    <n-layout-sider
      v-model:collapsed="siderCollapsed"
      bordered
      show-trigger
      collapse-mode="width"
      :collapsed-width="64"
      :width="240"
      content-style="display:flex;flex-direction:column;"
    >
      <div class="brand" :class="{ 'brand--collapsed': siderCollapsed }">
        <n-icon size="22" :component="BookOutline" />
        <span v-show="!siderCollapsed" class="brand-text">{{ t('app.title') }}</span>
      </div>
      <n-menu
        :value="activeKey"
        :options="menuOptions"
        :collapsed-width="64"
        @update:value="onMenuSelect"
      />
      <div class="sider-footer" :class="{ 'sider-footer--collapsed': siderCollapsed }">
        <n-button quaternary block @click="onLogout">
          <template #icon>
            <n-icon :component="LogOutOutline" />
          </template>
          <span v-show="!siderCollapsed">{{ t('nav.logout') }}</span>
        </n-button>
      </div>
    </n-layout-sider>
    <n-layout :native-scrollbar="false">
      <n-layout-header bordered class="header">
        <n-space align="center" justify="space-between" style="width: 100%">
          <n-text v-show="!siderCollapsed" strong>{{ t('app.title') }}</n-text>
          <n-space>
            <n-select
              size="small"
              style="width: 120px"
              :value="locale"
              :options="[
                { label: 'English', value: 'en' },
                { label: 'فارسی', value: 'fa' },
              ]"
              @update:value="(v: string) => setLocale(v as 'en' | 'fa')"
            />
            <n-select
              size="small"
              style="width: 140px"
              :value="themeMode"
              :options="themeSelectOptions"
              @update:value="(v: string) => onThemeSelect(v as ThemeMode)"
            />
          </n-space>
        </n-space>
      </n-layout-header>
      <n-layout-content content-style="padding: 24px; min-height: calc(100vh - 64px)">
        <RouterView />
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<style scoped>
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 18px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.brand-text {
  font-size: 15px;
}
.sider-footer {
  margin-top: auto;
  padding: 12px;
}
.brand--collapsed {
  justify-content: center;
  gap: 0;
  padding-left: 12px;
  padding-right: 12px;
}
.sider-footer--collapsed :deep(.n-button .n-button__content) {
  justify-content: center;
}
.sider-footer--collapsed :deep(.n-button .n-button__icon) {
  margin: 0;
}
.header {
  height: 64px;
  display: flex;
  align-items: center;
  padding: 0 20px;
}
</style>
