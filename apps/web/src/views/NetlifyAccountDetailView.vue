<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ArrowBackOutline } from '@vicons/ionicons5';
import { useMessage } from 'naive-ui';
import { isAxiosError } from 'axios';
import { http } from '@/api/http';
import { useUserDateTime } from '@/composables/useUserDateTime';
import type { LinkedNetlifyAccount } from '@/types/netlify-linked-account';
import type { NetlifyAccountUsage } from '@/types/netlify-account-usage';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const message = useMessage();
const { formatDateTime } = useUserDateTime();

const loading = ref(true);
const account = ref<LinkedNetlifyAccount | null>(null);
const usageLoading = ref(false);
const usage = ref<NetlifyAccountUsage | null>(null);
const usageError = ref(false);

function formatNetlifyInstant(value: string | null): string {
  if (!value) return '—';
  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) return formatDateTime(asDate);
  return value;
}

async function loadUsage(id: string, enabled: boolean) {
  usage.value = null;
  usageError.value = false;
  if (!enabled) return;
  usageLoading.value = true;
  try {
    const { data } = await http.get<{ usage: NetlifyAccountUsage }>(
      `/v1/netlify-accounts/${id}/usage`
    );
    usage.value = data.usage;
  } catch {
    usageError.value = true;
    message.error(t('netlifyAccountDetail.usageLoadError'));
  } finally {
    usageLoading.value = false;
  }
}

async function load(id: string) {
  loading.value = true;
  account.value = null;
  usage.value = null;
  usageError.value = false;
  try {
    const { data } = await http.get<{ account: LinkedNetlifyAccount }>(
      `/v1/netlify-accounts/${id}`
    );
    account.value = data.account;
    void loadUsage(id, data.account.enabled);
  } catch (e) {
    if (isAxiosError(e) && e.response?.status === 404) {
      message.warning(t('netlifyAccountDetail.notFound'));
      void router.replace({ name: 'netlifyAccountsList' });
      return;
    }
    message.error(t('netlifyAccountDetail.loadError'));
    void router.replace({ name: 'netlifyAccountsList' });
  } finally {
    loading.value = false;
  }
}

const idParam = computed(() => String(route.params.id ?? ''));

onMounted(() => {
  if (idParam.value) void load(idParam.value);
});

watch(idParam, (id) => {
  if (id) void load(id);
});

type SummaryRow = { key: string; label: string; value: string; breakAll?: boolean };

const summaryRows = computed<SummaryRow[]>(() => {
  const a = account.value;
  if (!a) return [];
  return [
    { key: 'panelTitle', label: t('netlifyAccounts.fields.panelTitle'), value: a.label ?? '—' },
    {
      key: 'enabled',
      label: t('netlifyAccountDetail.fieldEnabled'),
      value: a.enabled ? t('netlifyAccountDetail.statusOn') : t('netlifyAccountDetail.statusOff'),
    },
    { key: 'netlifyId', label: t('netlifyAccounts.fields.netlifyId'), value: a.netlifyId },
    { key: 'uid', label: t('netlifyAccounts.fields.uid'), value: a.uid },
    { key: 'fullName', label: t('netlifyAccounts.fields.fullName'), value: a.fullName ?? '—' },
    { key: 'email', label: t('netlifyAccounts.fields.email'), value: a.email ?? '—' },
    {
      key: 'avatarUrl',
      label: t('netlifyAccounts.fields.avatarUrl'),
      value: a.avatarUrl ?? '—',
      breakAll: !!a.avatarUrl,
    },
    {
      key: 'affiliateId',
      label: t('netlifyAccounts.fields.affiliateId'),
      value: a.affiliateId ?? '—',
    },
    { key: 'siteCount', label: t('netlifyAccounts.fields.siteCount'), value: String(a.siteCount) },
    {
      key: 'createdAt',
      label: t('netlifyAccounts.fields.createdAt'),
      value: formatNetlifyInstant(a.netlifyCreatedAt),
    },
    {
      key: 'lastLogin',
      label: t('netlifyAccounts.fields.lastLogin'),
      value: formatNetlifyInstant(a.netlifyLastLogin),
    },
    {
      key: 'linkedAt',
      label: t('netlifyAccounts.fields.linkedAt'),
      value: formatDateTime(a.createdAt),
    },
    {
      key: 'updatedAt',
      label: t('netlifyAccountDetail.fieldUpdatedAt'),
      value: formatDateTime(a.updatedAt),
    },
  ];
});

function goList() {
  void router.push({ name: 'netlifyAccountsList' });
}

function goEdit() {
  if (!account.value) return;
  void router.push({ name: 'netlifyAccountEdit', params: { id: account.value.id } });
}

const billingPeriodText = computed(() => {
  const period = usage.value?.billingPeriod;
  if (!period) return null;
  const start = formatDateTime(period.start, { dateStyle: 'medium', timeStyle: undefined });
  const end = formatDateTime(period.end, { dateStyle: 'medium', timeStyle: undefined });
  return t('netlifyAccountDetail.usageBillingPeriod', { start, end });
});

