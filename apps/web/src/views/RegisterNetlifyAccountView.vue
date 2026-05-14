<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FormInst, FormRules } from 'naive-ui';
import { useMessage } from 'naive-ui';
import { isAxiosError } from 'axios';
import { http } from '@/api/http';
import { useUserDateTime } from '@/composables/useUserDateTime';

const { t } = useI18n();
const message = useMessage();
const { formatDateTime } = useUserDateTime();

const formRef = ref<FormInst | null>(null);
const submitting = ref(false);
const showSuccess = ref(false);

const model = reactive({
  title: '',
  apiToken: '',
});

type LinkedAccount = {
  id: string;
  label: string | null;
  netlifyId: string;
  uid: string;
  fullName: string | null;
  avatarUrl: string | null;
  email: string | null;
  affiliateId: string | null;
  siteCount: number;
  netlifyCreatedAt: string | null;
  netlifyLastLogin: string | null;
  createdAt: string;
  updatedAt: string;
};

const createdAccount = ref<LinkedAccount | null>(null);

const rules: FormRules = {
  apiToken: [
    { required: true, message: () => t('netlifyAccounts.rules.tokenRequired'), trigger: 'blur' },
  ],
};

function formatNetlifyInstant(value: string | null): string {
  if (!value) return '—';
  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) return formatDateTime(asDate);
  return value;
}

async function onSubmit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    const { data } = await http.post<{ account: LinkedAccount }>('/v1/netlify-accounts', {
      title: model.title.trim() || undefined,
      apiToken: model.apiToken,
    });
    createdAccount.value = data.account;
    model.apiToken = '';
    model.title = '';
    showSuccess.value = true;
  } catch (e) {
    if (isAxiosError(e)) {
      const msg =
        typeof e.response?.data === 'object' &&
        e.response?.data !== null &&
        'message' in e.response.data &&
        typeof (e.response.data as { message: unknown }).message === 'string'
          ? (e.response.data as { message: string }).message
          : t('netlifyAccounts.submitError');
      message.error(msg);
      return;
    }
    message.error(t('netlifyAccounts.submitError'));
  } finally {
    submitting.value = false;
  }
}

function closeSuccessModal() {
  showSuccess.value = false;
  createdAccount.value = null;
}
</script>

<template>
  <n-space vertical size="large" style="max-width: 560px">
    <div>
      <n-h2>{{ t('netlifyAccounts.title') }}</n-h2>
      <n-p depth="3">{{ t('netlifyAccounts.subtitle') }}</n-p>
    </div>

    <n-card :segmented="{ content: true }">
      <n-form ref="formRef" :model="model" :rules="rules" label-placement="top">
        <n-form-item path="title" :label="t('netlifyAccounts.titleField')">
          <n-input
            v-model:value="model.title"
            :placeholder="t('netlifyAccounts.titlePlaceholder')"
            maxlength="128"
            show-count
          />
        </n-form-item>
        <n-form-item path="apiToken" :label="t('netlifyAccounts.apiToken')">
          <n-input
            v-model:value="model.apiToken"
            type="password"
            show-password-on="click"
            :placeholder="t('netlifyAccounts.apiTokenPlaceholder')"
            autocomplete="off"
          />
        </n-form-item>
        <n-button type="primary" :loading="submitting" @click="onSubmit">
          {{ t('netlifyAccounts.submit') }}
        </n-button>
      </n-form>
    </n-card>
  </n-space>

  <n-modal
    v-model:show="showSuccess"
    preset="card"
    :title="t('netlifyAccounts.successTitle')"
    :style="{ width: 'min(520px, 92vw)' }"
    :mask-closable="false"
    @after-leave="createdAccount = null"
  >
    <n-space vertical size="large">
      <n-alert type="success" :show-icon="true">
        {{ t('netlifyAccounts.successIntro') }}
      </n-alert>

      <template v-if="createdAccount">
        <n-descriptions bordered :column="1" size="small" label-style="width: 38%">
          <n-descriptions-item :label="t('netlifyAccounts.fields.panelTitle')">
            {{ createdAccount.label ?? '—' }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('netlifyAccounts.fields.netlifyId')">
            {{ createdAccount.netlifyId }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('netlifyAccounts.fields.uid')">
            {{ createdAccount.uid }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('netlifyAccounts.fields.fullName')">
            {{ createdAccount.fullName ?? '—' }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('netlifyAccounts.fields.email')">
            {{ createdAccount.email ?? '—' }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('netlifyAccounts.fields.avatarUrl')">
            <n-text v-if="createdAccount.avatarUrl" style="word-break: break-all">
              {{ createdAccount.avatarUrl }}
            </n-text>
            <span v-else>—</span>
          </n-descriptions-item>
          <n-descriptions-item :label="t('netlifyAccounts.fields.affiliateId')">
            {{ createdAccount.affiliateId ?? '—' }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('netlifyAccounts.fields.siteCount')">
            {{ createdAccount.siteCount }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('netlifyAccounts.fields.createdAt')">
            {{ formatNetlifyInstant(createdAccount.netlifyCreatedAt) }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('netlifyAccounts.fields.lastLogin')">
            {{ formatNetlifyInstant(createdAccount.netlifyLastLogin) }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('netlifyAccounts.fields.linkedAt')">
            {{ formatDateTime(createdAccount.createdAt) }}
          </n-descriptions-item>
        </n-descriptions>
      </template>

      <n-space justify="end">
        <n-button type="primary" @click="closeSuccessModal">{{ t('common.close') }}</n-button>
      </n-space>
    </n-space>
  </n-modal>
</template>
