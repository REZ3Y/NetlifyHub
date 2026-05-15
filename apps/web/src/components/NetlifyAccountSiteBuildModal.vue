<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ArrowUndoOutline,
  CloudUploadOutline,
  ConstructOutline,
  FolderOpenOutline,
  RefreshOutline,
} from '@vicons/ionicons5';
import { isAxiosError } from 'axios';
import type { UploadCustomRequestOptions, UploadFileInfo } from 'naive-ui';
import { useMessage } from 'naive-ui';
import { http } from '@/api/http';
import { useUserDateTime } from '@/composables/useUserDateTime';
import type { NetlifyLinkedSite } from '@/types/netlify-account-site';
import type { NetlifySiteDeploy, NetlifySiteDeployResult } from '@/types/netlify-site-deploy';
import type { PanelDeployArtifact } from '@/types/panel-deploy-artifact';

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

const deploysLoading = ref(false);
const deploys = ref<NetlifySiteDeploy[]>([]);
const deploying = ref(false);
const restoringId = ref<string | null>(null);
const uploadFileList = ref<UploadFileInfo[]>([]);

const artifactsLoading = ref(false);
const artifacts = ref<PanelDeployArtifact[]>([]);
const showArtifactPicker = ref(false);
const selectedArtifactId = ref<string | null>(null);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function apiErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err) && err.response?.data && typeof err.response.data === 'object') {
    const msg = (err.response.data as { message?: string }).message;
    if (msg) return msg;
  }
  return fallback;
}

function formatDeployTime(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return formatDateTime(d, { dateStyle: 'medium', timeStyle: 'short' });
}

function deployStateType(state: string): 'success' | 'warning' | 'error' | 'default' {
  const s = state.toLowerCase();
  if (s === 'ready' || s === 'published') return 'success';
  if (s === 'building' || s === 'uploading' || s === 'preparing') return 'warning';
  if (s === 'error' || s === 'failed') return 'error';
  return 'default';
}

const siteDeployBase = computed(() => {
  if (!props.site) return '';
  return `/v1/netlify-accounts/${props.linkedAccountId}/sites/${encodeURIComponent(props.site.id)}/deploys`;
});

async function loadDeploys() {
  if (!props.site || !props.show) return;
  deploysLoading.value = true;
  try {
    const { data } = await http.get<{ deploys: NetlifySiteDeploy[] }>(siteDeployBase.value);
    deploys.value = data.deploys;
  } catch (err) {
    deploys.value = [];
    message.error(apiErrorMessage(err, t('netlifyAccountDetail.buildDeploysLoadError')));
  } finally {
    deploysLoading.value = false;
  }
}

async function loadArtifacts() {
  artifactsLoading.value = true;
  try {
    const { data } = await http.get<{ artifacts: PanelDeployArtifact[] }>('/v1/deploy-artifacts');
    artifacts.value = data.artifacts;
  } catch (err) {
    artifacts.value = [];
    message.error(apiErrorMessage(err, t('netlifyAccountDetail.buildArtifactsLoadError')));
  } finally {
    artifactsLoading.value = false;
  }
}

async function afterDeploySuccess(data: NetlifySiteDeployResult) {
  message.success(t('netlifyAccountDetail.buildDeployStarted'));
  const existing = deploys.value.find((d) => d.id === data.deploy.id);
  if (existing) {
    deploys.value = deploys.value.map((d) => (d.id === data.deploy.id ? data.deploy : d));
  } else {
    deploys.value = [data.deploy, ...deploys.value];
  }
  await loadDeploys();
}

