<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { FormInst, FormRules } from 'naive-ui';
import { useMessage } from 'naive-ui';
import { useAuthStore } from '@/stores/auth';
import { useAppTheme } from '@/composables/useAppTheme';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const message = useMessage();
const { naiveTheme } = useAppTheme();
const formRef = ref<FormInst | null>(null);
const loading = ref(false);

const isDarkUi = computed(() => naiveTheme.value !== null);

const model = reactive({
  username: '',
  password: '',
});

const rules: FormRules = {
  username: [{ required: true, message: () => t('profile.rules.username'), trigger: 'blur' }],
  password: [
    { required: true, message: () => t('profile.rules.passwordMin'), trigger: 'blur' },
    { min: 1, message: () => t('profile.rules.passwordMin'), trigger: 'blur' },
  ],
};

async function submit() {
  await formRef.value?.validate();
  loading.value = true;
  try {
    await auth.login(model.username, model.password);
    const redirect = (route.query.redirect as string) || '/';
    void router.push(redirect);
  } catch {
    message.error(t('auth.error'));
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="page" :class="{ 'page--dark': isDarkUi, 'page--light': !isDarkUi }">
    <n-card
      class="card"
      :title="t('auth.loginTitle')"
      :segmented="{ content: true, footer: 'soft' }"
    >
      <template #header-extra>
        <n-text depth="3">{{ t('app.title') }}</n-text>
      </template>
      <n-p depth="3">{{ t('auth.loginSubtitle') }}</n-p>
      <n-form ref="formRef" :model="model" :rules="rules" size="large" @submit.prevent="submit">
        <n-form-item path="username" :label="t('auth.username')">
          <n-input v-model:value="model.username" autocomplete="username" />
        </n-form-item>
        <n-form-item path="password" :label="t('auth.password')">
          <n-input
            v-model:value="model.password"
            type="password"
            show-password-on="click"
            autocomplete="current-password"
            @keyup.enter="submit"
          />
        </n-form-item>
        <n-button type="primary" block size="large" :loading="loading" attr-type="submit">
          {{ t('auth.login') }}
        </n-button>
      </n-form>
    </n-card>
  </div>
</template>

<style scoped>
.page {
  box-sizing: border-box;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.page--dark {
  background: #1b2433;
}
.page--light {
  background: #e8ecf4;
}
.card {
  width: min(420px, 100%);
  border-radius: 14px;
}
</style>
