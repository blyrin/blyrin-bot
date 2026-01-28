<script lang="ts" setup>
const toast = useToast()
const config = ref<AIConfig | null>(null)
const saving = ref(false)

const { data } = await useFetch('/api/config/ai')
if (data.value?.success) {
  config.value = data.value.data
}

async function handleSave() {
  if (!config.value) return
  saving.value = true

  try {
    const res = await $fetch('/api/config/ai', {
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
    <h1 class="text-2xl font-bold text-neutral-900 dark:text-white mb-6">AI 配置</h1>

    <div v-if="!config" class="text-neutral-500 dark:text-neutral-400">加载中...</div>

    <div v-else class="space-y-6">
      <UCard>
        <template #header>
          <h3 class="font-semibold">API 设置</h3>
        </template>

        <UForm class="space-y-4">
          <UFormField label="API 地址">
            <UInput
              v-model="config.provider.baseUrl"
              class="w-full"
              placeholder="https://api.openai.com/v1"
              size="lg"
            />
          </UFormField>

          <UFormField label="API Key">
            <UInput
              v-model="config.provider.apiKey"
              class="w-full"
              placeholder="sk-..."
              size="lg"
              type="password"
            />
          </UFormField>

          <UFormField label="模型">
            <UInput
              v-model="config.provider.model"
              class="w-full"
              placeholder="gpt-4o-mini"
              size="lg"
            />
          </UFormField>

          <div class="flex items-center justify-between">
            <span>支持图片识别</span>
            <USwitch v-model="config.provider.supportsVision" />
          </div>

          <UFormField label="API 超时时间（毫秒）">
            <UInput
              v-model.number="config.provider.timeout"
              :max="300000"
              :min="10000"
              class="w-full"
              size="lg"
              type="number"
            />
          </UFormField>
        </UForm>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="font-semibold">生成参数</h3>
        </template>

        <UForm class="space-y-4">
          <UFormField label="温度">
            <div class="flex items-center gap-4">
              <USlider
                v-model="config.generation.temperature"
                :max="2"
                :min="0"
                :step="0.05"
                class="flex-1 w-full"
              />
              <span class="text-sm text-neutral-500 dark:text-neutral-400 w-12 text-right">{{ config.generation.temperature }}</span>
            </div>
          </UFormField>

          <UFormField label="最大输出 Token">
            <UInput
              v-model.number="config.generation.maxTokens"
              class="w-full"
              size="lg"
              type="number"
            />
          </UFormField>
        </UForm>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="font-semibold">上下文设置</h3>
        </template>

        <UForm class="space-y-4">
          <UFormField label="最大消息数">
            <UInput
              v-model.number="config.context.maxMessages"
              class="w-full"
              size="lg"
              type="number"
            />
          </UFormField>

          <UFormField label="压缩阈值">
            <UInput
              v-model.number="config.context.compressionThreshold"
              class="w-full"
              size="lg"
              type="number"
            />
          </UFormField>
        </UForm>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="font-semibold">压缩设置</h3>
        </template>

        <UForm class="space-y-4">
          <UFormField label="压缩用模型">
            <UInput
              v-model="config.compression.model"
              class="w-full"
              placeholder="gpt-4o-mini"
              size="lg"
            />
          </UFormField>

          <UFormField label="压缩最大输出 Token">
            <UInput
              v-model.number="config.compression.maxTokens"
              class="w-full"
              size="lg"
              type="number"
            />
          </UFormField>
        </UForm>
      </UCard>

      <UButton class="cursor-pointer" :loading="saving" size="lg" @click="handleSave">
        <UIcon class="w-5 h-5" name="i-heroicons-check" />
        {{ saving ? '保存中...' : '保存配置' }}
      </UButton>
    </div>
  </div>
</template>
