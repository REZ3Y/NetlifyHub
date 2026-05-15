<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { CreateOutline, PencilOutline, TrashOutline } from '@vicons/ionicons5';
import type { UploadCustomRequestOptions, UploadFileInfo } from 'naive-ui';
import { NButton, NIcon, useMessage } from 'naive-ui';
import { isAxiosError } from 'axios';
import { http } from '@/api/http';
import { useUserDateTime } from '@/composables/useUserDateTime';
import type { PanelDeployArtifact } from '@/types/panel-deploy-artifact';

const { t } = useI18n();
const message = useMessage();
const { formatDateTime } = useUserDateTime();

const loading = ref(true);
const artifacts = ref<PanelDeployArtifact[]>([]);
const showForm = ref(false);
const editing = ref<PanelDeployArtifact | null>(null);
const saving = ref(false);
const deletingId = ref<string | null>(null);

const formTitle = ref('');
const uploadFileList = ref<UploadFileInfo[]>([]);
const pendingFile = ref<File | null>(null);

const isEdit = computed(() => editing.value !== null);
const formTitleLabel = computed(() =>
  isEdit.value ? t('deployArtifacts.editTitle') : t('deployArtifacts.addTitle')
);

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

async function load() {
  loading.value = true;
  try {
    const { data } = await http.get<{ artifacts: PanelDeployArtifact[] }>('/v1/deploy-artifacts');
    artifacts.value = data.artifacts;
  } catch (err) {
    artifacts.value = [];
    message.error(apiErrorMessage(err, t('deployArtifacts.loadError')));
  } finally {
    loading.value = false;
  }
}

onMounted(() => void load());

function openCreate() {
  editing.value = null;
  formTitle.value = '';
  uploadFileList.value = [];
  pendingFile.value = null;
  showForm.value = true;
}

function openEdit(row: PanelDeployArtifact) {
  editing.value = row;
  formTitle.value = row.title;
  uploadFileList.value = [];
  pendingFile.value = null;
  showForm.value = true;
}

function onUploadRequest({ file, onFinish, onError }: UploadCustomRequestOptions) {
  const raw = file.file;
  if (!raw) {
    onError();
    return;
  }
  if (!/\.zip$/i.test(raw.name)) {
    message.warning(t('deployArtifacts.zipOnly'));
    onError();
    return;
  }
  pendingFile.value = raw;
  onFinish();
}

