<script lang="ts" setup>
const toast = useToast()
const config = ref<PromptsConfig | null>(null)
const saving = ref(false)

const { data } = await useFetch('/api/config/prompts')
if (data.value?.success) {
  config.value = data.value.data
}

const constraintsText = computed({
  get: () => config.value?.system.constraints.join('\n') || '',
  set: (val: string) => {
    if (config.value) {
      config.value.system.constraints = val.split('\n')
    }
  },
})

async function handleSave() {
  if (!config.value) return
  saving.value = true

  try {
    const res = await $fetch('/api/config/prompts', {
      method: 'PUT',
      body: config.value,
    })
    if (res.success) {
      toast.add({ title: '配置已保存', color: 'success' })
    } else {
      toast.add({ title: '保存失败', color: 'error' })
    }
  } catch {
    toast.add({ title: '保存失败', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold text-neutral-900 dark:text-white mb-6">提示词配置</h1>

    <div v-if="!config" class="text-neutral-500 dark:text-neutral-400">加载中...</div>

    <div v-else class="space-y-6">
      <UCard>
        <template #header>
          <h3 class="font-semibold">系统提示词</h3>
        </template>

        <div class="space-y-4">
          <UFormField label="基础提示词">
            <UTextarea
              v-model="config.system.base"
              :rows="8"
              class="w-full"
              placeholder="机器人的基本人设和行为..."
              size="lg"
            />
            <template #hint>机器人的基本人设、性格和行为方式</template>
          </UFormField>

          <UFormField label="约束条件">
            <UTextarea
              v-model="constraintsText"
              :rows="6"
              class="w-full"
              placeholder="每行一条约束条件..."
              size="lg"
            />
            <template #hint>每行一条，用于限制机器人的行为边界</template>
          </UFormField>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="font-semibold">压缩设置</h3>
        </template>

        <UFormField label="压缩指令">
          <UTextarea
            v-model="config.compression.instruction"
            :rows="4"
            class="w-full"
            placeholder="指导 AI 如何压缩对话历史..."
            size="lg"
          />
          <template #hint>指导 AI 如何压缩总结</template>
        </UFormField>
      </UCard>

      <UButton class="cursor-pointer" :loading="saving" size="lg" @click="handleSave">
        <UIcon class="w-5 h-5" name="i-heroicons-check" />
        {{ saving ? '保存中...' : '保存配置' }}
      </UButton>
    </div>
  </div>
</template>
