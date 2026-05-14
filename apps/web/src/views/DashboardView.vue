<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <n-space vertical size="large">
    <div>
      <n-h2>{{ t('dashboard.title') }}</n-h2>
      <n-p depth="3">{{ t('dashboard.placeholder') }}</n-p>
    </div>
    <n-grid cols="1 s:2 m:3" responsive="screen" :x-gap="16" :y-gap="16">
      <n-gi>
        <n-card :title="t('dashboard.cardAccounts')" size="small">
          <n-statistic tabular-nums value="—" />
        </n-card>
      </n-gi>
      <n-gi>
        <n-card :title="t('dashboard.cardDeploys')" size="small">
          <n-statistic tabular-nums value="—" />
        </n-card>
      </n-gi>
      <n-gi>
        <n-card :title="t('dashboard.cardSync')" size="small">
          <n-tag type="warning" round>{{ t('common.loading') }}</n-tag>
        </n-card>
      </n-gi>
    </n-grid>
  </n-space>
</template>
