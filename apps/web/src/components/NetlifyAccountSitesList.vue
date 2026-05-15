<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronForwardOutline, CopyOutline, OpenOutline } from '@vicons/ionicons5';
import { useMessage } from 'naive-ui';
import { useClipboard } from '@vueuse/core';
import { useUserDateTime } from '@/composables/useUserDateTime';
import type { NetlifyLinkedSite } from '@/types/netlify-account-site';
import NetlifyAccountSiteObservabilityModal from '@/components/NetlifyAccountSiteObservabilityModal.vue';

const PLACEHOLDER_THUMB = '/site-thumb-404.svg';

const props = defineProps<{
  linkedAccountId: string;
  sites: NetlifyLinkedSite[];
  teamName: string;
  loading?: boolean;
}>();

const { t, locale } = useI18n();
const message = useMessage();
const { formatDateTime } = useUserDateTime();
const { copy: copyToClipboard } = useClipboard();

const brokenThumbs = ref<Set<string>>(new Set());
const observabilityOpen = ref(false);
const selectedSite = ref<NetlifyLinkedSite | null>(null);

function thumbSrc(site: NetlifyLinkedSite): string {
  if (!site.hasThumbnail || brokenThumbs.value.has(site.id)) return PLACEHOLDER_THUMB;
  return `/v1/netlify-accounts/${props.linkedAccountId}/sites/${encodeURIComponent(site.id)}/thumbnail`;
}

function onThumbError(siteId: string) {
  brokenThumbs.value = new Set(brokenThumbs.value).add(siteId);
}

function formatPublished(site: NetlifyLinkedSite): string | null {
  if (!site.publishedAt) return null;
  const d = new Date(site.publishedAt);
  if (Number.isNaN(d.getTime())) return null;
  const at = formatDateTime(d, { dateStyle: 'medium', timeStyle: 'short' });
  const rtf = new Intl.RelativeTimeFormat(locale.value === 'fa' ? 'fa-IR' : 'en-US', {
    numeric: 'auto',
  });
  const diffMs = d.getTime() - Date.now();
  const absMin = Math.abs(Math.round(diffMs / 60_000));
  let relative: string;
  if (absMin < 60) relative = rtf.format(Math.round(diffMs / 60_000), 'minute');
  else if (absMin < 60 * 24) relative = rtf.format(Math.round(diffMs / 3_600_000), 'hour');
  else if (absMin < 60 * 24 * 30) relative = rtf.format(Math.round(diffMs / 86_400_000), 'day');
  else relative = rtf.format(Math.round(diffMs / (86_400_000 * 30)), 'month');
  return t('netlifyAccountDetail.sitesPublishedAt', { at, relative });
}

const sortedSites = computed(() =>
  [...props.sites].sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    if (tb !== ta) return tb - ta;
    return a.name.localeCompare(b.name);
  })
);

async function copyDomain(site: NetlifyLinkedSite) {
  const value = site.copyDomain ?? site.displayDomain;
  if (!value) {
    message.warning(t('netlifyAccountDetail.sitesCopyDomainMissing'));
    return;
  }
  const host = value.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  await copyToClipboard(host);
  message.success(t('netlifyAccountDetail.sitesCopyDomainDone', { domain: host }));
}

function openObservability(site: NetlifyLinkedSite) {
  selectedSite.value = site;
  observabilityOpen.value = true;
}
</script>

<template>
  <n-card class="sites-card" :segmented="{ content: true }">
    <template #header>
      <n-h2 style="margin: 0">{{ t('netlifyAccountDetail.sitesTitle') }}</n-h2>
    </template>

    <n-spin :show="loading">
      <n-empty
        v-if="!loading && !sortedSites.length"
        :description="t('netlifyAccountDetail.sitesEmpty')"
      />
      <ul v-else class="sites-list">
        <li v-for="site in sortedSites" :key="site.id" class="sites-list__item">
          <div class="sites-list__thumb-wrap">
            <img
              class="sites-list__thumb"
              :src="thumbSrc(site)"
              :alt="site.name"
              loading="lazy"
              @error="onThumbError(site.id)"
            />
          </div>
          <div class="sites-list__body">
            <n-button
              text
              type="primary"
              class="sites-list__name-btn"
              @click="openObservability(site)"
            >
              <n-text strong class="sites-list__name">{{ site.name }}</n-text>
            </n-button>
            <n-text v-if="site.displayDomain" depth="3" class="sites-list__domain">
              {{ site.displayDomain }}
            </n-text>
            <n-text depth="3" class="sites-list__source">{{ site.deploySource }}</n-text>
            <n-text v-if="site.ownerName" depth="3" class="sites-list__owner">
              {{ t('netlifyAccountDetail.sitesOwnedBy', { name: site.ownerName }) }}
            </n-text>
            <n-text v-if="formatPublished(site)" depth="3" class="sites-list__published">
              {{ formatPublished(site) }}
            </n-text>
          </div>
          <div class="sites-list__actions">
            <n-button
              v-if="site.copyDomain || site.displayDomain"
              quaternary
              circle
              size="small"
              :title="t('netlifyAccountDetail.sitesCopyDomain')"
              @click="copyDomain(site)"
            >
              <template #icon>
                <n-icon :component="CopyOutline" />
              </template>
            </n-button>
            <a
              v-if="site.sslUrl || site.adminUrl"
              class="sites-list__link"
              :href="site.sslUrl ?? site.adminUrl ?? undefined"
              target="_blank"
              rel="noopener noreferrer"
              :title="t('netlifyAccountDetail.sitesOpenSite')"
            >
              <n-icon :component="OpenOutline" size="18" />
            </a>
            <n-button
              quaternary
              circle
              size="small"
              :title="t('netlifyAccountDetail.obsTitle')"
              @click="openObservability(site)"
            >
              <template #icon>
                <n-icon :component="ChevronForwardOutline" size="18" />
              </template>
            </n-button>
          </div>
        </li>
      </ul>
    </n-spin>

    <NetlifyAccountSiteObservabilityModal
      v-model:show="observabilityOpen"
      :linked-account-id="linkedAccountId"
      :site="selectedSite"
    />
  </n-card>
</template>

<style scoped>
.sites-card {
  width: 100%;
  min-height: 200px;
}

.sites-card :deep(.n-card-header) {
  padding-bottom: 12px;
}

.sites-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.sites-list__item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--n-border-color);
}

.sites-list__item:last-child {
  border-bottom: none;
}

.sites-list__thumb-wrap {
  flex-shrink: 0;
  width: 120px;
  height: 75px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--n-color-modal);
  border: 1px solid var(--n-border-color);
}

.sites-list__thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  display: block;
}

.sites-list__body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sites-list__name-btn {
  padding: 0;
  height: auto;
  justify-content: flex-start;
}

.sites-list__name {
  font-size: 0.95rem;
}

.sites-list__domain,
.sites-list__source,
.sites-list__owner,
.sites-list__published {
  font-size: 0.8125rem;
  line-height: 1.35;
}

.sites-list__actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.sites-list__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--n-text-color-3);
  text-decoration: none;
  border-radius: 50%;
}

.sites-list__link:hover {
  color: var(--n-text-color-1);
  background: var(--n-button-color-hover);
}
</style>
