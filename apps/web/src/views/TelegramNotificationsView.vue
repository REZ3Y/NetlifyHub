<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { isAxiosError } from 'axios';
import { ChatbubbleOutline, PeopleOutline } from '@vicons/ionicons5';
import { NButton, NIcon, NTag, NTooltip, useMessage } from 'naive-ui';
import { http } from '@/api/http';
import { useUserDateTime } from '@/composables/useUserDateTime';
import { useAuthStore } from '@/stores/auth';
import type {
  TelegramDeliveryResult,
  TelegramNotificationLog,
  TelegramNotificationLogStatus,
  TelegramNotificationSettings,
} from '@/types/telegram-notification';

const { t } = useI18n();
const message = useMessage();
const auth = useAuthStore();
const { formatDateTime } = useUserDateTime();

const isAdmin = computed(() => auth.user?.role === 'ADMIN');
const activeTab = ref<'settings' | 'logs'>('settings');

const loadingSettings = ref(true);
const savingSettings = ref(false);
const enabled = ref(false);
const botToken = ref('');
const recipientIds = ref<string[]>([]);
const recipientInput = ref('');
const bandwidthThreshold = ref(80);
const creditThreshold = ref(80);

const loadingLogs = ref(false);
const logs = ref<TelegramNotificationLog[]>([]);
const logsPage = ref(1);
const logsTotal = ref(0);
const pageSize = 20;

const showMessageModal = ref(false);
const messageModalText = ref('');
const showDeliveryModal = ref(false);
const deliveryModalResults = ref<TelegramDeliveryResult[]>([]);

function renderIcon(icon: typeof ChatbubbleOutline) {
  return () => h(NIcon, { size: 18, component: icon });
}

function openMessageModal(text: string) {
  messageModalText.value = text;
  showMessageModal.value = true;
}

function openDeliveryModal(results: TelegramDeliveryResult[]) {
  deliveryModalResults.value = results;
  showDeliveryModal.value = true;
}

function apiErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err) && err.response?.data && typeof err.response.data === 'object') {
    const msg = (err.response.data as { message?: string }).message;
    if (msg) return msg;
  }
  return fallback;
}

function statusTagType(
  status: TelegramNotificationLogStatus
): 'success' | 'warning' | 'error' | 'default' {
  if (status === 'SENT') return 'success';
  if (status === 'FAILED') return 'error';
  if (status === 'SKIPPED') return 'warning';
  return 'default';
}

async function loadSettings() {
  loadingSettings.value = true;
  try {
    const { data } = await http.get<{ settings: TelegramNotificationSettings }>(
      '/v1/telegram-notifications/settings'
    );
    enabled.value = data.settings.enabled;
    botToken.value = '';
    recipientIds.value = [...data.settings.recipientChatIds];
    bandwidthThreshold.value = data.settings.bandwidthThresholdPercent;
    creditThreshold.value = data.settings.creditThresholdPercent;
  } catch (err) {
    message.error(apiErrorMessage(err, t('telegramNotifications.settings.loadError')));
  } finally {
    loadingSettings.value = false;
  }
}

async function saveSettings() {
  savingSettings.value = true;
  try {
    const payload: Record<string, unknown> = {
      enabled: enabled.value,
      recipientChatIds: recipientIds.value,
      bandwidthThresholdPercent: bandwidthThreshold.value,
      creditThresholdPercent: creditThreshold.value,
    };
    const token = botToken.value.trim();
    if (token) payload.botToken = token;

    const { data } = await http.patch<{ settings: TelegramNotificationSettings }>(
      '/v1/telegram-notifications/settings',
      payload
    );
    enabled.value = data.settings.enabled;
    botToken.value = '';
    recipientIds.value = [...data.settings.recipientChatIds];
    message.success(t('telegramNotifications.settings.saved'));
  } catch (err) {
    message.error(apiErrorMessage(err, t('telegramNotifications.settings.saveError')));
  } finally {
    savingSettings.value = false;
  }
}

function addRecipient() {
  const id = recipientInput.value.trim();
  if (!id) return;
  if (!recipientIds.value.includes(id)) {
    recipientIds.value = [...recipientIds.value, id];
  }
  recipientInput.value = '';
}

function removeRecipient(id: string) {
  recipientIds.value = recipientIds.value.filter((r) => r !== id);
}

