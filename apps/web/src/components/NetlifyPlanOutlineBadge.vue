<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  planName: string;
}>();

type PlanVariant = 'free' | 'starter' | 'pro' | 'default';

const variant = computed((): PlanVariant => {
  const n = props.planName.trim().toLowerCase();
  if (n === 'free' || n.includes('credit-free')) return 'free';
  if (n === 'starter') return 'starter';
  if (n.includes('pro')) return 'pro';
  return 'default';
});
</script>

<template>
  <span class="plan-badge" :class="`plan-badge--${variant}`">{{ planName }}</span>
</template>

<style scoped>
.plan-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.4;
  border: 1px solid currentColor;
  white-space: nowrap;
}

.plan-badge--free {
  color: #3b82f6;
  border-color: rgba(59, 130, 246, 0.65);
  background: rgba(59, 130, 246, 0.1);
}

.plan-badge--starter {
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.65);
  background: rgba(34, 197, 94, 0.1);
}

.plan-badge--pro {
  color: #d4a017;
  border-color: rgba(212, 160, 23, 0.7);
  background: rgba(212, 160, 23, 0.12);
}

.plan-badge--default {
  color: var(--n-text-color-1);
  border-color: rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.06);
}

:root:not(.dark) .plan-badge--default {
  border-color: rgba(15, 23, 42, 0.25);
  background: rgba(15, 23, 42, 0.04);
}
</style>