async function save() {
  const title = formTitle.value.trim();
  if (!title) {
    message.warning(t('deployArtifacts.titleRequired'));
    return;
  }
  if (!isEdit.value && !pendingFile.value) {
    message.warning(t('deployArtifacts.fileRequired'));
    return;
  }

  saving.value = true;
  try {
    const form = new FormData();
    form.append('title', title);
    if (pendingFile.value) form.append('file', pendingFile.value);

    if (isEdit.value && editing.value) {
      const { data } = await http.patch<{ artifact: PanelDeployArtifact }>(
        `/v1/deploy-artifacts/${editing.value.id}`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      artifacts.value = artifacts.value.map((a) => (a.id === data.artifact.id ? data.artifact : a));
      message.success(t('deployArtifacts.updated'));
    } else {
      const { data } = await http.post<{ artifact: PanelDeployArtifact }>(
        '/v1/deploy-artifacts',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      artifacts.value = [data.artifact, ...artifacts.value];
      message.success(t('deployArtifacts.created'));
    }
    showForm.value = false;
  } catch (err) {
    message.error(apiErrorMessage(err, t('deployArtifacts.saveError')));
  } finally {
    saving.value = false;
  }
}

async function remove(row: PanelDeployArtifact) {
  deletingId.value = row.id;
  try {
    await http.delete(`/v1/deploy-artifacts/${row.id}`);
    artifacts.value = artifacts.value.filter((a) => a.id !== row.id);
    message.success(t('deployArtifacts.deleted'));
  } catch (err) {
    message.error(apiErrorMessage(err, t('deployArtifacts.deleteError')));
  } finally {
    deletingId.value = null;
  }
}
</script>

<template>
  <div class="deploy-artifacts-page">
    <n-space vertical :size="24" style="width: 100%">
      <n-space align="center" justify="space-between" style="width: 100%">
        <div>
          <n-h2 style="margin: 0 0 4px">{{ t('deployArtifacts.title') }}</n-h2>
          <n-p depth="3" style="margin: 0">{{ t('deployArtifacts.subtitle') }}</n-p>
        </div>
        <n-button type="primary" @click="openCreate">
          <template #icon>
            <n-icon :component="CreateOutline" />
          </template>
          {{ t('deployArtifacts.add') }}
        </n-button>
      </n-space>

      <n-card :segmented="{ content: true }">
        <n-spin :show="loading">
          <n-empty v-if="!loading && !artifacts.length" :description="t('deployArtifacts.empty')" />
          <n-table v-else bordered :single-line="false" size="small">
            <thead>
              <tr>
                <th>{{ t('deployArtifacts.colTitle') }}</th>
                <th>{{ t('deployArtifacts.colFile') }}</th>
                <th>{{ t('deployArtifacts.colSize') }}</th>
                <th>{{ t('deployArtifacts.colCreated') }}</th>
                <th style="width: 96px" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in artifacts" :key="row.id">
                <td>{{ row.title }}</td>
                <td>{{ row.originalFilename }}</td>
                <td>{{ formatBytes(row.sizeBytes) }}</td>
                <td>{{ formatDateTime(row.createdAt) }}</td>
                <td>
                  <n-space :size="4" justify="end">
                    <n-button quaternary circle size="small" @click="openEdit(row)">
                      <template #icon>
                        <n-icon :component="PencilOutline" />
                      </template>
                    </n-button>
                    <n-popconfirm
                      :positive-text="t('deployArtifacts.deleteConfirm')"
                      :negative-text="t('netlifyAccountDetail.envCancel')"
                      @positive-click="remove(row)"
                    >
                      <template #trigger>
                        <n-button
                          quaternary
                          circle
                          size="small"
                          type="error"
                          :loading="deletingId === row.id"
                        >
                          <template #icon>
                            <n-icon :component="TrashOutline" />
                          </template>
                        </n-button>
                      </template>
                      {{ t('deployArtifacts.deleteBody', { title: row.title }) }}
                    </n-popconfirm>
                  </n-space>
                </td>
              </tr>
            </tbody>
          </n-table>
        </n-spin>
      </n-card>
    </n-space>

    <n-modal
      v-model:show="showForm"
      preset="card"
      style="width: min(480px, 96vw)"
      :title="formTitleLabel"
      :segmented="{ content: true }"
    >
      <n-form label-placement="top" :show-require-mark="false">
        <n-form-item :label="t('deployArtifacts.fieldTitle')">
          <n-input
            v-model:value="formTitle"
            :placeholder="t('deployArtifacts.fieldTitlePlaceholder')"
          />
        </n-form-item>
        <n-form-item :label="t('deployArtifacts.fieldFile')">
          <n-upload
            v-model:file-list="uploadFileList"
            accept=".zip,application/zip"
            :max="1"
            :custom-request="onUploadRequest"
          >
            <n-button>{{ t('deployArtifacts.chooseZip') }}</n-button>
          </n-upload>
          <n-text v-if="isEdit && !pendingFile" depth="3" style="display: block; margin-top: 8px">
            {{ t('deployArtifacts.replaceOptional') }}
          </n-text>
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showForm = false">{{ t('netlifyAccountDetail.envCancel') }}</n-button>
          <n-button type="primary" :loading="saving" @click="save">
            {{ t('deployArtifacts.save') }}
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.deploy-artifacts-page {
  width: 100%;
  max-width: 100%;
}
</style>