async function loadLogs() {
  loadingLogs.value = true;
  try {
    const { data } = await http.get<{
      logs: TelegramNotificationLog[];
      total: number;
      page: number;
      pageSize: number;
    }>('/v1/telegram-notifications/logs', {
      params: { page: logsPage.value, pageSize },
    });
    logs.value = data.logs;
    logsTotal.value = data.total;
    logsPage.value = data.page;
  } catch (err) {
    logs.value = [];
    logsTotal.value = 0;
    message.error(apiErrorMessage(err, t('telegramNotifications.logs.loadError')));
  } finally {
    loadingLogs.value = false;
  }
}

watch(activeTab, (tab) => {
  if (tab === 'logs' && isAdmin.value) void loadLogs();
});

watch(logsPage, () => {
  if (activeTab.value === 'logs' && isAdmin.value) void loadLogs();
});

onMounted(() => {
  if (isAdmin.value) void loadSettings();
});
</script>

<template>
  <n-space vertical :size="20">
    <div>
      <n-h2 style="margin: 0">{{ t('telegramNotifications.title') }}</n-h2>
      <n-p depth="3" style="margin-top: 4px">{{ t('telegramNotifications.subtitle') }}</n-p>
    </div>

    <n-alert v-if="!isAdmin" type="warning" :show-icon="true">
      {{ t('telegramNotifications.adminOnly') }}
    </n-alert>

    <template v-else>
      <n-tabs v-model:value="activeTab" type="line" animated>
        <n-tab-pane name="settings" :tab="t('telegramNotifications.tabs.settings')">
          <n-spin :show="loadingSettings">
            <n-card :segmented="{ content: true }">
              <n-form label-placement="top">
                <n-form-item :label="t('telegramNotifications.settings.enabled')">
                  <n-switch v-model:value="enabled" />
                </n-form-item>

                <n-form-item :label="t('telegramNotifications.settings.botToken')">
                  <n-input
                    v-model:value="botToken"
                    type="password"
                    show-password-on="click"
                    :placeholder="t('telegramNotifications.settings.botTokenPlaceholder')"
                  />
                  <template #feedback>
                    <n-text depth="3">{{
                      t('telegramNotifications.settings.botTokenHint')
                    }}</n-text>
                  </template>
                </n-form-item>

                <n-form-item :label="t('telegramNotifications.settings.recipients')">
                  <n-space vertical style="width: 100%">
                    <n-space>
                      <n-input
                        v-model:value="recipientInput"
                        :placeholder="t('telegramNotifications.settings.recipientPlaceholder')"
                        style="min-width: 220px"
                        @keyup.enter="addRecipient"
                      />
                      <n-button @click="addRecipient">
                        {{ t('telegramNotifications.settings.addRecipient') }}
                      </n-button>
                    </n-space>
                    <n-space v-if="recipientIds.length" :size="8" wrap>
                      <n-tag
                        v-for="id in recipientIds"
                        :key="id"
                        closable
                        @close="removeRecipient(id)"
                      >
                        {{ id }}
                      </n-tag>
                    </n-space>
                    <n-text v-else depth="3">{{
                      t('telegramNotifications.settings.noRecipients')
                    }}</n-text>
                  </n-space>
                </n-form-item>

                <n-form-item :label="t('telegramNotifications.settings.bandwidthThreshold')">
                  <n-input-number
                    v-model:value="bandwidthThreshold"
                    :min="1"
                    :max="100"
                    style="width: 140px"
                  />
                  <template #feedback>
                    <n-text depth="3">{{
                      t('telegramNotifications.settings.thresholdHint')
                    }}</n-text>
                  </template>
                </n-form-item>

                <n-form-item :label="t('telegramNotifications.settings.creditThreshold')">
                  <n-input-number
                    v-model:value="creditThreshold"
                    :min="1"
                    :max="100"
                    style="width: 140px"
                  />
                </n-form-item>

                <n-button type="primary" :loading="savingSettings" @click="saveSettings">
                  {{ t('telegramNotifications.settings.save') }}
                </n-button>
              </n-form>
            </n-card>
          </n-spin>
        </n-tab-pane>

        <n-tab-pane name="logs" :tab="t('telegramNotifications.tabs.logs')">
          <n-spin :show="loadingLogs">
            <n-card :segmented="{ content: true }" content-style="padding: 0">
              <div v-if="!loadingLogs && logs.length === 0" class="logs-empty">
                <n-empty :description="t('telegramNotifications.logs.empty')" />
              </div>
              <table v-else class="logs-table">
                <thead>
                  <tr>
                    <th>{{ t('telegramNotifications.logs.colTime') }}</th>
                    <th>{{ t('telegramNotifications.logs.colStatus') }}</th>
                    <th>{{ t('telegramNotifications.logs.colAccount') }}</th>
                    <th>{{ t('telegramNotifications.logs.colRecipients') }}</th>
                    <th class="col-actions">{{ t('telegramNotifications.logs.colActions') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in logs" :key="row.id">
                    <td class="tabular-nums">{{ formatDateTime(row.sentAt ?? row.createdAt) }}</td>
                    <td>
                      <n-tag size="small" :type="statusTagType(row.status)" :bordered="false">
                        {{ t(`telegramNotifications.logs.status.${row.status}`) }}
                      </n-tag>
                    </td>
                    <td>
                      <div>{{ row.accountLabel ?? '—' }}</div>
                      <n-text v-if="row.usedPercent != null" depth="3" style="font-size: 12px">
                        {{ row.quotaKind }} · {{ row.usedPercent }}%
                      </n-text>
                    </td>
                    <td>{{ row.recipients.join(', ') || '—' }}</td>
                    <td class="col-actions">
                      <n-space justify="center" :size="4" :wrap="false">
                        <n-tooltip trigger="hover">
                          <template #trigger>
                            <n-button
                              quaternary
                              circle
                              size="small"
                              :render-icon="renderIcon(ChatbubbleOutline)"
                              @click="openMessageModal(row.message)"
                            />
                          </template>
                          {{ t('telegramNotifications.logs.viewMessage') }}
                        </n-tooltip>
                        <n-tooltip trigger="hover">
                          <template #trigger>
                            <n-button
                              quaternary
                              circle
                              size="small"
                              :render-icon="renderIcon(PeopleOutline)"
                              @click="openDeliveryModal(row.deliveryResults)"
                            />
                          </template>
                          {{ t('telegramNotifications.logs.viewDelivery') }}
                        </n-tooltip>
                      </n-space>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="logsTotal > pageSize" class="pagination-inner">
                <n-pagination
                  v-model:page="logsPage"
                  :page-size="pageSize"
                  :item-count="logsTotal"
                  :show-size-picker="false"
                />
              </div>
            </n-card>
          </n-spin>
        </n-tab-pane>
      </n-tabs>
    </template>

    <n-modal
      v-model:show="showMessageModal"
      preset="card"
      :title="t('telegramNotifications.logs.messageModalTitle')"
      style="width: min(520px, 92vw)"
    >
      <pre class="message-modal-body">{{ messageModalText }}</pre>
    </n-modal>

    <n-modal
      v-model:show="showDeliveryModal"
      preset="card"
      :title="t('telegramNotifications.logs.deliveryModalTitle')"
      style="width: min(560px, 92vw)"
    >
      <n-empty
        v-if="!deliveryModalResults.length"
        :description="t('telegramNotifications.logs.noDeliveryDetails')"
      />
      <ul v-else class="delivery-list">
        <li v-for="item in deliveryModalResults" :key="item.chatId" class="delivery-list__item">
          <div class="delivery-list__head">
            <span class="delivery-list__id">{{ item.chatId }}</span>
            <n-tag size="small" :type="item.ok ? 'success' : 'error'" :bordered="false">
              {{
                item.ok
                  ? t('telegramNotifications.logs.deliveryOk')
                  : t('telegramNotifications.logs.deliveryFailed')
              }}
            </n-tag>
          </div>
          <n-text v-if="!item.ok && item.error" type="error" style="font-size: 13px">
            {{ item.error }}
          </n-text>
        </li>
      </ul>
    </n-modal>
  </n-space>
</template>

<style scoped>
.logs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.logs-table th,
.logs-table td {
  padding: 12px 16px;
  text-align: center;
  border-bottom: 1px solid var(--n-divider-color);
  vertical-align: top;
}
.logs-table thead th {
  font-weight: 600;
  background: var(--n-color-modal);
  white-space: nowrap;
}
.col-actions {
  width: 1%;
  white-space: nowrap;
}
.message-modal-body {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
}
.delivery-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.delivery-list__item {
  padding: 12px 14px;
  border: 1px solid var(--n-divider-color);
  border-radius: 8px;
}
.delivery-list__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}
.delivery-list__id {
  font-family: ui-monospace, monospace;
  font-size: 13px;
}
.logs-empty {
  padding: 32px 20px;
}
.pagination-inner {
  display: flex;
  justify-content: center;
  padding: 16px;
}
</style>
