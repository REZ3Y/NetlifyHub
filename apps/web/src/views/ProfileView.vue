<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FormInst, FormRules } from 'naive-ui';
import { useMessage } from 'naive-ui';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { http } from '@/api/http';
import { listIanaTimeZones, useUserDateTime } from '@/composables/useUserDateTime';
import type { AuthUser } from '@/types/auth';

const { t } = useI18n();
const message = useMessage();
const auth = useAuthStore();
const router = useRouter();
const { formatDateTime } = useUserDateTime();

const profileForm = ref<FormInst | null>(null);
const passwordForm = ref<FormInst | null>(null);
const savingProfile = ref(false);
const savingPassword = ref(false);
const savingTimezone = ref(false);

const profileModel = reactive({
  username: '',
  timezone: 'UTC',
});

const timezoneOptions = computed(() =>
  listIanaTimeZones().map((value) => ({ label: value, value }))
);

const passwordModel = reactive({
  currentPassword: '',
  newPassword: '',
});

const profileRules: FormRules = {
  username: [{ required: true, message: () => t('profile.rules.username'), trigger: 'blur' }],
};

const passwordRules: FormRules = {
  currentPassword: [
    { required: true, message: () => t('profile.rules.currentRequired'), trigger: 'blur' },
  ],
  newPassword: [
    { required: true, message: () => t('profile.rules.passwordMin'), trigger: 'blur' },
    { min: 8, message: () => t('profile.rules.passwordMin'), trigger: 'blur' },
  ],
};

onMounted(async () => {
  await auth.fetchMe();
  if (auth.user) {
    profileModel.username = auth.user.username;
    profileModel.timezone = auth.user.timezone ?? 'UTC';
  }
});

async function saveUsername() {
  await profileForm.value?.validate();
  savingProfile.value = true;
  try {
    const { data } = await http.patch<{ user: AuthUser }>('/v1/me', {
      username: profileModel.username,
    });
    auth.setUser(data.user);
    profileModel.timezone = data.user.timezone ?? profileModel.timezone;
    message.success(t('profile.saved'));
  } finally {
    savingProfile.value = false;
  }
}

async function saveTimezone() {
  savingTimezone.value = true;
  try {
    const { data } = await http.patch<{ user: AuthUser }>('/v1/me', {
      timezone: profileModel.timezone,
    });
    auth.setUser(data.user);
    message.success(t('profile.saved'));
  } finally {
    savingTimezone.value = false;
  }
}

async function savePassword() {
  await passwordForm.value?.validate();
  savingPassword.value = true;
  try {
    const { data } = await http.patch<{ mustReauth?: boolean; user?: AuthUser }>('/v1/me', {
      currentPassword: passwordModel.currentPassword,
      newPassword: passwordModel.newPassword,
    });
    passwordModel.currentPassword = '';
    passwordModel.newPassword = '';
    if (data.mustReauth) {
      message.warning(t('profile.reauth'));
      auth.setUser(null);
      void router.push({ name: 'login' });
      return;
    }
    if (data.user) auth.setUser(data.user);
    message.success(t('profile.saved'));
  } finally {
    savingPassword.value = false;
  }
}
</script>

<template>
  <n-space vertical size="large" style="max-width: 520px">
    <n-h2>{{ t('profile.title') }}</n-h2>

    <n-card :title="t('profile.username')" :segmented="{ content: true }">
      <n-form ref="profileForm" :model="profileModel" :rules="profileRules" label-placement="top">
        <n-form-item path="username" :label="t('profile.username')">
          <n-input v-model:value="profileModel.username" autocomplete="username" />
        </n-form-item>
        <n-text v-if="auth.user?.createdAt" depth="3" style="display: block; margin-bottom: 12px">
          {{ t('profile.memberSince') }}: {{ formatDateTime(auth.user.createdAt) }}
        </n-text>
        <n-button type="primary" :loading="savingProfile" @click="saveUsername">
          {{ t('profile.saveUsername') }}
        </n-button>
      </n-form>
    </n-card>

    <n-card :title="t('profile.timezone')" :segmented="{ content: true }">
      <n-p depth="3" style="margin-top: 0">{{ t('profile.timezoneHint') }}</n-p>
      <n-form label-placement="top">
        <n-form-item :label="t('profile.timezone')">
          <n-select
            v-model:value="profileModel.timezone"
            filterable
            :options="timezoneOptions"
            :consistent-menu-width="false"
          />
        </n-form-item>
        <n-button type="primary" :loading="savingTimezone" @click="saveTimezone">
          {{ t('profile.saveTimezone') }}
        </n-button>
      </n-form>
    </n-card>

    <n-card :title="t('profile.changePassword')" :segmented="{ content: true }">
      <n-form
        ref="passwordForm"
        :model="passwordModel"
        :rules="passwordRules"
        label-placement="top"
      >
        <n-form-item path="currentPassword" :label="t('profile.currentPassword')">
          <n-input
            v-model:value="passwordModel.currentPassword"
            type="password"
            show-password-on="click"
            autocomplete="current-password"
          />
        </n-form-item>
        <n-form-item path="newPassword" :label="t('profile.newPassword')">
          <n-input
            v-model:value="passwordModel.newPassword"
            type="password"
            show-password-on="click"
            autocomplete="new-password"
          />
        </n-form-item>
        <n-button type="primary" :loading="savingPassword" @click="savePassword">
          {{ t('profile.changePassword') }}
        </n-button>
      </n-form>
    </n-card>
  </n-space>
</template>
