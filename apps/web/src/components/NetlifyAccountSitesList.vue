<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ChevronForwardOutline,
  CopyOutline,
  OpenOutline,
  SettingsOutline,
} from '@vicons/ionicons5';
import { useMessage } from 'naive-ui';
import { useClipboard } from '@vueuse/core';
import { isAxiosError } from 'axios';
import { http } from '@/api/http';
import { useUserDateTime } from '@/composables/useUserDateTime';
import type { NetlifyLinkedSite } from '@/types/netlify-account-site';
import NetlifyAccountSiteObservabilityModal from '@/components/NetlifyAccountSiteObservabilityModal.vue';
import NetlifyAccountSiteEnvModal from '@/components/NetlifyAccountSiteEnvModal.vue';

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
const envOpen = ref(false);
const selectedSite = ref<NetlifyLinkedSite | null>(null);
const noteOverrides = ref<Record<string, string | null>>({});
const draftNote = ref('');
const savingNote = ref(false);
const notePopoverOpenId = ref<string | null>(null);

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

function openEnv(site: NetlifyLinkedSite) {
  selectedSite.value = site;
  envOpen.value = true;
}

function panelNote(site: NetlifyLinkedSite): string | null {
  if (Object.hasOwn(noteOverrides.value, site.id)) return noteOverrides.value[site.id];
  return site.panelNote;
}

function hasPanelNote(site: NetlifyLinkedSite): boolean {
  const n = panelNote(site);
  return Boolean(n && n.trim());
}

function noteBadgeLabel(site: NetlifyLinkedSite): string {
  const n = panelNote(site)?.trim();
  if (!n) return t('netlifyAccountDetail.sitesNoteEmpty');
  return n.length > 18 ? `${n.slice(0, 18)}…` : n;
}

function onNotePopoverShow(site: NetlifyLinkedSite, visible: boolean) {
  if (visible) {
    notePopoverOpenId.value = site.id;
    draftNote.value = panelNote(site) ?? '';
  } else if (notePopoverOpenId.value === site.id) {
    notePopoverOpenId.value = null;
  }
}

async function savePanelNote(site: NetlifyLinkedSite) {
  savingNote.value = true;
  const trimmed = draftNote.value.trim();
  try {
    const { data } = await http.put<{ panelNote: string | null }>(
      `/v1/netlify-accounts/${props.linkedAccountId}/sites/${encodeURIComponent(site.id)}/note`,
      { note: trimmed || null }
    );
    noteOverrides.value = { ...noteOverrides.value, [site.id]: data.panelNote };
    notePopoverOpenId.value = null;
    message.success(t('netlifyAccountDetail.sitesNoteSaved'));
  } catch (err) {
    const fallback = t('netlifyAccountDetail.sitesNoteSaveError');
    const msg =
      isAxiosError(err) && err.response?.data && typeof err.response.data === 'object'
        ? ((err.response.data as { message?: string }).message ?? fallback)
        : fallback;
    message.error(msg);
  } finally {
    savingNote.value = false;
  }
}

async function clearPanelNote(site: NetlifyLinkedSite) {
  draftNote.value = '';
  await savePanelNote(site);
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
          <div class="sites-list__lead-actions">
            <n-popover
              trigger="click"
              placement="bottom-end"
              :show="notePopoverOpenId === site.id"
              @update:show="onNotePopoverShow(site, $event)"
            >
              <template #trigger>
                <n-tag
                  size="small"
                  :bordered="true"
                  class="sites-list__note-badge"
                  :class="
                    hasPanelNote(site)
                      ? 'sites-list__note-badge--set'
                      : 'sites-list__note-badge--empty'
                  "
                  :title="panelNote(site) ?? t('netlifyAccountDetail.sitesNotePopoverTitle')"
                >
                  {{ noteBadgeLabel(site) }}
                </n-tag>
              </template>
              <div class="sites-list__note-popover">
                <n-text strong style="display: block; margin-bottom: 8px">
                  {{ t('netlifyAccountDetail.sitesNotePopoverTitle') }}
                </n-text>
                <n-input
                  v-model:value="draftNote"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 5 }"
                  :placeholder="t('netlifyAccountDetail.sitesNotePlaceholder')"
                />
                <n-space justify="end" :size="8" style="margin-top: 12px">
                  <n-button size="small" :disabled="savingNote" @click="clearPanelNote(site)">
                    {{ t('netlifyAccountDetail.sitesNoteClear') }}
                  </n-button>
                  <n-button
                    size="small"
                    type="primary"
                    :loading="savingNote"
                    @click="savePanelNote(site)"
                  >
                    {{ t('netlifyAccountDetail.sitesNoteSave') }}
                  </n-button>
                </n-space>
              </div>
            </n-popover>
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
          </div>
          <div class="sites-list__actions">
            <n-button
              quaternary
              circle
              size="small"
              :title="t('netlifyAccountDetail.envTitle')"
              @click="openEnv(site)"
            >
              <template #icon>
                <n-icon :component="SettingsOutline" />
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
    <NetlifyAccountSiteEnvModal
      v-model:show="envOpen"
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

.sites-list__lead-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.sites-list__note-badge {
  cursor: pointer;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sites-list__note-badge--empty {
  color: #b45309;
  background: rgba(251, 191, 36, 0.14);
  border-color: rgba(245, 158, 11, 0.55);
}

.sites-list__note-badge--set {
  color: #1d6fa5;
  background: rgba(59, 141, 253, 0.12);
  border-color: rgba(59, 141, 253, 0.45);
}

.sites-list__note-popover {
  width: min(280px, 72vw);
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
