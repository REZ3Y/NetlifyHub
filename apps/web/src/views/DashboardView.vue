<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import { http } from '@/api/http';
import type { DashboardStats } from '@/types/dashboard';

const { t } = useI18n();
const message = useMessage();

const loading = ref(true);
const stats = ref<DashboardStats | null>(null);

function statusTagType(on: boolean): 'success' | 'default' {
  return on ? 'success' : 'default';
}

const statusItems = computed(() => {
  if (!stats.value) return [];
  return [
    {
      key: 'telegram',
      label: t('dashboard.telegramAlerts'),
      on: stats.value.telegramAlertsEnabled,
    },
    {
      key: 'proxy',
      label: t('dashboard.outboundProxy'),
      on: stats.value.proxyEnabled,
    },
  ];
});

async function load() {
  loading.value = true;
  try {
    const { data } = await http.get<{ stats: DashboardStats }>('/v1/dashboard/stats');
    stats.value = data.stats;
  } catch {
    message.error(t('dashboard.loadError'));
    stats.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <n-space vertical size="large">
    <div>
      <n-h2>{{ t('dashboard.title') }}</n-h2>
      <n-p depth="3">{{ t('dashboard.subtitle') }}</n-p>
    </div>

    <n-spin :show="loading">
      <n-grid class="dashboard-grid" cols="1 s:2 m:4" responsive="screen" :x-gap="16" :y-gap="16">
        <n-gi>
          <n-card
            class="dashboard-card"
            :title="t('dashboard.linkedAccounts')"
            size="small"
            embedded
          >
            <div class="dashboard-card__body">
              <n-statistic tabular-nums :value="stats?.linkedAccountsCount ?? 0" />
              <div v-if="stats" class="account-breakdown">
                <n-text depth="3" class="breakdown-line">
                  {{ t('dashboard.accountsActive') }}:
                  <span class="breakdown-value">{{ stats.linkedAccountsEnabledCount }}</span>
                </n-text>
                <n-text depth="3" class="breakdown-line">
                  {{ t('dashboard.accountsDisabled') }}:
                  <span class="breakdown-value">{{ stats.linkedAccountsDisabledCount }}</span>
                </n-text>
              </div>
            </div>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card class="dashboard-card" :title="t('dashboard.sites')" size="small" embedded>
            <div class="dashboard-card__body">
              <n-statistic tabular-nums :value="stats?.sitesCount ?? 0" />
              <n-text depth="3" class="hint">{{ t('dashboard.sitesHint') }}</n-text>
            </div>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card class="dashboard-card" :title="t('dashboard.timezone')" size="small" embedded>
            <div class="dashboard-card__body">
              <n-text class="timezone">{{ stats?.timezone ?? '—' }}</n-text>
            </div>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card class="dashboard-card" :title="t('dashboard.statusTitle')" size="small" embedded>
            <div class="dashboard-card__body">
              <n-space v-if="stats" vertical :size="10" class="status-list">
                <div v-for="item in statusItems" :key="item.key" class="status-row">
                  <n-text depth="2">{{ item.label }}</n-text>
                  <n-tag round :type="statusTagType(item.on)" size="small">
                    {{ item.on ? t('dashboard.statusOn') : t('dashboard.statusOff') }}
                  </n-tag>
                </div>
              </n-space>
              <n-text v-else depth="3">—</n-text>
            </div>
          </n-card>
        </n-gi>
      </n-grid>
    </n-spin>
  </n-space>
</template>

<style scoped>
.dashboard-grid :deep(.n-grid-item) {
  display: flex;
}

.dashboard-card {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.dashboard-card :deep(.n-card__content) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.dashboard-card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 5.5rem;
}

.account-breakdown {
  margin-top: auto;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.breakdown-line {
  font-size: 12px;
  line-height: 1.4;
}

.breakdown-value {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.hint {
  display: block;
  margin-top: auto;
  padding-top: 8px;
  font-size: 12px;
  line-height: 1.4;
}

.timezone {
  font-size: 1.125rem;
  font-weight: 500;
  word-break: break-word;
}

.status-list {
  width: 100%;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
