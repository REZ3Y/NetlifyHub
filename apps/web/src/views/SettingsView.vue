<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FormInst, FormRules } from 'naive-ui';
import { useMessage } from 'naive-ui';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { http } from '@/api/http';
import { isAxiosError } from 'axios';
import { listIanaTimeZones, useUserDateTime } from '@/composables/useUserDateTime';
import type { AuthUser } from '@/types/auth';
import type { PanelSettings } from '@/types/panel-settings';

const { t } = useI18n();
const message = useMessage();
const auth = useAuthStore();
const router = useRouter();
const { formatDateTime } = useUserDateTime();

const profileForm = ref<FormInst | null>(null);
const passwordForm = ref<FormInst | null>(null);
const savingProfile = ref(false);
const savingPassword = ref(false);
const savingTimezone = ref(false);
const savingProxy = ref(false);
const loadingCacheSettings = ref(false);
const savingCacheSettings = ref(false);
const cacheTtlMinutes = ref(30);

const isAdmin = computed(() => auth.user?.role === 'ADMIN');
const downloadingBackup = ref(false);
const restoringBackup = ref(false);
const restoreFileInput = ref<HTMLInputElement | null>(null);
const pendingRestorePayload = ref<unknown | null>(null);
const showRestoreConfirm = ref(false);

const profileModel = reactive({
  username: '',
  timezone: 'UTC',
});

const timezoneOptions = computed(() =>
  listIanaTimeZones().map((value) => ({ label: value, value }))
);

const passwordModel = reactive({
  currentPassword: '',
  newPassword: '',
});

const proxyModel = reactive({
  enabled: false,
  type: 'http' as 'http' | 'socks5',
  host: '',
  port: 8080 as number | null,
  username: '',
});

const proxyPasswordInput = ref('');
const clearProxyPassword = ref(false);

watch(proxyPasswordInput, (v) => {
  if (v) clearProxyPassword.value = false;
});

const profileRules: FormRules = {
  username: [{ required: true, message: () => t('profile.rules.username'), trigger: 'blur' }],
};

const passwordRules: FormRules = {
  currentPassword: [
    { required: true, message: () => t('profile.rules.currentRequired'), trigger: 'blur' },
  ],
  newPassword: [
    { required: true, message: () => t('profile.rules.passwordMin'), trigger: 'blur' },
    { min: 8, message: () => t('profile.rules.passwordMin'), trigger: 'blur' },
  ],
};

const proxyTypeOptions = computed(() => [
  { label: t('settings.proxy.typeHttp'), value: 'http' },
  { label: t('settings.proxy.typeSocks5'), value: 'socks5' },
]);

function applyUserToForms(u: AuthUser) {
  profileModel.username = u.username;
  profileModel.timezone = u.timezone ?? 'UTC';
  proxyModel.enabled = u.proxyEnabled ?? false;
  proxyModel.type = u.proxyType === 'socks5' ? 'socks5' : 'http';
  proxyModel.host = u.proxyHost ?? '';
  proxyModel.port = u.proxyPort ?? 8080;
  proxyModel.username = u.proxyUsername ?? '';
  proxyPasswordInput.value = '';
  clearProxyPassword.value = false;
}

async function loadCacheSettings() {
  if (!isAdmin.value) return;
  loadingCacheSettings.value = true;
  try {
    const { data } = await http.get<{ settings: PanelSettings }>('/v1/panel-settings');
    cacheTtlMinutes.value = data.settings.netlifyCacheTtlMinutes;
  } catch {
    message.error(t('settings.cache.loadError'));
  } finally {
    loadingCacheSettings.value = false;
  }
}

async function saveCacheSettings() {
  savingCacheSettings.value = true;
  try {
    const { data } = await http.patch<{ settings: PanelSettings }>('/v1/panel-settings', {
      netlifyCacheTtlMinutes: cacheTtlMinutes.value,
    });
    cacheTtlMinutes.value = data.settings.netlifyCacheTtlMinutes;
    message.success(t('settings.cache.saved'));
  } catch {
    message.error(t('settings.cache.saveError'));
  } finally {
    savingCacheSettings.value = false;
  }
}

onMounted(async () => {
  await auth.fetchMe();
  if (auth.user) applyUserToForms(auth.user);
  void loadCacheSettings();
});

async function saveUsername() {
  await profileForm.value?.validate();
  savingProfile.value = true;
  try {
    const { data } = await http.patch<{ user: AuthUser }>('/v1/me', {
      username: profileModel.username,
    });
    auth.setUser(data.user);
    applyUserToForms(data.user);
    message.success(t('profile.saved'));
  } finally {
    savingProfile.value = false;
  }
}

