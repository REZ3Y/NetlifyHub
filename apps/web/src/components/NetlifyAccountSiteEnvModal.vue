<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { SettingsOutline, TrashOutline } from '@vicons/ionicons5';
import { isAxiosError } from 'axios';
import { useMessage } from 'naive-ui';
import { http } from '@/api/http';
import type { NetlifyLinkedSite } from '@/types/netlify-account-site';
import type { SiteEnvSaveResult, SiteEnvVar } from '@/types/netlify-site-env';

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

const loading = ref(false);
const saving = ref(false);
const deletingKey = ref<string | null>(null);
const envVars = ref<SiteEnvVar[]>([]);
const editingKey = ref<string | null>(null);

const formKey = ref('');
const formValue = ref('');
const formContext = ref<'all' | 'production' | 'deploy-preview' | 'branch-deploy' | 'dev'>('all');
const formSecret = ref(false);

const contextOptions = computed(() => [
  { label: t('netlifyAccountDetail.envContextAll'), value: 'all' as const },
  { label: t('netlifyAccountDetail.envContextProduction'), value: 'production' as const },
  { label: t('netlifyAccountDetail.envContextDeployPreview'), value: 'deploy-preview' as const },
  { label: t('netlifyAccountDetail.envContextBranchDeploy'), value: 'branch-deploy' as const },
  { label: t('netlifyAccountDetail.envContextDev'), value: 'dev' as const },
]);

const isEditing = computed(() => editingKey.value !== null);

async function load() {
  if (!props.site || !props.show) return;
  loading.value = true;
  envVars.value = [];
  editingKey.value = null;
  resetForm();
  try {
    const { data } = await http.get<{ envVars: SiteEnvVar[] }>(
      `/v1/netlify-accounts/${props.linkedAccountId}/sites/${encodeURIComponent(props.site.id)}/env`
    );
    envVars.value = data.envVars;
  } catch {
    message.error(t('netlifyAccountDetail.envLoadError'));
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  formKey.value = '';
  formValue.value = '';
  formContext.value = 'all';
  formSecret.value = false;
}

function displayValue(v: SiteEnvVar): string {
  if (v.isSecret && v.values.every((x) => !x.hasValue || !x.value)) {
    return t('netlifyAccountDetail.envSecretHidden');
  }
  return v.values
    .map((x) => {
      const ctx = x.contextParameter ? `${x.context} (${x.contextParameter})` : x.context;
      const val = x.value || (v.isSecret ? '••••••' : '—');
      return `${ctx}: ${val}`;
    })
    .join(' · ');
}

const valuePlaceholder = computed(() =>
  isEditing.value && envVars.value.find((e) => e.key === editingKey.value)?.isSecret
    ? t('netlifyAccountDetail.envSecretEditPlaceholder')
    : t('netlifyAccountDetail.envValuePlaceholder')
);

function startEdit(v: SiteEnvVar) {
  editingKey.value = v.key;
  formKey.value = v.key;
  const primary = v.values[0];
  formValue.value = primary?.value ?? '';
  formContext.value =
    (primary?.context as typeof formContext.value) && primary.context !== 'branch'
      ? (primary.context as typeof formContext.value)
      : 'all';
  formSecret.value = v.isSecret;
}

function apiErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err) && err.response?.data && typeof err.response.data === 'object') {
    const msg = (err.response.data as { message?: string }).message;
    if (msg) return msg;
  }
  return fallback;
}

function applySaveResult(data: SiteEnvSaveResult) {
  envVars.value = data.envVars;
  editingKey.value = null;
  resetForm();
  if (data.redeploy.triggered) {
    message.success(t('netlifyAccountDetail.envSaveRedeployOk'));
  } else if (data.redeploy.error) {
    message.warning(
      t('netlifyAccountDetail.envSaveRedeployFailed', { error: data.redeploy.error })
    );
  } else {
    message.success(t('netlifyAccountDetail.envSaveOk'));
  }
}

function cancelEdit() {
  editingKey.value = null;
  resetForm();
}

async function save() {
  if (!props.site) return;
  const key = formKey.value.trim();
  if (!key) {
    message.warning(t('netlifyAccountDetail.envKeyRequired'));
    return;
  }

  saving.value = true;
  try {
    const { data } = await http.post<SiteEnvSaveResult>(
      `/v1/netlify-accounts/${props.linkedAccountId}/sites/${encodeURIComponent(props.site.id)}/env`,
      {
        key,
        value: formValue.value,
        context: formContext.value,
        isSecret: formSecret.value,
        triggerRedeploy: true,
      }
    );
    applySaveResult(data);
  } catch (err) {
    message.error(apiErrorMessage(err, t('netlifyAccountDetail.envSaveError')));
  } finally {
    saving.value = false;
  }
}

