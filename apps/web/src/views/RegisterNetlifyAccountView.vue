<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
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

const noAutocompleteInputProps = {
  autocomplete: 'off' as const,
  'data-lpignore': 'true' as const,
  'data-1p-ignore': 'true' as const,
};

const titleInputProps = { ...noAutocompleteInputProps, name: 'netlifyhub_panel_title' };
const tokenInputProps = { ...noAutocompleteInputProps, name: 'netlifyhub_netlify_pat' };

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

/** `n-form` renders a native `<form>`; its default `onSubmit` only calls `preventDefault()`. */
function handleNativeFormSubmit(e: Event) {
  e.preventDefault();
  void onSubmit();
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

type SummaryRow = { key: string; label: string; value: string; breakAll?: boolean };

const accountSummaryRows = computed<SummaryRow[]>(() => {
  const a = createdAccount.value;
  if (!a) return [];
  return [
    { key: 'panelTitle', label: t('netlifyAccounts.fields.panelTitle'), value: a.label ?? '—' },
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
  ];
});
</script>

<template>
  <n-space vertical size="large" style="max-width: 560px">
    <div>
      <n-h2>{{ t('netlifyAccounts.title') }}</n-h2>
      <n-p depth="3">{{ t('netlifyAccounts.subtitle') }}</n-p>
    </div>

    <n-card :segmented="{ content: true }">
      <n-form
        ref="formRef"
        :model="model"
        :rules="rules"
        label-placement="top"
        :on-submit="handleNativeFormSubmit"
      >
        <n-form-item path="title" :label="t('netlifyAccounts.titleField')">
          <n-input
            v-model:value="model.title"
            :placeholder="t('netlifyAccounts.titlePlaceholder')"
            maxlength="128"
            show-count
            :input-props="titleInputProps"
          />
        </n-form-item>
        <n-form-item path="apiToken" :label="t('netlifyAccounts.apiToken')">
          <n-input
            v-model:value="model.apiToken"
            type="password"
            show-password-on="click"
            :placeholder="t('netlifyAccounts.apiTokenPlaceholder')"
            :input-props="tokenInputProps"
          />
        </n-form-item>
        <n-button type="primary" attr-type="submit" :loading="submitting">
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
        <n-table bordered :single-line="false" size="small" class="account-summary-table">
          <thead>
            <tr>
              <th scope="col" class="account-summary-table__th-label">
                {{ t('netlifyAccounts.summaryColumnLabel') }}
              </th>
              <th scope="col">{{ t('netlifyAccounts.summaryColumnValue') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in accountSummaryRows" :key="row.key">
              <td class="account-summary-table__td-label">{{ row.label }}</td>
              <td>
                <n-text v-if="row.breakAll" style="word-break: break-all">{{ row.value }}</n-text>
                <template v-else>{{ row.value }}</template>
              </td>
            </tr>
          </tbody>
        </n-table>
      </template>

      <n-space justify="end">
        <n-button type="primary" @click="closeSuccessModal">{{ t('common.close') }}</n-button>
      </n-space>
    </n-space>
  </n-modal>
</template>

<style scoped>
.account-summary-table {
  width: 100%;
  table-layout: fixed;
}
.account-summary-table__th-label,
.account-summary-table__td-label {
  width: 38%;
  vertical-align: top;
  white-space: normal;
}
</style>