async function deployZipFile(file: File) {
  if (!props.site) return;
  deploying.value = true;
  try {
    const form = new FormData();
    form.append('file', file);
    const { data } = await http.post<NetlifySiteDeployResult>(siteDeployBase.value, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    uploadFileList.value = [];
    await afterDeploySuccess(data);
  } catch (err) {
    message.error(apiErrorMessage(err, t('netlifyAccountDetail.buildDeployError')));
  } finally {
    deploying.value = false;
  }
}

function onUploadRequest({ file, onFinish, onError }: UploadCustomRequestOptions) {
  const raw = file.file;
  if (!raw) {
    onError();
    return;
  }
  if (!/\.zip$/i.test(raw.name)) {
    message.warning(t('netlifyAccountDetail.buildZipOnly'));
    onError();
    return;
  }
  void deployZipFile(raw)
    .then(() => onFinish())
    .catch(() => onError());
}

async function deploySelectedArtifact() {
  if (!props.site || !selectedArtifactId.value) return;
  deploying.value = true;
  try {
    const { data } = await http.post<NetlifySiteDeployResult>(siteDeployBase.value, {
      artifactId: selectedArtifactId.value,
    });
    showArtifactPicker.value = false;
    selectedArtifactId.value = null;
    await afterDeploySuccess(data);
  } catch (err) {
    message.error(apiErrorMessage(err, t('netlifyAccountDetail.buildDeployError')));
  } finally {
    deploying.value = false;
  }
}

async function openArtifactPicker() {
  showArtifactPicker.value = true;
  selectedArtifactId.value = null;
  await loadArtifacts();
}

async function restoreDeploy(deployId: string) {
  if (!props.site) return;
  restoringId.value = deployId;
  try {
    const { data } = await http.post<NetlifySiteDeployResult>(
      `${siteDeployBase.value}/${encodeURIComponent(deployId)}/restore`
    );
    message.success(t('netlifyAccountDetail.buildRestoreOk'));
    await afterDeploySuccess(data);
  } catch (err) {
    message.error(apiErrorMessage(err, t('netlifyAccountDetail.buildRestoreError')));
  } finally {
    restoringId.value = null;
  }
}

watch(
  () => [props.show, props.site?.id] as const,
  ([visible]) => {
    if (visible && props.site) {
      showArtifactPicker.value = false;
      selectedArtifactId.value = null;
      uploadFileList.value = [];
      void loadDeploys();
    }
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
    style="width: min(600px, 96vw)"
    :title="site?.name ?? ''"
    :segmented="{ content: true }"
    @update:show="emit('update:show', $event)"
  >
    <template v-if="site">
      <n-space vertical :size="16">
        <n-space align="center" :size="8">
          <n-icon :component="ConstructOutline" size="20" />
          <n-text strong>{{ t('netlifyAccountDetail.buildTitle') }}</n-text>
        </n-space>

        <n-text depth="3">{{ t('netlifyAccountDetail.buildUploadHint') }}</n-text>

        <n-upload
          v-model:file-list="uploadFileList"
          accept=".zip,application/zip"
          :max="1"
          :disabled="deploying"
          :custom-request="onUploadRequest"
        >
          <n-upload-dragger>
            <n-space vertical align="center" :size="8">
              <n-icon :component="CloudUploadOutline" size="32" depth="3" />
              <n-text>{{ t('netlifyAccountDetail.buildUploadZip') }}</n-text>
            </n-space>
          </n-upload-dragger>
        </n-upload>

        <n-button
          block
          secondary
          :loading="artifactsLoading && showArtifactPicker"
          @click="openArtifactPicker"
        >
          <template #icon>
            <n-icon :component="FolderOpenOutline" />
          </template>
          {{ t('netlifyAccountDetail.buildFromPanelFiles') }}
        </n-button>

        <n-card
          v-if="showArtifactPicker"
          size="small"
          embedded
          :title="t('netlifyAccountDetail.buildPanelFilesTitle')"
        >
          <n-spin :show="artifactsLoading">
            <n-empty
              v-if="!artifactsLoading && !artifacts.length"
              size="small"
              :description="t('netlifyAccountDetail.buildPanelFilesEmpty')"
            />
            <n-radio-group v-else v-model:value="selectedArtifactId" class="artifact-list">
              <n-space vertical :size="8">
                <n-radio
                  v-for="item in artifacts"
                  :key="item.id"
                  :value="item.id"
                  class="artifact-list__item"
                >
                  <n-space vertical :size="2">
                    <n-text strong>{{ item.title }}</n-text>
                    <n-text depth="3" style="font-size: 0.8125rem">
                      {{ item.originalFilename }} · {{ formatBytes(item.sizeBytes) }} ·
                      {{ formatDeployTime(item.createdAt) }}
                    </n-text>
                  </n-space>
                </n-radio>
              </n-space>
            </n-radio-group>
          </n-spin>
          <n-space justify="end" :size="8" style="margin-top: 12px">
            <n-button size="small" @click="showArtifactPicker = false">
              {{ t('netlifyAccountDetail.envCancel') }}
            </n-button>
            <n-button
              size="small"
              type="primary"
              :disabled="!selectedArtifactId"
              :loading="deploying"
              @click="deploySelectedArtifact"
            >
              {{ t('netlifyAccountDetail.buildDeploySelected') }}
            </n-button>
          </n-space>
        </n-card>

        <n-divider style="margin: 8px 0" />

        <n-space align="center" justify="space-between" style="width: 100%">
          <n-text strong>{{ t('netlifyAccountDetail.buildDeploysTitle') }}</n-text>
          <n-button quaternary size="tiny" :loading="deploysLoading" @click="loadDeploys">
            <template #icon>
              <n-icon :component="RefreshOutline" />
            </template>
          </n-button>
        </n-space>

        <n-spin :show="deploysLoading">
          <n-empty
            v-if="!deploysLoading && !deploys.length"
            size="small"
            :description="t('netlifyAccountDetail.buildDeploysEmpty')"
          />
          <ul v-else class="deploy-list">
            <li v-for="item in deploys" :key="item.id" class="deploy-list__item">
              <div class="deploy-list__main">
                <n-space align="center" :size="8" :wrap="false">
                  <n-tag size="small" :type="deployStateType(item.state)" round>
                    {{ item.state }}
                  </n-tag>
                  <n-text depth="3" style="font-size: 0.8125rem">
                    {{ formatDeployTime(item.createdAt) }}
                  </n-text>
                </n-space>
                <n-text v-if="item.branch" depth="3" class="deploy-list__meta">
                  {{ t('netlifyAccountDetail.buildBranch', { branch: item.branch }) }}
                </n-text>
                <a
                  v-if="item.deployUrl"
                  class="deploy-list__link"
                  :href="item.deployUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ item.deployUrl }}
                </a>
              </div>
              <n-popconfirm
                :positive-text="t('netlifyAccountDetail.buildRestoreConfirm')"
                :negative-text="t('netlifyAccountDetail.envCancel')"
                @positive-click="restoreDeploy(item.id)"
              >
                <template #trigger>
                  <n-button
                    quaternary
                    circle
                    size="small"
                    :loading="restoringId === item.id"
                    :title="t('netlifyAccountDetail.buildRestore')"
                  >
                    <template #icon>
                      <n-icon :component="ArrowUndoOutline" />
                    </template>
                  </n-button>
                </template>
                {{ t('netlifyAccountDetail.buildRestoreBody') }}
              </n-popconfirm>
            </li>
          </ul>
        </n-spin>
      </n-space>
    </template>

    <template #footer>
      <n-space justify="end">
        <n-button @click="close">{{ t('common.close') }}</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<style scoped>
.artifact-list {
  width: 100%;
}

.artifact-list__item {
  width: 100%;
  align-items: flex-start;
}

.deploy-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.deploy-list__item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--n-border-color);
}

.deploy-list__item:last-child {
  border-bottom: none;
}

.deploy-list__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.deploy-list__meta {
  font-size: 0.8125rem;
}

.deploy-list__link {
  font-size: 0.8125rem;
  word-break: break-all;
  color: var(--n-primary-color);
}
</style>