async function remove(key: string) {
  if (!props.site) return;
  deletingKey.value = key;
  try {
    const { data } = await http.delete<SiteEnvSaveResult>(
      `/v1/netlify-accounts/${props.linkedAccountId}/sites/${encodeURIComponent(props.site.id)}/env/${encodeURIComponent(key)}`
    );
    envVars.value = data.envVars;
    if (editingKey.value === key) cancelEdit();
    if (data.redeploy.triggered) {
      message.success(t('netlifyAccountDetail.envDeleteRedeployOk'));
    } else if (data.redeploy.error) {
      message.warning(
        t('netlifyAccountDetail.envDeleteRedeployFailed', { error: data.redeploy.error })
      );
    } else {
      message.success(t('netlifyAccountDetail.envDeleteOk'));
    }
  } catch (err) {
    message.error(apiErrorMessage(err, t('netlifyAccountDetail.envDeleteError')));
  } finally {
    deletingKey.value = null;
  }
}

watch(
  () => [props.show, props.site?.id] as const,
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
    style="width: min(560px, 96vw)"
    :title="site?.name ?? ''"
    :segmented="{ content: true }"
    @update:show="emit('update:show', $event)"
  >
    <template v-if="site">
      <n-space vertical :size="16">
        <n-space align="center" :size="8">
          <n-icon :component="SettingsOutline" size="20" />
          <n-text strong>{{ t('netlifyAccountDetail.envTitle') }}</n-text>
        </n-space>

        <n-spin :show="loading">
          <n-empty
            v-if="!loading && !envVars.length"
            size="small"
            :description="t('netlifyAccountDetail.envEmpty')"
          />
          <ul v-else class="env-list">
            <li v-for="item in envVars" :key="item.key" class="env-list__item">
              <div class="env-list__main">
                <n-text strong class="env-list__key">{{ item.key }}</n-text>
                <n-text depth="3" class="env-list__value">{{ displayValue(item) }}</n-text>
              </div>
              <n-space :size="4">
                <n-button size="tiny" quaternary @click="startEdit(item)">
                  {{ t('netlifyAccountDetail.envEdit') }}
                </n-button>
                <n-popconfirm
                  :positive-text="t('netlifyAccountDetail.envDeleteConfirm')"
                  :negative-text="t('netlifyAccountDetail.envCancel')"
                  @positive-click="remove(item.key)"
                >
                  <template #trigger>
                    <n-button
                      size="tiny"
                      quaternary
                      type="error"
                      :loading="deletingKey === item.key"
                      :title="t('netlifyAccountDetail.envDelete')"
                    >
                      <template #icon>
                        <n-icon :component="TrashOutline" />
                      </template>
                    </n-button>
                  </template>
                  {{ t('netlifyAccountDetail.envDeleteBody', { key: item.key }) }}
                </n-popconfirm>
              </n-space>
            </li>
          </ul>
        </n-spin>

        <n-divider style="margin: 8px 0" />

        <n-form label-placement="top" :show-require-mark="false">
          <n-form-item :label="t('netlifyAccountDetail.envKey')">
            <n-input
              v-model:value="formKey"
              :disabled="isEditing"
              :placeholder="t('netlifyAccountDetail.envKeyPlaceholder')"
            />
          </n-form-item>
          <n-form-item :label="t('netlifyAccountDetail.envValue')">
            <n-input
              v-model:value="formValue"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 6 }"
              :placeholder="valuePlaceholder"
            />
          </n-form-item>
          <n-form-item :label="t('netlifyAccountDetail.envContext')">
            <n-select v-model:value="formContext" :options="contextOptions" />
          </n-form-item>
          <n-form-item v-if="!isEditing" :show-label="false">
            <n-checkbox v-model:checked="formSecret">
              {{ t('netlifyAccountDetail.envSecret') }}
            </n-checkbox>
          </n-form-item>
        </n-form>
      </n-space>
    </template>

    <template #footer>
      <n-space justify="end">
        <n-button v-if="isEditing" @click="cancelEdit">{{
          t('netlifyAccountDetail.envCancel')
        }}</n-button>
        <n-button @click="close">{{ t('common.close') }}</n-button>
        <n-button type="primary" :loading="saving" @click="save">
          {{ isEditing ? t('netlifyAccountDetail.envUpdate') : t('netlifyAccountDetail.envAdd') }}
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<style scoped>
.env-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.env-list__item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--n-border-color);
}

.env-list__item:last-child {
  border-bottom: none;
}

.env-list__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.env-list__key {
  font-size: 0.875rem;
  word-break: break-all;
}

.env-list__value {
  font-size: 0.8125rem;
  line-height: 1.4;
  word-break: break-word;
}
</style>