const otherTeamsHint = computed(() => {
  const teams = usage.value?.otherTeams ?? [];
  if (!teams.length) return null;
  const names = teams.map((x) => x.name).join(', ');
  return t('netlifyAccountDetail.usageOtherTeams', { teams: names });
});
</script>

<template>
  <n-space vertical size="large" style="max-width: 920px">
    <div>
      <n-button quaternary size="small" @click="goList">
        <template #icon>
          <n-icon :component="ArrowBackOutline" />
        </template>
        {{ t('netlifyAccountDetail.backToList') }}
      </n-button>
    </div>

    <n-spin :show="loading">
      <template v-if="account">
        <div class="head-actions">
          <div>
            <n-h2 style="margin-bottom: 4px">{{ t('netlifyAccountDetail.title') }}</n-h2>
            <n-p depth="3" style="margin: 0">{{ t('netlifyAccountDetail.subtitle') }}</n-p>
          </div>
          <n-button type="primary" @click="goEdit">{{ t('netlifyAccountDetail.edit') }}</n-button>
        </div>

        <n-card v-if="!account.enabled" :title="t('netlifyAccountDetail.usageTitle')">
          <n-text depth="3">{{ t('netlifyAccountDetail.usageDisabled') }}</n-text>
        </n-card>

        <n-card v-else :title="t('netlifyAccountDetail.usageTitle')">
          <n-spin :show="usageLoading">
            <template v-if="usage">
              <n-space vertical size="small" style="margin-bottom: 16px">
                <n-space align="center" wrap :size="8">
                  <n-text strong>{{ usage.teamName }}</n-text>
                  <n-tag v-if="usage.planName" type="success" size="small" round>
                    {{ usage.planName }}
                  </n-tag>
                </n-space>
                <n-text depth="3" style="margin: 0">
                  {{ t('netlifyAccountDetail.usageSubtitle', { team: usage.teamSlug }) }}
                </n-text>
                <n-text v-if="billingPeriodText" depth="3">{{ billingPeriodText }}</n-text>
                <n-text v-if="otherTeamsHint" depth="3">{{ otherTeamsHint }}</n-text>
              </n-space>

              <n-grid cols="1 s:2 m:4" :x-gap="12" :y-gap="12">
                <n-gi v-if="usage.bandwidth">
                  <n-card size="small" embedded>
                    <n-statistic :label="t('netlifyAccountDetail.usageBandwidth')">
                      <template #default>
                        {{ usage.bandwidth.usedLabel }} / {{ usage.bandwidth.includedLabel }}
                      </template>
                    </n-statistic>
                  </n-card>
                </n-gi>
                <n-gi>
                  <n-card size="small" embedded>
                    <n-statistic :label="t('netlifyAccountDetail.usageBuildMinutes')">
                      <template #default>
                        {{ usage.buildMinutes.usedLabel }} /
                        {{ usage.buildMinutes.includedLabel }}
                      </template>
                    </n-statistic>
                  </n-card>
                </n-gi>
                <n-gi>
                  <n-card size="small" embedded>
                    <n-statistic :label="t('netlifyAccountDetail.usageConcurrentBuilds')">
                      <template #default>{{ usage.concurrentBuilds.label }}</template>
                    </n-statistic>
                  </n-card>
                </n-gi>
                <n-gi>
                  <n-card size="small" embedded>
                    <n-statistic :label="t('netlifyAccountDetail.usageTeamMembers')">
                      <template #default>{{ usage.teamMembers.label }}</template>
                    </n-statistic>
                  </n-card>
                </n-gi>
              </n-grid>
            </template>
            <n-text v-else-if="usageError" depth="3">
              {{ t('netlifyAccountDetail.usageLoadError') }}
            </n-text>
          </n-spin>
        </n-card>

        <n-card :segmented="{ content: true }">
          <n-table bordered :single-line="false" size="small" class="detail-table">
            <thead>
              <tr>
                <th scope="col" class="detail-table__th-label">
                  {{ t('netlifyAccounts.summaryColumnLabel') }}
                </th>
                <th scope="col">{{ t('netlifyAccounts.summaryColumnValue') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in summaryRows" :key="row.key">
                <td class="detail-table__td-label">{{ row.label }}</td>
                <td>
                  <n-text v-if="row.breakAll" style="word-break: break-all">{{ row.value }}</n-text>
                  <template v-else>{{ row.value }}</template>
                </td>
              </tr>
            </tbody>
          </n-table>
        </n-card>
      </template>
    </n-spin>
  </n-space>
</template>

<style scoped>
.head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.detail-table {
  width: 100%;
  table-layout: fixed;
}
.detail-table__th-label,
.detail-table__td-label {
  width: 38%;
  vertical-align: top;
  white-space: normal;
}
</style>
