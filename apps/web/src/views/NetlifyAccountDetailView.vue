<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ArrowBackOutline, RefreshOutline } from '@vicons/ionicons5';
import { useMessage } from 'naive-ui';
import { isAxiosError } from 'axios';
import { http } from '@/api/http';
import { useUserDateTime } from '@/composables/useUserDateTime';
import type { LinkedNetlifyAccount } from '@/types/netlify-linked-account';
import type { NetlifyAccountUsage } from '@/types/netlify-account-usage';
import type { NetlifyLinkedSite } from '@/types/netlify-account-site';
import NetlifyAccountSitesList from '@/components/NetlifyAccountSitesList.vue';

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
const sitesLoading = ref(false);
const sites = ref<NetlifyLinkedSite[]>([]);
const sitesTeamName = ref('');
const sitesError = ref(false);

function formatNetlifyInstant(value: string | null): string {
  if (!value) return '—';
  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) return formatDateTime(asDate);
  return value;
}

async function loadSites(id: string, enabled: boolean, options?: { refresh?: boolean }) {
  if (options?.refresh) {
    sites.value = [];
    sitesTeamName.value = '';
  }
  sitesError.value = false;
  if (!enabled) return;
  sitesLoading.value = true;
  try {
    const { data } = await http.get<{ teamName: string; sites: NetlifyLinkedSite[] }>(
      `/v1/netlify-accounts/${id}/sites`,
      { params: options?.refresh ? { refresh: 'true' } : undefined }
    );
    sites.value = data.sites;
    sitesTeamName.value = data.teamName;
  } catch {
    sitesError.value = true;
    message.error(t('netlifyAccountDetail.sitesLoadError'));
  } finally {
    sitesLoading.value = false;
  }
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
  sites.value = [];
  sitesTeamName.value = '';
  sitesError.value = false;
  try {
    const { data } = await http.get<{ account: LinkedNetlifyAccount }>(
      `/v1/netlify-accounts/${id}`
    );
    account.value = data.account;
    void loadUsage(id, data.account.enabled);
    void loadSites(id, data.account.enabled);
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
    /*{
      key: 'avatarUrl',
      label: t('netlifyAccounts.fields.avatarUrl'),
      value: a.avatarUrl ?? '—',
      breakAll: !!a.avatarUrl,
    },*/
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

function refreshSites() {
  if (!account.value?.enabled) return;
  void loadSites(account.value.id, true, { refresh: true });
}

const billingPeriodText = computed(() => {
  const period = usage.value?.billingPeriod;
  if (!period) return null;
  const start = formatDateTime(period.start, { dateStyle: 'medium', timeStyle: undefined });
  const end = formatDateTime(period.end, { dateStyle: 'medium', timeStyle: undefined });
  return t('netlifyAccountDetail.usageBillingPeriod', { start, end });
});
</script>

<template>
  <div class="account-detail-page">
    <div class="account-detail-page__nav">
      <n-button quaternary size="small" @click="goList">
        <template #icon>
          <n-icon :component="ArrowBackOutline" />
        </template>
        {{ t('netlifyAccountDetail.backToList') }}
      </n-button>
    </div>

    <n-spin :show="loading">
      <template v-if="account">
        <div class="account-detail-page__stack">
          <section class="account-detail-page__section account-detail-page__usage">
            <n-card class="usage-card" :segmented="{ content: true }">
              <template #header>
                <div class="usage-card__header">
                  <div class="usage-card__header-main">
                    <n-space align="center" :size="8" :wrap="false">
                      <n-text strong class="usage-card__title">
                        {{ t('netlifyAccountDetail.usageTitle') }}
                      </n-text>
                      <n-tag v-if="usage?.planName" type="success" size="small" round>
                        {{ usage.planName }}
                      </n-tag>
                    </n-space>
                    <n-text v-if="usage" depth="3" class="usage-card__subtitle">
                      {{ t('netlifyAccountDetail.usageSubtitle', { team: usage.teamSlug }) }}
                    </n-text>
                  </div>
                  <n-text v-if="billingPeriodText" depth="3" class="usage-card__period">
                    {{ billingPeriodText }}
                  </n-text>
                </div>
              </template>

              <template v-if="!account.enabled">
                <n-text depth="3">{{ t('netlifyAccountDetail.usageDisabled') }}</n-text>
              </template>
              <template v-else>
                <n-spin :show="usageLoading">
                  <template v-if="usage">
                    <div class="usage-metrics">
                      <n-card size="small" embedded class="usage-metrics__item">
                        <n-statistic :label="t('netlifyAccountDetail.usageBandwidth')">
                          <template #default>
                            <template v-if="usage.bandwidth">
                              {{ usage.bandwidth.usedLabel }} / {{ usage.bandwidth.includedLabel }}
                            </template>
                            <template v-else>—</template>
                          </template>
                        </n-statistic>
                      </n-card>
                      <n-card size="small" embedded class="usage-metrics__item">
                        <n-statistic :label="t('netlifyAccountDetail.usageBuildMinutes')">
                          <template #default>
                            {{ usage.buildMinutes.usedLabel }} /
                            {{ usage.buildMinutes.includedLabel }}
                          </template>
                        </n-statistic>
                      </n-card>
                      <n-card size="small" embedded class="usage-metrics__item">
                        <n-statistic :label="t('netlifyAccountDetail.usageConcurrentBuilds')">
                          <template #default>{{ usage.concurrentBuilds.label }}</template>
                        </n-statistic>
                      </n-card>
                      <n-card size="small" embedded class="usage-metrics__item">
                        <n-statistic :label="t('netlifyAccountDetail.usageTeamMembers')">
                          <template #default>{{ usage.teamMembers.label }}</template>
                        </n-statistic>
                      </n-card>
                    </div>
                  </template>
                  <n-text v-else-if="usageError" depth="3">
                    {{ t('netlifyAccountDetail.usageLoadError') }}
                  </n-text>
                </n-spin>
              </template>
            </n-card>
          </section>

          <div class="account-detail-page__columns">
            <section class="account-detail-page__section account-detail-page__details">
              <n-card class="details-card" :segmented="{ content: true }">
                <template #header>
                  <div class="details-card__header">
                    <div class="details-card__header-text">
                      <n-h2 style="margin: 0 0 4px">{{ t('netlifyAccountDetail.title') }}</n-h2>
                      <n-p depth="3" style="margin: 0">{{
                        t('netlifyAccountDetail.subtitle')
                      }}</n-p>
                    </div>
                    <n-button type="primary" @click="goEdit">
                      {{ t('netlifyAccountDetail.edit') }}
                    </n-button>
                  </div>
                </template>

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
                        <n-text v-if="row.breakAll" style="word-break: break-all">{{
                          row.value
                        }}</n-text>
                        <template v-else>{{ row.value }}</template>
                      </td>
                    </tr>
                  </tbody>
                </n-table>
              </n-card>
            </section>

            <section class="account-detail-page__section account-detail-page__sites">
              <template v-if="!account.enabled">
                <n-card class="sites-card" :title="t('netlifyAccountDetail.sitesTitle')">
                  <n-text depth="3">{{ t('netlifyAccountDetail.sitesDisabled') }}</n-text>
                </n-card>
              </template>
              <template v-else-if="sitesError">
                <n-card class="sites-card" :segmented="{ content: true }">
                  <template #header>
                    <div class="sites-card__header sites-card__header--error">
                      <n-h2 style="margin: 0">{{ t('netlifyAccountDetail.sitesTitle') }}</n-h2>
                      <n-button
                        quaternary
                        circle
                        size="small"
                        :loading="sitesLoading"
                        :title="t('netlifyAccountDetail.sitesRefresh')"
                        @click="refreshSites"
                      >
                        <template #icon>
                          <n-icon :component="RefreshOutline" />
                        </template>
                      </n-button>
                    </div>
                  </template>
                  <n-text depth="3">{{ t('netlifyAccountDetail.sitesLoadError') }}</n-text>
                </n-card>
              </template>
              <NetlifyAccountSitesList
                v-else
                :linked-account-id="account.id"
                :sites="sites"
                :team-name="sitesTeamName"
                :loading="sitesLoading"
                @refresh="refreshSites"
              />
            </section>
          </div>
        </div>
      </template>
    </n-spin>
  </div>
</template>

<style scoped>
.account-detail-page {
  width: 100%;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.account-detail-page__stack {
  display: flex;
  flex-direction: column;
  gap: 32px;
  width: 100%;
}

.account-detail-page__columns {
  display: grid;
  grid-template-columns: minmax(300px, 400px) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
  width: 100%;
}

.account-detail-page__section {
  width: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.usage-card {
  width: 100%;
}

.usage-card :deep(.n-card-header) {
  padding-bottom: 12px;
}

.usage-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}

.usage-card__header-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.usage-card__title {
  font-size: 1.125rem;
}

.usage-card__subtitle {
  margin: 0;
}

.usage-card__period {
  flex-shrink: 0;
  text-align: end;
  max-width: 50%;
}

.usage-metrics {
  display: flex;
  flex-flow: row nowrap;
  align-items: stretch;
  gap: 16px;
  width: 100%;
}

.usage-metrics__item {
  flex: 1 1 0;
  min-width: 0;
}

.usage-metrics__item :deep(.n-statistic-value) {
  font-size: 1.125rem;
  line-height: 1.35;
  word-break: break-word;
}

.account-detail-page__details {
  max-width: none;
}

@media (max-width: 960px) {
  .account-detail-page__columns {
    grid-template-columns: 1fr;
  }
}

.details-card {
  width: 100%;
}

.details-card :deep(.n-card-header) {
  padding-bottom: 12px;
}

.details-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}

.details-card__header-text {
  min-width: 0;
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

.sites-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}
</style>
