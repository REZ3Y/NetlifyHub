<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { PulseOutline } from '@vicons/ionicons5';
import { useMessage } from 'naive-ui';
import { http } from '@/api/http';
import { useUserDateTime } from '@/composables/useUserDateTime';
import type { NetlifyLinkedSite } from '@/types/netlify-account-site';
import type { ObservabilityRange, SiteObservability } from '@/types/netlify-site-observability';

const props = defineProps<{
  show: boolean;
  linkedAccountId: string;
  site: NetlifyLinkedSite | null;
}>();

const emit = defineEmits<{
  'update:show': [value: boolean];
}>();

const { t } = useI18n();
const message = useMessage();
const { formatDateTime } = useUserDateTime();

const range = ref<ObservabilityRange>('1h');
const loading = ref(false);
const data = ref<SiteObservability | null>(null);

const rangeOptions = computed(() => [
  { label: t('netlifyAccountDetail.obsRange1h'), value: '1h' as const },
  { label: t('netlifyAccountDetail.obsRange6h'), value: '6h' as const },
  { label: t('netlifyAccountDetail.obsRange24h'), value: '24h' as const },
  { label: t('netlifyAccountDetail.obsRange7d'), value: '7d' as const },
]);

const periodText = computed(() => {
  const d = data.value;
  if (!d) return '';
  const start = formatDateTime(d.periodStart, { dateStyle: 'medium', timeStyle: 'short' });
  const end = formatDateTime(d.periodEnd, { dateStyle: 'medium', timeStyle: 'short' });
  return t('netlifyAccountDetail.obsPeriod', { label: d.periodLabel, start, end });
});

const chartMax = computed(() => {
  const series = data.value?.series ?? [];
  if (!series.length) return 1;
  return Math.max(1, ...series.map((p) => p.requests));
});

const hasChartData = computed(
  () => (data.value?.series.length ?? 0) > 0 && (data.value?.summary.totalRequests ?? 0) > 0
);

async function load() {
  if (!props.site || !props.show) return;
  loading.value = true;
  data.value = null;
  try {
    const { data: res } = await http.get<{ observability: SiteObservability }>(
      `/v1/netlify-accounts/${props.linkedAccountId}/sites/${encodeURIComponent(props.site.id)}/observability`,
      { params: { range: range.value } }
    );
    data.value = res.observability;
  } catch {
    message.error(t('netlifyAccountDetail.obsLoadError'));
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.show, props.site?.id, range.value] as const,
  ([visible]) => {
    if (visible && props.site) void load();
  }
);

function close() {
  emit('update:show', false);
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    class="obs-modal"
    style="width: min(720px, 96vw)"
    :title="site?.name ?? ''"
    :segmented="{ content: true }"
    @update:show="emit('update:show', $event)"
  >
    <template v-if="site">
      <n-space vertical :size="16">
        <n-space align="center" justify="space-between" wrap :size="12">
          <n-space align="center" :size="8">
            <n-icon :component="PulseOutline" size="20" />
            <n-text strong>{{ t('netlifyAccountDetail.obsTitle') }}</n-text>
          </n-space>
          <n-select
            v-model:value="range"
            size="small"
            style="width: 140px"
            :options="rangeOptions"
          />
        </n-space>

        <n-spin :show="loading">
          <template v-if="data">
            <n-text depth="3" style="display: block; margin-bottom: 12px">{{ periodText }}</n-text>

            <n-alert
              v-if="!data.available && data.unavailableReason"
              type="info"
              :show-icon="false"
              style="margin-bottom: 12px"
            >
              {{ data.unavailableReason }}
            </n-alert>

            <div class="obs-summary">
              <div class="obs-summary__requests">
                <n-text depth="3">{{ t('netlifyAccountDetail.obsRequests') }}</n-text>
                <n-text strong style="font-size: 1.5rem">
                  {{ data.summary.totalRequests.toLocaleString() }}
                </n-text>
              </div>
              <div class="obs-summary__errors">
                <n-text depth="3">{{ t('netlifyAccountDetail.obsErrors') }}</n-text>
                <n-space align="center" :size="6">
                  <span class="obs-summary__dot obs-summary__dot--error" />
                  <n-text strong style="font-size: 1.25rem">
                    {{ data.summary.errorRatePercent.toFixed(2) }}%
                  </n-text>
                </n-space>
              </div>
            </div>

            <div class="obs-chart">
              <div v-if="hasChartData" class="obs-chart__bars">
                <div
                  v-for="(point, idx) in data.series"
                  :key="idx"
                  class="obs-chart__col"
                  :title="`${point.requests} ${t('netlifyAccountDetail.obsRequests').toLowerCase()}`"
                >
                  <div
                    class="obs-chart__stack"
                    :style="{ height: `${Math.max(4, (point.requests / chartMax) * 100)}%` }"
                  >
                    <div
                      v-if="point.success > 0"
                      class="obs-chart__seg obs-chart__seg--ok"
                      :style="{
                        flexGrow: point.success,
                      }"
                    />
                    <div
                      v-if="point.errors > 0"
                      class="obs-chart__seg obs-chart__seg--err"
                      :style="{
                        flexGrow: point.errors,
                      }"
                    />
                  </div>
                </div>
              </div>
              <n-empty v-else size="small" :description="t('netlifyAccountDetail.obsNoData')" />
            </div>

            <div class="obs-stats">
              <n-card size="small" embedded class="obs-stats__card">
                <n-text depth="3">{{ t('netlifyAccountDetail.obsBandwidth') }}</n-text>
                <n-text strong style="display: block; margin-top: 4px">
                  {{ data.stats.bandwidthLabel }}
                </n-text>
              </n-card>
              <n-card size="small" embedded class="obs-stats__card">
                <n-text depth="3">{{ t('netlifyAccountDetail.obsFunctions') }}</n-text>
                <n-text strong style="display: block; margin-top: 4px">
                  {{ data.stats.functionsLabel }}
                </n-text>
              </n-card>
              <n-card size="small" embedded class="obs-stats__card">
                <n-text depth="3">{{ t('netlifyAccountDetail.obsNonBrowser') }}</n-text>
                <n-text strong style="display: block; margin-top: 4px">
                  {{ data.stats.nonBrowserLabel }}
                </n-text>
              </n-card>
            </div>
          </template>
        </n-spin>
      </n-space>
    </template>

    <template #footer>
      <n-button @click="close">{{ t('common.close') }}</n-button>
    </template>
  </n-modal>
</template>

<style scoped>
.obs-summary {
  display: flex;
  gap: 32px;
  margin-bottom: 16px;
}

.obs-summary__requests,
.obs-summary__errors {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.obs-summary__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.obs-summary__dot--error {
  background: #e85d5d;
}

.obs-chart {
  min-height: 160px;
  padding: 12px 8px;
  margin-bottom: 16px;
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  background: var(--n-color-modal);
}

.obs-chart__bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 140px;
  width: 100%;
}

.obs-chart__col {
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: flex-end;
}

.obs-chart__stack {
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 4px;
  border-radius: 3px 3px 0 0;
  overflow: hidden;
}

.obs-chart__seg--ok {
  background: #3d8bfd;
  width: 100%;
}

.obs-chart__seg--err {
  background: #e85d5d;
  width: 100%;
}

.obs-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 4px;
}

.obs-stats__card {
  min-width: 0;
}
</style>
