<script lang="ts" setup>
// 首页重定向到日志页面
navigateTo('/logs', { replace: true })
</script>

<template>
  <div class="flex items-center justify-center h-64">
    <UIcon class="w-8 h-8 animate-spin text-neutral-400" name="i-heroicons-arrow-path" />
  </div>
</template>
