<script lang="ts" setup>
interface LogEntry {
  id: string
  level: 'debug' | 'info' | 'warn' | 'error'
  category: string
  message: string
  timestamp: number
  data?: Record<string, unknown>
}

const logs = ref<LogEntry[]>([])
const paused = ref(false)
const filter = ref('all')
const reconnecting = ref(false)
const containerRef = useTemplateRef<HTMLDivElement>('containerRef')

let eventSource: EventSource | null = null

const levelColors: Record<string, string> = {
  debug: 'text-neutral-600 dark:text-neutral-400',
  info: 'text-blue-700 dark:text-blue-400',
  warn: 'text-yellow-700 dark:text-yellow-400',
  error: 'text-red-700 dark:text-red-400',
}

const levelBgColors: Record<string, string> = {
  debug: 'bg-neutral-100 dark:bg-neutral-800',
  info: 'bg-blue-100 dark:bg-blue-900/50',
  warn: 'bg-yellow-100 dark:bg-yellow-900/50',
  error: 'bg-red-100 dark:bg-red-900/50',
}

const filterOptions = [
  { label: '全部', value: 'all' },
  { label: 'Debug', value: 'debug' },
  { label: 'Info', value: 'info' },
  { label: 'Warn', value: 'warn' },
  { label: 'Error', value: 'error' },
]

const filteredLogs = computed(() => {
  if (filter.value === 'all') return logs.value
  return logs.value.filter(log => log.level === filter.value)
})

function connectSSE() {
  if (eventSource) {
    eventSource.close()
  }

  eventSource = new EventSource('/api/logs/stream')

  eventSource.onmessage = (event) => {
    try {
      const entry = JSON.parse(event.data) as LogEntry
      logs.value.push(entry)
      // 保留最近 500 条
      if (logs.value.length > 500) {
        logs.value = logs.value.slice(-500)
      }
      if (!paused.value && isAtBottom.value) {
        scrollToBottom()
      }
    } catch (err) {
      console.error('解析日志失败:', err)
    }
  }

  eventSource.onerror = () => {
    console.error('SSE 连接错误，正在重连...')
    eventSource?.close()
    // 延迟重连
    setTimeout(() => {
      if (!paused.value) {
        connectSSE()
      }
    }, 3000)
  }
}

function disconnectSSE() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}

watch(paused, (isPaused) => {
  if (isPaused) {
    disconnectSSE()
  } else {
    connectSSE()
  }
})

function scrollToBottom() {
  nextTick(() => {
    if (containerRef.value) {
      containerRef.value.scrollTop = containerRef.value.scrollHeight
    }
  })
}

// 跟踪是否在底部
const isAtBottom = ref(true)

function checkIfAtBottom() {
  if (!containerRef.value) return
  const { scrollTop, scrollHeight, clientHeight } = containerRef.value
  // 允许 10px 的误差
  isAtBottom.value = scrollHeight - scrollTop - clientHeight < 10
}

onMounted(() => {
  connectSSE()
})

onUnmounted(() => {
  disconnectSSE()
})

async function handleClear() {
  try {
    await $fetch('/api/logs', { method: 'DELETE' })
    logs.value = []
  } catch (err) {
    console.error('清空日志失败:', err)
  }
}

async function handleReconnect() {
  if (reconnecting.value) return
  reconnecting.value = true
  try {
    await $fetch('/api/bot/reconnect', { method: 'POST' })
  } catch (err) {
    console.error('重连失败:', err)
  } finally {
    reconnecting.value = false
  }
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN')
}

function formatData(data?: Record<string, unknown>) {
  if (!data) return null
  return JSON.stringify(data, null, 2)
}
</script>

<template>
  <div>
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <h1 class="text-2xl font-bold text-neutral-900 dark:text-white">
        日志 - {{ filteredLogs.length }}条
        <span v-if="paused" class="ml-2 text-yellow-600 dark:text-yellow-400">(已暂停)</span>
      </h1>
      <div class="flex flex-wrap items-center gap-2">
        <USelect v-model="filter" :items="filterOptions" value-key="value" class="w-full md:w-36 mb-2 md:mb-0" size="lg" />
        <UButton
          class="cursor-pointer"
          :loading="reconnecting"
          size="lg"
          @click="handleReconnect"
        >
          <UIcon :class="{ 'animate-spin': reconnecting }" class="w-5 h-5" name="i-heroicons-arrow-path" />
          {{ reconnecting ? '重连中...' : '重连' }}
        </UButton>
        <UButton class="cursor-pointer" size="lg" variant="soft" @click="paused = !paused">
          <UIcon :name="paused ? 'i-heroicons-play' : 'i-heroicons-pause'" class="w-5 h-5" />
          {{ paused ? '继续' : '暂停' }}
        </UButton>
        <UButton class="cursor-pointer" size="lg" variant="soft" @click="handleClear">
          <UIcon class="w-5 h-5" name="i-heroicons-trash" />
          清空
        </UButton>
      </div>
    </div>

    <div
      ref="containerRef"
      class="h-[calc(100vh-270px)] md:h-[calc(100vh-120px)] overflow-y-auto bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 font-mono text-xs"
      @scroll="checkIfAtBottom"
    >
      <div v-if="filteredLogs.length === 0" class="text-neutral-500 dark:text-neutral-400 text-center py-8">
        暂无日志
      </div>
      <div v-else>
        <div v-for="log in filteredLogs" :key="log.id" class="last:mb-0">
          <div class="flex items-start gap-2 flex-wrap">
            <span class="text-neutral-500 dark:text-neutral-400 shrink-0">{{ formatTime(log.timestamp) }}</span>
            <span
              :class="[levelBgColors[log.level], levelColors[log.level]]"
              class="px-1 rounded-sm text-xs font-medium shrink-0"
            >
              {{ log.level.toUpperCase() }}
            </span>
            <span class="text-secondary-600 dark:text-secondary-400 shrink-0">[{{ log.category }}]</span>
            <span class="text-neutral-900 dark:text-neutral-100 break-all">{{ log.message }}</span>
          </div>
          <pre
            v-if="log.data"
            class="text-xs text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap break-all">{{ formatData(log.data) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