async function saveTimezone() {
  savingTimezone.value = true;
  try {
    const { data } = await http.patch<{ user: AuthUser }>('/v1/me', {
      timezone: profileModel.timezone,
    });
    auth.setUser(data.user);
    applyUserToForms(data.user);
    message.success(t('profile.saved'));
  } finally {
    savingTimezone.value = false;
  }
}

async function savePassword() {
  try {
    await passwordForm.value?.validate();
  } catch {
    return;
  }
  savingPassword.value = true;
  try {
    const { data } = await http.patch<{ mustReauth?: boolean; user?: AuthUser }>('/v1/me', {
      currentPassword: passwordModel.currentPassword,
      newPassword: passwordModel.newPassword,
    });
    passwordModel.currentPassword = '';
    passwordModel.newPassword = '';
    if (data.mustReauth) {
      message.warning(t('profile.reauth'), { duration: 4500 });
      auth.setUser(null);
      window.setTimeout(() => {
        void router.push({ name: 'login' });
      }, 450);
      return;
    }
    if (data.user) {
      auth.setUser(data.user);
      applyUserToForms(data.user);
    }
    message.success(t('profile.saved'));
  } catch (e) {
    if (isAxiosError(e)) {
      const msg =
        typeof e.response?.data === 'object' &&
        e.response?.data !== null &&
        'message' in e.response.data &&
        typeof (e.response.data as { message: unknown }).message === 'string'
          ? (e.response.data as { message: string }).message
          : t('profile.passwordChangeError');
      message.error(msg);
      return;
    }
    message.error(t('profile.passwordChangeError'));
  } finally {
    savingPassword.value = false;
  }
}

function onClearProxyPassword() {
  clearProxyPassword.value = true;
  proxyPasswordInput.value = '';
  message.info(t('settings.proxy.clearPending'));
}

