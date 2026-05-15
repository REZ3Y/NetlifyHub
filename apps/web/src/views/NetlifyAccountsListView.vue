<script setup lang="ts">
import { h, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  CreateOutline,
  EyeOutline,
  PauseCircleOutline,
  PlayCircleOutline,
  TrashOutline,
} from '@vicons/ionicons5';
import { NButton, NIcon, NSpace, NTooltip, useMessage } from 'naive-ui';
import { isAxiosError } from 'axios';
import { http } from '@/api/http';
import { useUserDateTime } from '@/composables/useUserDateTime';
import type { LinkedNetlifyAccount } from '@/types/netlify-linked-account';
import type { NetlifyAccountUsageSummary } from '@/types/netlify-account-usage-summary';
import NetlifyPlanOutlineBadge from '@/components/NetlifyPlanOutlineBadge.vue';
import NetlifyQuotaUsageMeter from '@/components/NetlifyQuotaUsageMeter.vue';

const { t } = useI18n();
const router = useRouter();
const message = useMessage();
const { formatDateTime } = useUserDateTime();

const PAGE_SIZE = 50;

const loading = ref(true);
const page = ref(1);
const pageSize = ref(PAGE_SIZE);
const total = ref(0);
const accounts = ref<LinkedNetlifyAccount[]>([]);
const usageSummaries = ref<Record<string, NetlifyAccountUsageSummary | null>>({});
const summariesLoading = ref(false);
const togglingId = ref<string | null>(null);
const deletingId = ref<string | null>(null);

const showDeleteModal = ref(false);
const accountPendingDelete = ref<LinkedNetlifyAccount | null>(null);

function formatNetlifyInstant(value: string | null): string {
  if (!value) return '—';
  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) return formatDateTime(asDate);
  return value;
}

async function loadUsageSummaries(ids: string[]) {
  const enabledIds = ids.filter((id) => accounts.value.find((a) => a.id === id && a.enabled));
  if (!enabledIds.length) return;
  summariesLoading.value = true;
  try {
    const { data } = await http.post<{
      summaries: Record<string, NetlifyAccountUsageSummary | null>;
    }>('/v1/netlify-accounts/usage-summaries', { accountIds: enabledIds });
    usageSummaries.value = { ...usageSummaries.value, ...data.summaries };
  } catch {
    /* keep table cells as — */
  } finally {
    summariesLoading.value = false;
  }
}

function usageSummary(row: LinkedNetlifyAccount): NetlifyAccountUsageSummary | null {
  if (!row.enabled) return null;
  return usageSummaries.value[row.id] ?? null;
}

async function load() {
  loading.value = true;
  try {
    const { data } = await http.get<{
      accounts: LinkedNetlifyAccount[];
      total: number;
      page: number;
      pageSize: number;
    }>('/v1/netlify-accounts', {
      params: { page: page.value, pageSize: pageSize.value },
    });
    accounts.value = data.accounts;
    total.value = data.total;
    usageSummaries.value = {};
    void loadUsageSummaries(data.accounts.map((a) => a.id));
  } catch {
    message.error(t('netlifyAccountsList.loadError'));
    accounts.value = [];
    total.value = 0;
    usageSummaries.value = {};
  } finally {
    loading.value = false;
  }
}

onMounted(() => void load());

function onPageChange(p: number) {
  page.value = p;
  void load();
}

function goRegister() {
  void router.push({ name: 'registerNetlifyAccount' });
}

function goDetail(id: string) {
  void router.push({ name: 'netlifyAccountDetail', params: { id } });
}

function goEdit(id: string) {
  void router.push({ name: 'netlifyAccountEdit', params: { id } });
}

function openDeleteModal(row: LinkedNetlifyAccount) {
  accountPendingDelete.value = row;
  showDeleteModal.value = true;
}

function closeDeleteModal() {
  showDeleteModal.value = false;
  accountPendingDelete.value = null;
}

async function confirmDelete() {
  const row = accountPendingDelete.value;
  if (!row) return;
  deletingId.value = row.id;
  try {
    await http.delete(`/v1/netlify-accounts/${row.id}`);
    message.success(t('netlifyAccountsList.deleteSuccess'));
    closeDeleteModal();
    await load();
    if (accounts.value.length === 0 && page.value > 1) {
      page.value -= 1;
      await load();
    }
  } catch (e) {
    if (isAxiosError(e)) {
      const msg =
        typeof e.response?.data === 'object' &&
        e.response?.data !== null &&
        'message' in e.response.data &&
        typeof (e.response.data as { message: unknown }).message === 'string'
          ? (e.response.data as { message: string }).message
          : t('netlifyAccountsList.deleteError');
      message.error(msg);
      return;
    }
    message.error(t('netlifyAccountsList.deleteError'));
  } finally {
    deletingId.value = null;
  }
}

