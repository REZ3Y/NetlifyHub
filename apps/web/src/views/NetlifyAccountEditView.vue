<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { FormInst, FormRules } from 'naive-ui';
import { useMessage } from 'naive-ui';
import { ArrowBackOutline } from '@vicons/ionicons5';
import { isAxiosError } from 'axios';
import { http } from '@/api/http';
import type { LinkedNetlifyAccount } from '@/types/netlify-linked-account';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const message = useMessage();

const formRef = ref<FormInst | null>(null);
const loading = ref(true);
const submitting = ref(false);
const accountId = ref<string | null>(null);

const model = reactive({
  title: '',
  apiToken: '',
});

const noAutocompleteInputProps = {
  autocomplete: 'off' as const,
  'data-lpignore': 'true' as const,
  'data-1p-ignore': 'true' as const,
};

const titleInputProps = { ...noAutocompleteInputProps, name: 'netlifyhub_panel_title_edit' };
const tokenInputProps = { ...noAutocompleteInputProps, name: 'netlifyhub_netlify_pat_edit' };

const rules: FormRules = {};

const idParam = computed(() => String(route.params.id ?? ''));

async function load(id: string) {
  loading.value = true;
  accountId.value = null;
  model.title = '';
  model.apiToken = '';
  try {
    const { data } = await http.get<{ account: LinkedNetlifyAccount }>(
      `/v1/netlify-accounts/${id}`
    );
    accountId.value = data.account.id;
    model.title = data.account.label ?? '';
  } catch (e) {
    if (isAxiosError(e) && e.response?.status === 404) {
      message.warning(t('netlifyAccountEdit.notFound'));
      void router.replace({ name: 'netlifyAccountsList' });
      return;
    }
    message.error(t('netlifyAccountEdit.loadError'));
    void router.replace({ name: 'netlifyAccountsList' });
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (idParam.value) void load(idParam.value);
});

watch(idParam, (id) => {
  if (id) void load(id);
});

function goList() {
  void router.push({ name: 'netlifyAccountsList' });
}

/** `n-form` renders a native `<form>`; its default `onSubmit` only calls `preventDefault()`. */
function handleNativeFormSubmit(e: Event) {
  e.preventDefault();
  void onSubmit();
}

async function onSubmit() {
  await formRef.value?.validate();
  const id = accountId.value;
  if (!id) return;

  const titleTrim = model.title.trim();
  const tokenTrim = model.apiToken.trim();
  const payload: { title?: string | null; apiToken?: string } = {
    title: titleTrim || null,
  };
  if (tokenTrim) payload.apiToken = tokenTrim;

  submitting.value = true;
  try {
    await http.patch<{ account: LinkedNetlifyAccount }>(`/v1/netlify-accounts/${id}`, payload);
    message.success(t('netlifyAccountEdit.saved'));
    model.apiToken = '';
    void router.push({ name: 'netlifyAccountDetail', params: { id } });
  } catch (e) {
    if (isAxiosError(e)) {
      const msg =
        typeof e.response?.data === 'object' &&
        e.response?.data !== null &&
        'message' in e.response.data &&
        typeof (e.response.data as { message: unknown }).message === 'string'
          ? (e.response.data as { message: string }).message
          : t('netlifyAccountEdit.saveError');
      message.error(msg);
      return;
    }
    message.error(t('netlifyAccountEdit.saveError'));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <n-space vertical size="large" style="max-width: 560px">
    <div>
      <n-button quaternary size="small" @click="goList">
        <template #icon>
          <n-icon :component="ArrowBackOutline" />
        </template>
        {{ t('netlifyAccountEdit.backToList') }}
      </n-button>
    </div>

    <n-spin :show="loading">
      <template v-if="accountId">
        <div>
          <n-h2>{{ t('netlifyAccountEdit.title') }}</n-h2>
          <n-p depth="3">{{ t('netlifyAccountEdit.subtitle') }}</n-p>
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
            <n-form-item path="apiToken" :label="t('netlifyAccountEdit.apiTokenOptional')">
              <n-input
                v-model:value="model.apiToken"
                type="password"
                show-password-on="click"
                :placeholder="t('netlifyAccountEdit.apiTokenPlaceholder')"
                :input-props="tokenInputProps"
              />
            </n-form-item>
            <n-button type="primary" attr-type="submit" :loading="submitting">
              {{ t('netlifyAccountEdit.save') }}
            </n-button>
          </n-form>
        </n-card>
      </template>
    </n-spin>
  </n-space>
</template>