async function downloadBackup() {
  downloadingBackup.value = true;
  try {
    const { data } = await http.get<Record<string, unknown>>('/v1/me/backup', {
      responseType: 'json',
    });
    const exportedAt =
      typeof data.exportedAt === 'string' ? data.exportedAt.slice(0, 10) : 'export';
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `netlifyhub-backup-${exportedAt}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch {
    message.error(t('settings.backup.downloadError'));
  } finally {
    downloadingBackup.value = false;
  }
}

function onRestoreFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = typeof reader.result === 'string' ? reader.result : '';
      pendingRestorePayload.value = JSON.parse(text) as unknown;
      showRestoreConfirm.value = true;
    } catch {
      message.error(t('settings.backup.invalidFile'));
    } finally {
      input.value = '';
    }
  };
  reader.onerror = () => message.error(t('settings.backup.invalidFile'));
  reader.readAsText(file);
}

async function confirmRestore(): Promise<boolean> {
  if (!pendingRestorePayload.value) return false;
  restoringBackup.value = true;
  try {
    const { data } = await http.post<{
      user: AuthUser;
      accountsRestored: number;
      notesRestored: number;
      artifactsRestored: number;
      panelSettingsRestored: boolean;
      telegramSettingsRestored: boolean;
    }>('/v1/me/restore', pendingRestorePayload.value);
    auth.setUser(data.user);
    applyUserToForms(data.user);
    const adminItems: string[] = [];
    if (data.panelSettingsRestored) adminItems.push(t('settings.backup.restoreItemCache'));
    if (data.telegramSettingsRestored) adminItems.push(t('settings.backup.restoreItemTelegram'));
    const adminExtras = adminItems.length
      ? t('settings.backup.restoreAlso', { items: adminItems.join(', ') })
      : '';
    message.success(
      t('settings.backup.restoreSuccess', {
        accounts: data.accountsRestored,
        notes: data.notesRestored,
        artifacts: data.artifactsRestored,
        adminExtras,
      })
    );
    pendingRestorePayload.value = null;
    return true;
  } catch (e) {
    const msg =
      isAxiosError(e) &&
      e.response?.data &&
      typeof e.response.data === 'object' &&
      'message' in e.response.data &&
      typeof (e.response.data as { message: unknown }).message === 'string'
        ? (e.response.data as { message: string }).message
        : t('settings.backup.restoreError');
    message.error(msg);
    return false;
  } finally {
    restoringBackup.value = false;
  }
}

function cancelRestore() {
  showRestoreConfirm.value = false;
  pendingRestorePayload.value = null;
}

async function saveProxy() {
  if (proxyModel.enabled) {
    if (!proxyModel.host.trim()) {
      message.warning(t('settings.proxy.validation'));
      return;
    }
    if (proxyModel.port == null || proxyModel.port < 1 || proxyModel.port > 65535) {
      message.warning(t('settings.proxy.validation'));
      return;
    }
  }
  savingProxy.value = true;
  try {
    const body: Record<string, unknown> = {
      proxyEnabled: proxyModel.enabled,
      proxyType: proxyModel.type,
      proxyHost: proxyModel.host.trim() || null,
      proxyPort: proxyModel.port,
      proxyUsername: proxyModel.username.trim() || null,
    };
    if (clearProxyPassword.value) {
      body.proxyPassword = '';
    } else if (proxyPasswordInput.value) {
      body.proxyPassword = proxyPasswordInput.value;
    }
    const { data } = await http.patch<{ user: AuthUser }>('/v1/me', body);
    auth.setUser(data.user);
    applyUserToForms(data.user);
    message.success(t('settings.proxy.saved'));
  } finally {
    savingProxy.value = false;
  }
}
</script>

<template>
  <n-space vertical size="large" class="settings-page">
    <n-h2>{{ t('settings.title') }}</n-h2>

    <div class="settings-columns">
      <section class="settings-column">
        <n-h3 class="settings-column__title">{{ t('settings.sectionMain') }}</n-h3>
        <n-space vertical size="large" style="width: 100%">
          <n-card v-if="isAdmin" :title="t('settings.cache.title')" :segmented="{ content: true }">
            <n-spin :show="loadingCacheSettings">
              <n-p depth="3" style="margin-top: 0">{{ t('settings.cache.hint') }}</n-p>
              <n-form label-placement="top" style="margin-top: 12px">
                <n-form-item :label="t('settings.cache.ttlMinutes')">
                  <n-input-number
                    v-model:value="cacheTtlMinutes"
                    :min="1"
                    :max="1440"
                    :step="5"
                    style="width: 160px"
                  />
                </n-form-item>
                <n-button type="primary" :loading="savingCacheSettings" @click="saveCacheSettings">
                  {{ t('settings.cache.save') }}
                </n-button>
              </n-form>
            </n-spin>
          </n-card>

          <n-card :title="t('profile.timezone')" :segmented="{ content: true }">
            <n-p depth="3" style="margin-top: 0">{{ t('profile.timezoneHint') }}</n-p>
            <n-form label-placement="top">
              <n-form-item :label="t('profile.timezone')">
                <n-select
                  v-model:value="profileModel.timezone"
                  filterable
                  :options="timezoneOptions"
                  :consistent-menu-width="false"
                />
              </n-form-item>
              <n-button type="primary" :loading="savingTimezone" @click="saveTimezone">
                {{ t('profile.saveTimezone') }}
              </n-button>
            </n-form>
          </n-card>

          <n-card :title="t('settings.backup.title')" :segmented="{ content: true }">
            <n-p depth="3" style="margin-top: 0">{{ t('settings.backup.hint') }}</n-p>
            <n-space vertical :size="16" style="width: 100%; margin-top: 12px">
              <n-button type="primary" :loading="downloadingBackup" @click="downloadBackup">
                {{ t('settings.backup.download') }}
              </n-button>

              <n-divider />

              <n-text strong>{{ t('settings.backup.restoreTitle') }}</n-text>
              <n-p depth="3" style="margin: 0">{{ t('settings.backup.restoreHint') }}</n-p>
              <input
                ref="restoreFileInput"
                type="file"
                accept="application/json,.json"
                class="settings-backup__file-input"
                @change="onRestoreFileChange"
              />
              <n-button @click="restoreFileInput?.click()">
                {{ t('settings.backup.chooseFile') }}
              </n-button>
            </n-space>
          </n-card>
        </n-space>
      </section>

      <section class="settings-column">
        <n-h3 class="settings-column__title">{{ t('settings.sectionProxy') }}</n-h3>
        <n-space vertical size="large" style="width: 100%">
          <n-card :title="t('settings.proxy.title')" :segmented="{ content: true }">
            <n-p depth="3" style="margin-top: 0">{{ t('settings.proxy.hint') }}</n-p>
            <n-space vertical size="medium" style="width: 100%">
              <n-space align="center" justify="space-between" style="width: 100%">
                <n-text>{{ t('settings.proxy.enable') }}</n-text>
                <n-switch v-model:value="proxyModel.enabled" />
              </n-space>
              <n-form label-placement="top">
                <n-form-item :label="t('settings.proxy.type')">
                  <n-select v-model:value="proxyModel.type" :options="proxyTypeOptions" />
                </n-form-item>
                <n-form-item :label="t('settings.proxy.host')">
                  <n-input
                    v-model:value="proxyModel.host"
                    :placeholder="t('settings.proxy.hostPlaceholder')"
                  />
                </n-form-item>
                <n-form-item :label="t('settings.proxy.port')">
                  <n-input-number
                    v-model:value="proxyModel.port"
                    :min="1"
                    :max="65535"
                    :show-button="false"
                    style="width: 100%"
                  />
                </n-form-item>
                <n-form-item :label="t('settings.proxy.username')">
                  <n-input
                    v-model:value="proxyModel.username"
                    :placeholder="t('settings.proxy.optional')"
                    autocomplete="off"
                  />
                </n-form-item>
                <n-form-item :label="t('settings.proxy.password')">
                  <n-input
                    v-model:value="proxyPasswordInput"
                    type="password"
                    show-password-on="click"
                    :placeholder="
                      auth.user?.proxyHasPassword
                        ? t('settings.proxy.passwordPlaceholder')
                        : t('settings.proxy.optional')
                    "
                    autocomplete="new-password"
                  />
                  <n-text
                    v-if="auth.user?.proxyHasPassword"
                    depth="3"
                    style="display: block; margin-top: 8px"
                  >
                    {{ t('settings.proxy.passwordStored') }}
                  </n-text>
                </n-form-item>
                <n-button quaternary size="small" @click="onClearProxyPassword">
                  {{ t('settings.proxy.clearPassword') }}
                </n-button>
              </n-form>
              <n-button type="primary" :loading="savingProxy" @click="saveProxy">
                {{ t('settings.proxy.save') }}
              </n-button>
            </n-space>
          </n-card>
        </n-space>
      </section>

      <section class="settings-column">
        <n-h3 class="settings-column__title">{{ t('settings.sectionProfile') }}</n-h3>
        <n-space vertical size="large" style="width: 100%">
          <n-card :title="t('profile.username')" :segmented="{ content: true }">
            <n-form
              ref="profileForm"
              :model="profileModel"
              :rules="profileRules"
              label-placement="top"
            >
              <n-form-item path="username" :label="t('profile.username')">
                <n-input v-model:value="profileModel.username" autocomplete="username" />
              </n-form-item>
              <n-text
                v-if="auth.user?.createdAt"
                depth="3"
                style="display: block; margin-bottom: 12px"
              >
                {{ t('profile.memberSince') }}: {{ formatDateTime(auth.user.createdAt) }}
              </n-text>
              <n-button type="primary" :loading="savingProfile" @click="saveUsername">
                {{ t('profile.saveUsername') }}
              </n-button>
            </n-form>
          </n-card>

          <n-card :title="t('profile.changePassword')" :segmented="{ content: true }">
            <n-form
              ref="passwordForm"
              :model="passwordModel"
              :rules="passwordRules"
              label-placement="top"
            >
              <n-form-item path="currentPassword" :label="t('profile.currentPassword')">
                <n-input
                  v-model:value="passwordModel.currentPassword"
                  type="password"
                  show-password-on="click"
                  autocomplete="current-password"
                />
              </n-form-item>
              <n-form-item path="newPassword" :label="t('profile.newPassword')">
                <n-input
                  v-model:value="passwordModel.newPassword"
                  type="password"
                  show-password-on="click"
                  autocomplete="new-password"
                />
              </n-form-item>
              <n-button type="primary" :loading="savingPassword" @click="savePassword">
                {{ t('profile.changePassword') }}
              </n-button>
            </n-form>
          </n-card>
        </n-space>
      </section>
    </div>

    <n-modal
      v-model:show="showRestoreConfirm"
      preset="dialog"
      type="warning"
      :title="t('settings.backup.restoreTitle')"
      :content="t('settings.backup.restoreConfirm')"
      :positive-text="t('settings.backup.restoreConfirmBtn')"
      :negative-text="t('settings.backup.restoreCancel')"
      :loading="restoringBackup"
      @positive-click="confirmRestore"
      @negative-click="cancelRestore"
    />
  </n-space>
</template>

<style scoped>
.settings-page {
  max-width: 1320px;
}
.settings-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
  width: 100%;
}
.settings-column__title {
  margin: 0 0 12px;
}
@media (max-width: 1180px) {
  .settings-columns {
    grid-template-columns: 1fr;
  }
}

.settings-backup__file-input {
  display: none;
}
</style>
