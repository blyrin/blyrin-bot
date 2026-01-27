<script lang="ts" setup>
const toast = useToast()

interface ImportResult {
  success: boolean
  message: string
  details?: Record<string, unknown>
}

const configExporting = ref(false)
const configImporting = ref(false)
const contextExporting = ref(false)
const contextImporting = ref(false)
const result = ref<ImportResult | null>(null)

const configFileRef = useTemplateRef<HTMLInputElement>('configFileRef')
const contextFileRef = useTemplateRef<HTMLInputElement>('contextFileRef')

async function handleExportConfig() {
  configExporting.value = true
  result.value = null

  try {
    const res = await $fetch('/api/config/export')

    if (res.success) {
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bot-config-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      result.value = { success: true, message: '配置导出成功' }
    } else {
      result.value = { success: false, message: '导出失败' }
    }
  } catch {
    result.value = { success: false, message: '导出配置时发生错误' }
  } finally {
    configExporting.value = false
  }
}

async function handleImportConfig(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  configImporting.value = true
  result.value = null

  try {
    const text = await file.text()
    const importData = JSON.parse(text)

    const res = await $fetch('/api/config/import', {
      method: 'POST',
      body: importData,
    })

    if (res.success) {
      const successCount = Object.values(res.data as Record<string, boolean>).filter(Boolean).length
      const totalCount = Object.keys(res.data).length
      result.value = {
        success: true,
        message: `配置导入成功 (${successCount}/${totalCount} 项)`,
        details: res.data,
      }
    } else {
      result.value = { success: false, message: '导入失败' }
    }
  } catch {
    result.value = { success: false, message: '导入配置时发生错误，请检查文件格式' }
  } finally {
    configImporting.value = false
    if (configFileRef.value) {
      configFileRef.value.value = ''
    }
  }
}

async function handleExportContext() {
  contextExporting.value = true
  result.value = null

  try {
    const res = await $fetch('/api/contexts/export')

    if (res.success) {
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bot-contexts-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      result.value = {
        success: true,
        message: `上下文导出成功 (${res.data.groups?.length || 0} 个群组)`,
      }
    } else {
      result.value = { success: false, message: '导出失败' }
    }
  } catch {
    result.value = { success: false, message: '导出上下文时发生错误' }
  } finally {
    contextExporting.value = false
  }
}

async function handleImportContext(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  contextImporting.value = true
  result.value = null

  try {
    const text = await file.text()
    const importData = JSON.parse(text)

    const res = await $fetch('/api/contexts/import', {
      method: 'POST',
      body: importData,
    })

    if (res.success) {
      const groupCount = Object.keys(res.data).length
      let contextCount = 0
      let memoryCount = 0
      let userCount = 0

      for (const r of Object.values(res.data) as { context: boolean; memory: boolean; users: number }[]) {
        if (r.context) contextCount++
        if (r.memory) memoryCount++
        userCount += r.users
      }

      result.value = {
        success: true,
        message: `上下文导入成功: ${groupCount} 个群组, ${contextCount} 个对话, ${memoryCount} 个记忆, ${userCount} 个用户档案`,
        details: res.data,
      }
    } else {
      result.value = { success: false, message: '导入失败' }
    }
  } catch {
    result.value = { success: false, message: '导入上下文时发生错误，请检查文件格式' }
  } finally {
    contextImporting.value = false
    if (contextFileRef.value) {
      contextFileRef.value.value = ''
    }
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold text-neutral-900 dark:text-white mb-6">数据管理</h1>

    <div
      v-if="result"
      :class="result.success ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'"
      class="mb-6 p-4 border rounded-md flex items-start gap-3"
    >
      <UIcon
        :name="result.success ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
        class="w-5 h-5 shrink-0 mt-0.5"
      />
      <div class="min-w-0 flex-1">
        <p class="font-medium">{{ result.message }}</p>
        <pre v-if="result.details"
             class="mt-2 text-xs bg-white/50 dark:bg-black/20 p-2 rounded overflow-auto max-h-32">{{
            JSON.stringify(result.details, null, 2)
          }}</pre>
      </div>
    </div>

    <div class="grid gap-6 md:grid-cols-2">
      <UCard>
        <template #header>
          <h3 class="font-semibold">配置数据</h3>
        </template>

        <div class="space-y-4">
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            导出或导入机器人配置，包括 AI 设置、群组设置、提示词和工具配置。
          </p>

          <div class="flex flex-col sm:flex-row gap-3">
            <UButton class="cursor-pointer" :loading="configExporting" size="lg" @click="handleExportConfig">
              <UIcon class="w-5 h-5" name="i-heroicons-arrow-down-tray" />
              {{ configExporting ? '导出中...' : '导出配置' }}
            </UButton>

            <UButton class="cursor-pointer" :loading="configImporting" size="lg" variant="soft" @click="configFileRef?.click()">
              <UIcon class="w-5 h-5" name="i-heroicons-arrow-up-tray" />
              {{ configImporting ? '导入中...' : '导入配置' }}
            </UButton>
            <input
              ref="configFileRef"
              accept=".json"
              style="display: none"
              type="file"
              @change="handleImportConfig"
            >
          </div>

          <UAlert
            color="warning"
            description="导入配置会覆盖现有设置。建议在导入前先导出当前配置作为备份。"
            icon="i-heroicons-exclamation-triangle"
            variant="soft"
          />
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="font-semibold">上下文数据</h3>
        </template>

        <div class="space-y-4">
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            导出或导入对话上下文，包括聊天记录、压缩记忆和群友档案。
          </p>

          <div class="flex flex-col sm:flex-row gap-3">
            <UButton class="cursor-pointer" :loading="contextExporting" size="lg" @click="handleExportContext">
              <UIcon class="w-5 h-5" name="i-heroicons-arrow-down-tray" />
              {{ contextExporting ? '导出中...' : '导出上下文' }}
            </UButton>

            <UButton class="cursor-pointer" :loading="contextImporting" size="lg" variant="soft" @click="contextFileRef?.click()">
              <UIcon class="w-5 h-5" name="i-heroicons-arrow-up-tray" />
              {{ contextImporting ? '导入中...' : '导入上下文' }}
            </UButton>
            <input
              ref="contextFileRef"
              accept=".json"
              style="display: none"
              type="file"
              @change="handleImportContext"
            >
          </div>

          <UAlert
            color="warning"
            description="导入上下文会覆盖相同群组的现有数据。不同群组的数据不受影响。"
            icon="i-heroicons-exclamation-triangle"
            variant="soft"
          />
        </div>
      </UCard>
    </div>
  </div>
</template>
