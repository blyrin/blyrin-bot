<script lang="ts" setup>
const toast = useToast()
const config = ref<BotConfig | null>(null)
const saving = ref(false)

const { data } = await useFetch('/api/config/bot')
if (data.value?.success) {
  config.value = data.value.data
}

async function handleSave() {
  if (!config.value) return
  saving.value = true

  try {
    const res = await $fetch('/api/config/bot', {
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
    <h1 class="text-2xl font-bold text-neutral-900 dark:text-white mb-6">机器人配置</h1>

    <div v-if="!config" class="text-neutral-500 dark:text-neutral-400">加载中...</div>

    <div v-else class="space-y-6">
      <UCard>
        <template #header>
          <h3 class="font-semibold">连接设置</h3>
        </template>

        <div class="space-y-4">
          <UFormField label="WebSocket 地址">
            <UInput
              v-model="config.connection.url"
              class="w-full"
              placeholder="ws://127.0.0.1:3001"
              size="lg"
            />
            <template #hint>NapCat 服务地址</template>
          </UFormField>

          <UFormField label="Token">
            <UInput
              v-model="config.connection.token"
              class="w-full"
              placeholder="连接认证 Token"
              size="lg"
              type="password"
            />
            <template #hint>留空表示无需认证</template>
          </UFormField>

          <UFormField label="重连间隔（秒）">
            <UInput
              v-model.number="config.connection.reconnectInterval"
              :max="60000"
              :min="1000"
              :step="1000"
              class="w-full"
              size="lg"
              type="number"
            />
            <template #hint>断开后多久重新连接（毫秒）</template>
          </UFormField>

          <UFormField label="最大重连次数">
            <UInput
              v-model.number="config.connection.maxReconnectAttempts"
              :max="100"
              :min="1"
              class="w-full"
              size="lg"
              type="number"
            />
            <template #hint>设为 0 无限重试</template>
          </UFormField>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="font-semibold">行为设置</h3>
        </template>

        <div class="space-y-4">
          <UFormField label="最小回复延迟（毫秒）">
            <UInput
              v-model.number="config.behavior.replyDelayMin"
              :min="0"
              class="w-full"
              size="lg"
              type="number"
            />
            <template #hint>最少等待多久再回复</template>
          </UFormField>

          <UFormField label="最大回复延迟（毫秒）">
            <UInput
              v-model.number="config.behavior.replyDelayMax"
              :min="0"
              class="w-full"
              size="lg"
              type="number"
            />
            <template #hint>最多等待多久再回复</template>
          </UFormField>
        </div>
      </UCard>

      <UButton class="cursor-pointer" :loading="saving" size="lg" @click="handleSave">
        <UIcon class="w-5 h-5" name="i-heroicons-check" />
        {{ saving ? '保存中...' : '保存配置' }}
      </UButton>
    </div>
  </div>
</template>