async function toggleEnabled(row: LinkedNetlifyAccount) {
  const next = !row.enabled;
  togglingId.value = row.id;
  try {
    const { data } = await http.patch<{ account: LinkedNetlifyAccount }>(
      `/v1/netlify-accounts/${row.id}/enabled`,
      { enabled: next }
    );
    const i = accounts.value.findIndex((a) => a.id === row.id);
    if (i !== -1) accounts.value[i] = data.account;
    if (next) {
      void loadUsageSummaries([row.id]);
    } else {
      const nextSummaries = { ...usageSummaries.value };
      delete nextSummaries[row.id];
      usageSummaries.value = nextSummaries;
    }
    message.success(
      next ? t('netlifyAccountsList.enabledToast') : t('netlifyAccountsList.disabledToast')
    );
  } catch {
    message.error(t('netlifyAccountsList.toggleError'));
  } finally {
    togglingId.value = null;
  }
}

function renderIcon(icon: typeof EyeOutline) {
  return () => h(NIcon, { size: 18, component: icon });
}
</script>

<template>
  <n-space vertical size="large">
    <div class="page-head">
      <div>
        <n-h2 style="margin-bottom: 4px">{{ t('netlifyAccountsList.title') }}</n-h2>
        <n-p depth="3" style="margin: 0">{{ t('netlifyAccountsList.subtitle') }}</n-p>
      </div>
      <n-button type="primary" @click="goRegister">
        {{ t('netlifyAccountsList.registerCta') }}
      </n-button>
    </div>

    <n-spin :show="loading">
      <n-space vertical size="medium" style="width: 100%">
        <n-card :segmented="{ content: true }" content-style="padding: 0">
          <div class="table-wrap">
            <table class="accounts-table">
              <thead>
                <tr>
                  <th scope="col" class="col-idx">{{ t('netlifyAccountsList.colRow') }}</th>
                  <th scope="col">{{ t('netlifyAccountsList.colTitle') }}</th>
                  <th scope="col">{{ t('netlifyAccountsList.colEmail') }}</th>
                  <th scope="col">{{ t('netlifyAccountsList.colPlan') }}</th>
                  <th scope="col">{{ t('netlifyAccountsList.colQuota') }}</th>
                  <th scope="col">{{ t('netlifyAccountsList.colNetlifyCreated') }}</th>
                  <th scope="col">{{ t('netlifyAccountsList.colLastLogin') }}</th>
                  <th scope="col" class="col-actions">{{ t('netlifyAccountsList.colActions') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!loading && total === 0" class="empty-row">
                  <td colspan="8">
                    <div class="empty-inner">
                      <n-alert type="info" :show-icon="true" class="empty-alert">
                        {{ t('netlifyAccountsList.emptyHint') }}
                      </n-alert>
                      <n-button type="primary" @click="goRegister">
                        {{ t('netlifyAccountsList.emptyCta') }}
                      </n-button>
                    </div>
                  </td>
                </tr>
                <tr v-for="(row, index) in accounts" :key="row.id">
                  <td class="col-idx tabular-nums">
                    {{ (page - 1) * pageSize + index + 1 }}
                  </td>
                  <td>{{ row.label?.trim() ? row.label : '—' }}</td>
                  <td>{{ row.email ?? '—' }}</td>
                  <td>
                    <NetlifyPlanOutlineBadge
                      v-if="usageSummary(row)?.planName"
                      :plan-name="usageSummary(row)!.planName!"
                    />
                    <template v-else-if="row.enabled && summariesLoading">…</template>
                    <template v-else>—</template>
                  </td>
                  <td class="col-quota">
                    <NetlifyQuotaUsageMeter
                      v-if="
                        usageSummary(row)?.quotaLabel &&
                        usageSummary(row)!.used != null &&
                        usageSummary(row)!.included != null
                      "
                      :label="usageSummary(row)!.quotaLabel!"
                      :used="usageSummary(row)!.used!"
                      :included="usageSummary(row)!.included!"
                    />
                    <template v-else-if="row.enabled && summariesLoading">…</template>
                    <template v-else>—</template>
                  </td>
                  <td class="tabular-nums">{{ formatNetlifyInstant(row.netlifyCreatedAt) }}</td>
                  <td class="tabular-nums">{{ formatNetlifyInstant(row.netlifyLastLogin) }}</td>
                  <td class="col-actions">
                    <n-space :size="4" justify="center" :wrap="false">
                      <n-tooltip trigger="hover">
                        <template #trigger>
                          <n-button
                            quaternary
                            circle
                            size="small"
                            type="info"
                            :render-icon="renderIcon(EyeOutline)"
                            :focusable="false"
                            @click="goDetail(row.id)"
                          />
                        </template>
                        {{ t('netlifyAccountsList.actionView') }}
                      </n-tooltip>
                      <n-tooltip trigger="hover">
                        <template #trigger>
                          <n-button
                            quaternary
                            circle
                            size="small"
                            type="primary"
                            :render-icon="renderIcon(CreateOutline)"
                            :focusable="false"
                            @click="goEdit(row.id)"
                          />
                        </template>
                        {{ t('netlifyAccountsList.actionEdit') }}
                      </n-tooltip>
                      <n-tooltip trigger="hover">
                        <template #trigger>
                          <n-button
                            quaternary
                            circle
                            size="small"
                            type="error"
                            :render-icon="renderIcon(TrashOutline)"
                            :focusable="false"
                            :disabled="deletingId === row.id"
                            @click="openDeleteModal(row)"
                          />
                        </template>
                        {{ t('netlifyAccountsList.actionDelete') }}
                      </n-tooltip>
                      <n-tooltip trigger="hover">
                        <template #trigger>
                          <n-button
                            quaternary
                            circle
                            size="small"
                            :type="row.enabled ? 'success' : 'warning'"
                            :loading="togglingId === row.id"
                            :render-icon="
                              row.enabled
                                ? renderIcon(PauseCircleOutline)
                                : renderIcon(PlayCircleOutline)
                            "
                            :focusable="false"
                            @click="toggleEnabled(row)"
                          />
                        </template>
                        {{
                          row.enabled
                            ? t('netlifyAccountsList.actionDisable')
                            : t('netlifyAccountsList.actionEnable')
                        }}
                      </n-tooltip>
                    </n-space>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </n-card>

        <n-card
          v-if="total > pageSize"
          size="small"
          :bordered="true"
          class="pagination-box"
          content-style="padding: 12px 16px"
        >
          <div class="pagination-inner">
            <n-pagination
              :page="page"
              :page-size="pageSize"
              :item-count="total"
              :page-slot="7"
              :disabled="loading"
              @update:page="onPageChange"
            />
          </div>
        </n-card>
      </n-space>
    </n-spin>
  </n-space>

  <n-modal
    v-model:show="showDeleteModal"
    preset="card"
    :title="t('netlifyAccountsList.deleteModalTitle')"
    :style="{ width: 'min(440px, 92vw)' }"
    :mask-closable="false"
    @after-leave="accountPendingDelete = null"
  >
    <n-space vertical size="large">
      <n-alert
        type="warning"
        :show-icon="true"
        class="delete-confirm-alert"
        :title="t('netlifyAccountsList.deleteConfirmTitle')"
      >
        <div class="delete-confirm-alert__body">
          {{ t('netlifyAccountsList.deleteConfirmBody') }}
          <template v-if="accountPendingDelete">
            <n-text strong tag="div" style="margin-top: 10px">
              {{ accountPendingDelete.label?.trim() || accountPendingDelete.email || '—' }}
            </n-text>
          </template>
        </div>
      </n-alert>
      <n-space justify="end">
        <n-button @click="closeDeleteModal">{{ t('netlifyAccountsList.deleteCancel') }}</n-button>
        <n-button type="error" :loading="!!deletingId" @click="confirmDelete">
          {{ t('netlifyAccountsList.deleteConfirm') }}
        </n-button>
      </n-space>
    </n-space>
  </n-modal>
</template>

<style scoped>
.page-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.table-wrap {
  overflow-x: auto;
}
.accounts-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.accounts-table th,
.accounts-table td {
  padding: 12px 16px;
  text-align: center;
  border-bottom: 1px solid var(--n-divider-color);
  vertical-align: middle;
}
.accounts-table thead th {
  font-weight: 600;
  background: var(--n-color-modal);
  white-space: nowrap;
}
.col-idx {
  width: 52px;
}
.col-quota {
  min-width: 140px;
}
.col-quota :deep(.quota-meter) {
  margin-inline: auto;
}
.col-plan :deep(.n-tag) {
  justify-content: center;
}

.col-actions {
  width: 1%;
  white-space: nowrap;
}
.empty-row td {
  border-bottom: none;
  padding: 28px 20px 32px;
}
.empty-inner {
  max-width: 480px;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
}
.empty-alert {
  text-align: start;
}
.delete-confirm-alert__body {
  line-height: 1.55;
}
.pagination-box {
  width: 100%;
}
.pagination-inner {
  display: flex;
  justify-content: center;
  width: 100%;
}
</style>
