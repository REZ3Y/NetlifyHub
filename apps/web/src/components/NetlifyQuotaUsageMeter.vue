<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  label: string;
  used: number;
  included: number;
}>();

const ratio = computed(() => {
  if (!Number.isFinite(props.included) || props.included <= 0) return 0;
  const r = props.used / props.included;
  return Math.min(1, Math.max(0, r));
});

const fillWidth = computed(() => `${Math.round(ratio.value * 1000) / 10}%`);

const fillColor = computed(() => {
  const r = ratio.value;
  const hue = (1 - r) * 120;
  return `hsl(${hue}, 72%, 42%)`;
});
</script>

<template>
  <div class="quota-meter" role="meter" :aria-valuenow="used" :aria-valuemax="included">
    <div class="quota-meter__fill" :style="{ width: fillWidth, backgroundColor: fillColor }" />
    <span class="quota-meter__label">{{ label }}</span>
  </div>
</template>

<style scoped>
.quota-meter {
  position: relative;
  min-width: 120px;
  max-width: 200px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid var(--n-border-color);
  background: var(--n-color-modal);
  overflow: hidden;
}

.quota-meter__fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px 0 0 999px;
  opacity: 0.55;
  transition:
    width 0.35s ease,
    background-color 0.35s ease;
}

.quota-meter__label {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 0 10px;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  color: var(--n-text-color-1);
  text-shadow: 0 0 6px rgba(0, 0, 0, 0.35);
}

:root:not(.dark) .quota-meter__label {
  text-shadow: 0 0 4px rgba(255, 255, 255, 0.85);
}
</style>
