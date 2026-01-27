<script lang="ts" setup>
const props = defineProps<{
  title: string
  description: string
  variant?: 'default' | 'destructive'
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  confirm: []
}>()

function handleConfirm() {
  emit('confirm')
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="title">
    <template #body>
      <div class="flex items-start gap-3">
        <div
          :class="variant === 'destructive' ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800' : 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800'"
          class="rounded-md border w-9 h-9 flex justify-center items-center"
        >
          <UIcon
            :class="variant === 'destructive' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'"
            class="w-5 h-5"
            name="i-heroicons-exclamation-triangle"
          />
        </div>
        <div class="flex-1">
          <p class="text-sm text-neutral-600 dark:text-neutral-400">{{ description }}</p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex gap-2">
        <UButton
          :color="variant === 'destructive' ? 'error' : 'primary'"
          class="cursor-pointer"
          @click="handleConfirm"
        >
          确认
        </UButton>
        <UButton class="cursor-pointer" variant="soft" @click="open = false">取消</UButton>
      </div>
    </template>
  </UModal>
</template>
