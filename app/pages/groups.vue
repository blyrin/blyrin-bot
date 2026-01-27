<script lang="ts" setup>
const toast = useToast()
const config = ref<GroupsConfig | null>(null)
const newGroupId = ref('')
const editingGroup = ref<number | null>(null)
const editModalOpen = ref(false)
const editSettings = ref<GroupSettings | null>(null)

// 确认弹窗状态
const confirmOpen = ref(false)
const pendingRemoveGroupId = ref<number | null>(null)

// 上下文相关状态
interface ContextDetail {
  context: {
    groupId: number
    messages: ChatMessage[]
    lastUpdated: number
  }
  memory: {
    groupId: number
    summary: string
    lastCompressed: number
  } | null
}

interface UserSummary {
  userId: number
  nickname: string
  nicknames: string[]
  messageCount: number
  lastSeen: number
}

const expandedGroup = ref<number | null>(null)
const contextDetail = ref<ContextDetail | null>(null)
const users = ref<UserSummary[]>([])
const selectedUser = ref<UserMemory | null>(null)
const userSlideoverOpen = ref(false)
const activeTab = ref<'messages' | 'users'>('messages')
const messagesContainerRefs = ref<Record<number, HTMLDivElement | null>>({})

function scrollMessagesToBottom() {
  nextTick(() => {
    if (!expandedGroup.value) return
    const ele = messagesContainerRefs.value[expandedGroup.value]
    if (ele) {
      ele.scrollTop = ele.scrollHeight
    }
  })
}

const confirmConfig = ref({
  title: '',
  description: '',
  variant: 'default' as 'default' | 'destructive',
  onConfirm: () => {
  },
})

async function fetchConfig() {
  try {
    const res = await $fetch('/api/config/groups')
    if (res.success) {
      config.value = res.data
    }
  } catch (err) {
    console.error('获取配置失败:', err)
  }
}

onMounted(() => {
  fetchConfig()
})

async function handleAddGroup() {
  const groupId = parseInt(newGroupId.value, 10)
  if (isNaN(groupId)) return

  try {
    await $fetch('/api/groups/whitelist', {
      method: 'POST',
      body: { groupId },
    })
    newGroupId.value = ''
    await fetchConfig()
    toast.add({ title: '群已添加', color: 'success' })
  } catch {
    toast.add({ title: '添加失败', color: 'error' })
  }
}

function showRemoveConfirm(groupId: number) {
  pendingRemoveGroupId.value = groupId
  confirmOpen.value = true
}

async function handleRemoveGroup() {
  if (!pendingRemoveGroupId.value) return

  try {
    await $fetch(`/api/groups/whitelist/${pendingRemoveGroupId.value}`, {
      method: 'DELETE',
    })
    await fetchConfig()
    toast.add({ title: '群已移除', color: 'success' })
  } catch {
    toast.add({ title: '移除失败', color: 'error' })
  } finally {
    pendingRemoveGroupId.value = null
  }
}

function handleEditGroup(groupId: number) {
  if (!config.value) return
  const settings = config.value.groups[String(groupId)] || {
    enabled: true,
    ...config.value.defaults,
  }
  editingGroup.value = groupId
  editSettings.value = { ...settings }
  editModalOpen.value = true
}

async function handleSaveSettings() {
  if (!editingGroup.value || !editSettings.value) return

  try {
    await $fetch(`/api/groups/${editingGroup.value}/settings`, {
      method: 'PUT',
      body: editSettings.value,
    })
    editModalOpen.value = false
    setTimeout(() => {
      editingGroup.value = null
      editSettings.value = null
    }, 300)
    await fetchConfig()
    toast.add({ title: '设置已保存', color: 'success' })
  } catch {
    toast.add({ title: '保存失败', color: 'error' })
  }
}

function closeModal() {
  editModalOpen.value = false
  setTimeout(() => {
    editingGroup.value = null
    editSettings.value = null
  }, 300)
}

// 上下文相关函数
async function handleExpand(groupId: number) {
  if (expandedGroup.value === groupId) {
    expandedGroup.value = null
    contextDetail.value = null
    users.value = []
    return
  }

  try {
    const [contextRes, usersRes] = await Promise.all([
      $fetch(`/api/contexts/${groupId}`),
      $fetch(`/api/users/${groupId}`),
    ])

    if (contextRes.success) {
      contextDetail.value = contextRes.data
    }
    if (usersRes.success) {
      users.value = usersRes.data
    }
    expandedGroup.value = groupId
    activeTab.value = 'messages'
    // 滚动到底部
    scrollMessagesToBottom()
  } catch (err) {
    console.error('获取数据失败:', err)
  }
}

async function handleClear(groupId: number, type: 'context' | 'memory' | 'all') {
  try {
    await $fetch(`/api/contexts/${groupId}?type=${type}`, { method: 'DELETE' })
    if (expandedGroup.value === groupId) {
      const res = await $fetch(`/api/contexts/${groupId}`)
      if (res.success) {
        contextDetail.value = res.data
      }
    }
    toast.add({ title: '清除成功', color: 'success' })
  } catch {
    toast.add({ title: '清除失败', color: 'error' })
  }
}

function showClearConfirm(groupId: number, type: 'context' | 'memory' | 'all') {
  const configs = {
    context: {
      title: '清除对话上下文',
      description: '将清除该群的所有对话记录。机器人将忘记之前的对话内容，但保留对群友的了解。',
    },
    memory: {
      title: '清除压缩记忆',
      description: '将清除该群的压缩记忆摘要。这是对话历史的长期总结，清除后机器人将失去对早期对话的记忆。',
    },
    all: {
      title: '清除全部数据',
      description: '将清除该群的所有对话上下文和压缩记忆。机器人将完全忘记与该群的所有对话。',
    },
  }

  confirmConfig.value = {
    title: configs[type].title,
    description: configs[type].description,
    variant: type === 'all' ? 'destructive' : 'default',
    onConfirm: () => {
      handleClear(groupId, type)
      confirmOpen.value = false
    },
  }
  confirmOpen.value = true
}

async function handleUserClick(groupId: number, userId: number) {
  try {
    const res = await $fetch(`/api/users/${groupId}/${userId}`)
    if (res.success) {
      selectedUser.value = res.data
      userSlideoverOpen.value = true
    }
  } catch (err) {
    console.error('获取用户信息失败:', err)
  }
}

async function handleDeleteUser(groupId: number, userId: number) {
  userSlideoverOpen.value = false
  confirmConfig.value = {
    title: '删除用户档案',
    description: '将删除该用户的所有记忆数据，包括昵称历史、性格特征、偏好和话题。机器人将不再记得这个用户。',
    variant: 'destructive',
    onConfirm: async () => {
      try {
        await $fetch(`/api/users/${groupId}/${userId}`, { method: 'DELETE' })
        selectedUser.value = null
        userSlideoverOpen.value = false
        const res = await $fetch(`/api/users/${groupId}`)
        if (res.success) {
          users.value = res.data
        }
        toast.add({ title: '用户档案已删除', color: 'success' })
      } catch {
        toast.add({ title: '删除失败', color: 'error' })
      }
      confirmOpen.value = false
    },
  }
  confirmOpen.value = true
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN')
}

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  return `${days}天前`
}

function scrollToMessage(messageId: number) {
  const targetEl = document.getElementById(`msg-${messageId}`)
  if (targetEl) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    targetEl.classList.add('ring-2', 'ring-yellow-400')
    setTimeout(() => {
      targetEl.classList.remove('ring-2', 'ring-yellow-400')
    }, 2000)
  }
}

const clearMenuItems = (groupId: number) => [
  [
    {
      label: '清除对话上下文',
      icon: 'i-heroicons-trash',
      onSelect: () => showClearConfirm(groupId, 'context'),
    },
    {
      label: '清除压缩记忆',
      icon: 'i-heroicons-trash',
      onSelect: () => showClearConfirm(groupId, 'memory'),
    },
  ],
  [
    {
      label: '清除全部',
      icon: 'i-heroicons-trash',
      onSelect: () => showClearConfirm(groupId, 'all'),
    },
  ],
]
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold text-neutral-900 dark:text-white mb-6">群管理</h1>

    <div v-if="!config" class="text-neutral-500 dark:text-neutral-400">加载中...</div>

    <div v-else class="space-y-6">
      <UCard>
        <template #header>
          <h3 class="font-semibold">添加群</h3>
        </template>

        <div class="flex flex-col sm:flex-row gap-4">
          <UInput
            v-model="newGroupId"
            class="w-full sm:max-w-xs"
            placeholder="输入群号"
            size="lg"
          />
          <UButton class="cursor-pointer" size="lg" @click="handleAddGroup">
            <UIcon class="w-5 h-5" name="i-heroicons-plus" />
            添加
          </UButton>
        </div>
      </UCard>

      <UCard v-if="config.whitelist.length === 0">
        <div class="py-8 text-center text-neutral-500 dark:text-neutral-400">暂无群</div>
      </UCard>

      <!-- 群列表 -->
      <UCard v-for="groupId in config.whitelist" :key="groupId">
        <template #header>
          <div class="cursor-pointer" @click="handleExpand(groupId)">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold font-mono">{{ groupId }}</h3>
                <p class="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                  {{ config.groups[String(groupId)]?.enabled === false ? '已禁用' : '已启用' }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <UButton class="cursor-pointer" size="sm" variant="soft" @click.stop="handleEditGroup(groupId)">
                  <UIcon class="w-4 h-4" name="i-heroicons-cog-6-tooth" />
                  设置
                </UButton>
                <UButton class="cursor-pointer" color="error" size="sm" variant="soft" @click.stop="showRemoveConfirm(groupId)">
                  <UIcon class="w-4 h-4" name="i-heroicons-trash" />
                  删除
                </UButton>
                <UIcon
                  :name="expandedGroup === groupId ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                  class="w-5 h-5 text-neutral-400 dark:text-neutral-500 ml-2"
                />
              </div>
            </div>
          </div>
        </template>

        <!-- 展开的上下文内容 -->
        <div v-if="expandedGroup === groupId && contextDetail">
          <!-- 移动端 Tab 切换 -->
          <UTabs
            v-model="activeTab"
            :items="[
              { label: `对话 (${contextDetail.context.messages.length})`, icon: 'i-heroicons-chat-bubble-left-right', value: 'messages' },
              { label: `群友 (${users.length})`, icon: 'i-heroicons-users', value: 'users' },
            ]"
            class="md:hidden mb-4"
          />

          <div class="flex flex-col md:flex-row gap-6">
            <!-- 左侧：对话上下文 -->
            <div :class="{ 'hidden md:block': activeTab === 'users' }" class="flex-1 min-w-0">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                  <UIcon class="w-5 h-5" name="i-heroicons-chat-bubble-left-right" />
                  对话上下文
                  <span v-if="contextDetail.context.lastUpdated" class="text-xs text-neutral-400 dark:text-neutral-500 font-normal">
                    更新于 {{ formatRelativeTime(contextDetail.context.lastUpdated) }}
                  </span>
                </h3>
                <UDropdownMenu :items="clearMenuItems(groupId)">
                  <UButton class="cursor-pointer" size="xs" variant="soft">管理</UButton>
                </UDropdownMenu>
              </div>

              <!-- 压缩记忆 -->
              <div v-if="contextDetail.memory"
                   class="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md">
                <h4 class="font-medium text-blue-900 dark:text-blue-300 mb-1 text-sm">压缩记忆</h4>
                <p class="text-sm text-blue-800 dark:text-blue-200 whitespace-pre-wrap">{{ contextDetail.memory.summary }}</p>
                <p class="text-xs text-blue-600 dark:text-blue-400 mt-2">
                  压缩时间: {{ formatTime(contextDetail.memory.lastCompressed) }}
                </p>
              </div>

              <!-- 消息列表 -->
              <div :ref="(el) => messagesContainerRefs[groupId] = el as HTMLDivElement" class="space-y-2 max-h-120 overflow-y-auto">
                <div v-if="contextDetail.context.messages.length === 0"
                     class="text-sm text-neutral-400 dark:text-neutral-500 text-center py-8">
                  暂无对话记录
                </div>
                <div
                  v-for="(msg, idx) in contextDetail.context.messages"
                  :id="msg.messageId ? `msg-${msg.messageId}` : undefined"
                  :key="idx"
                  :class="{
                    'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800': msg.role === 'assistant',
                    'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800': msg.role === 'system',
                    'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700': msg.role === 'user',
                    'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800': msg.role === 'tool',
                  }"
                  class="p-3 border rounded-md text-sm transition-all"
                >
                  <div class="flex items-center gap-2 mb-2 flex-wrap">
                    <span
                      :class="{
                        'text-green-700 dark:text-green-400': msg.role === 'assistant',
                        'text-purple-700 dark:text-purple-400': msg.role === 'system',
                        'text-neutral-700 dark:text-neutral-300': msg.role === 'user',
                        'text-amber-700 dark:text-amber-400': msg.role === 'tool',
                      }"
                      class="font-medium"
                    >
                      {{ msg.role === 'assistant' ? '机器人' : msg.role === 'system' ? '系统' : msg.role === 'tool' ? '工具' : '用户' }}
                    </span>
                    <UBadge v-if="msg.messageId" color="primary" size="xs">
                      <UIcon class="w-3 h-3" name="i-heroicons-hashtag" />
                      {{ msg.messageId }}
                    </UBadge>
                    <UBadge v-if="msg.userId" color="secondary" size="xs">
                      <UIcon class="w-3 h-3" name="i-heroicons-user" />
                      {{ msg.userId }}
                    </UBadge>
                    <UBadge v-if="msg.tool_call_id" color="warning" size="xs">
                      <UIcon class="w-3 h-3" name="i-heroicons-wrench-screwdriver" />
                      {{ msg.tool_call_id }}
                    </UBadge>
                    <span v-if="msg.timestamp" class="text-xs text-neutral-400 dark:text-neutral-500">
                      {{ formatTime(msg.timestamp) }}
                    </span>
                  </div>

                  <!-- 工具调用信息 (assistant 消息的 tool_calls) -->
                  <div v-if="msg.tool_calls?.length" class="mb-2 space-y-1">
                    <div
                      v-for="tc in msg.tool_calls"
                      :key="tc.id"
                      class="flex items-center gap-2 text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 px-2 py-1 rounded"
                    >
                      <UIcon class="w-3 h-3" name="i-heroicons-wrench-screwdriver" />
                      <span class="font-mono">{{ tc.function.name }}</span>
                      <span class="text-amber-600 dark:text-amber-400 truncate max-w-48" :title="tc.function.arguments">
                        {{ tc.function.arguments.length > 50 ? tc.function.arguments.slice(0, 50) + '...' : tc.function.arguments }}
                      </span>
                    </div>
                  </div>

                  <!-- 消息元数据 -->
                  <div v-if="msg.meta" class="flex items-center gap-2 mb-2 flex-wrap">
                    <UBadge
                      v-if="msg.meta.replyTo"
                      class="cursor-pointer hover:opacity-80"
                      color="warning"
                      size="xs"
                      @click="scrollToMessage(msg.meta.replyTo.messageId)"
                    >
                      <UIcon class="w-3 h-3" name="i-heroicons-arrow-uturn-left" />
                      引用 #{{ msg.meta.replyTo.messageId }}
                    </UBadge>
                    <UBadge v-if="msg.meta.atUsers?.length" color="info" size="xs">
                      <UIcon class="w-3 h-3" name="i-heroicons-at-symbol" />
                      {{ msg.meta.atUsers.join(', ') }}
                    </UBadge>
                  </div>

                  <!-- 消息内容 -->
                  <p
                    v-if="msg.content !== null"
                    :class="{
                      'text-green-900 dark:text-green-200': msg.role === 'assistant',
                      'text-purple-900 dark:text-purple-200': msg.role === 'system',
                      'text-neutral-900 dark:text-neutral-100': msg.role === 'user',
                      'text-amber-900 dark:text-amber-200 font-mono text-xs': msg.role === 'tool',
                    }"
                    class="whitespace-pre-wrap break-all"
                  >
                    {{ typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }}
                  </p>
                  <p v-else-if="!msg.tool_calls?.length" class="text-neutral-400 dark:text-neutral-500 italic">
                    (空内容)
                  </p>
                </div>
              </div>
            </div>

            <!-- 右侧：群友档案 -->
            <div
              :class="{ 'hidden md:block': activeTab === 'messages' }"
              class="md:w-72 shrink-0 md:border-l md:border-neutral-200 dark:md:border-neutral-700 md:pl-6"
            >
              <h3 class="font-medium text-neutral-900 dark:text-white flex items-center gap-2 mb-3">
                <UIcon class="w-5 h-5" name="i-heroicons-users" />
                群友档案
                <span class="text-xs text-neutral-400 dark:text-neutral-500 font-normal">({{ users.length }})</span>
              </h3>

              <div v-if="users.length === 0" class="text-sm text-neutral-400 dark:text-neutral-500 text-center py-8">
                暂无群友数据
              </div>

              <div v-else class="space-y-2 max-h-120 overflow-y-auto">
                <div
                  v-for="user in [...users].sort((a, b) => b.lastSeen - a.lastSeen)"
                  :key="user.userId"
                  class="p-2 rounded-md bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer transition-colors border border-neutral-200 dark:border-neutral-700"
                  @click="handleUserClick(groupId, user.userId)"
                >
                  <div class="flex items-center justify-between">
                    <div class="font-medium text-sm text-neutral-900 dark:text-white truncate">{{ user.nickname }}</div>
                    <div class="text-xs text-neutral-400 dark:text-neutral-500">{{ formatRelativeTime(user.lastSeen) }}</div>
                  </div>
                  <div class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    QQ: {{ user.userId }} · {{ user.messageCount }} 条消息
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="expandedGroup !== groupId" class="text-sm text-neutral-500 dark:text-neutral-400">
          点击上方展开查看对话上下文和群友档案
        </div>
      </UCard>
    </div>

    <!-- 确认弹窗（支持移除群和清除上下文） -->
    <ConfirmModal
      v-model:open="confirmOpen"
      :description="confirmConfig.title ? confirmConfig.description : '确定要移除这个群吗？移除后机器人将不再响应该群的消息。'"
      :title="confirmConfig.title || '移除群'"
      :variant="confirmConfig.title ? confirmConfig.variant : 'destructive'"
      @confirm="confirmConfig.title ? confirmConfig.onConfirm() : handleRemoveGroup()"
    />

    <!-- 编辑群设置模态框 -->
    <UModal v-model:open="editModalOpen" :title="`群 ${editingGroup} 设置`" @close="closeModal">
      <template #body>
        <div v-if="editSettings" class="space-y-6">
          <div class="flex items-center justify-between">
            <span>启用</span>
            <USwitch v-model="editSettings.enabled" />
          </div>

          <div class="flex items-center justify-between">
            <span>@回复</span>
            <USwitch v-model="editSettings.mustReplyOnAt" />
          </div>

          <div class="flex items-center justify-between">
            <span>引用回复</span>
            <USwitch v-model="editSettings.mustReplyOnQuote" />
          </div>

          <UFormField label="随机回复概率">
            <div class="flex items-center gap-4">
              <USlider
                v-model="editSettings.randomReplyProbability"
                :max="1"
                :min="0"
                :step="0.01"
                class="flex-1"
              />
              <span class="text-sm text-neutral-500 dark:text-neutral-400 w-12 text-right">
                {{ Math.round(editSettings.randomReplyProbability * 100) }}%
              </span>
            </div>
          </UFormField>

          <UFormField label="消息聚合冷却">
            <div class="flex items-center gap-4">
              <USlider
                :max="10"
                :min="0"
                :model-value="(editSettings.aggregationCooldown ?? 3000) / 1000"
                :step="0.5"
                class="flex-1"
                @update:model-value="(val) => editSettings!.aggregationCooldown = (val ?? 1) * 1000"
              />
              <span class="text-sm text-neutral-500 dark:text-neutral-400 w-12 text-right">
                {{ (editSettings.aggregationCooldown ?? 3000) / 1000 }}秒
              </span>
            </div>
            <template #hint>触发回复后等待，期间的消息将一起处理。设为0禁用。</template>
          </UFormField>

          <UFormField label="自定义提示词">
            <UTextarea
              v-model="editSettings.customPrompt"
              :rows="3"
              class="w-full"
              placeholder="可选，为该群添加额外的提示词"
              size="lg"
            />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex gap-4 justify-end">
          <UButton class="cursor-pointer" size="lg" variant="soft" @click="closeModal">取消</UButton>
          <UButton class="cursor-pointer" size="lg" @click="handleSaveSettings">保存</UButton>
        </div>
      </template>
    </UModal>

    <!-- 用户详情面板 -->
    <USlideover v-model:open="userSlideoverOpen" side="right" title="用户档案">
      <template #body>
        <div v-if="selectedUser" class="space-y-4">
          <!-- 基本信息 -->
          <div>
            <div class="text-lg font-medium text-neutral-900 dark:text-white">
              {{ selectedUser.nicknames[0] || selectedUser.userId }}
            </div>
            <div class="text-sm text-neutral-500 dark:text-neutral-400">QQ: {{ selectedUser.userId }}</div>
            <div class="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
              发言 {{ selectedUser.messageCount }} 次 · 最后活跃: {{ formatTime(selectedUser.lastSeen) }}
            </div>
          </div>

          <!-- 历史昵称 -->
          <div v-if="selectedUser.nicknames.length > 1">
            <div class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">历史昵称</div>
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-for="(name, idx) in selectedUser.nicknames.slice(1)"
                :key="idx"
                color="info"
                size="xs"
              >
                {{ name }}
              </UBadge>
            </div>
          </div>

          <!-- 性格特征 -->
          <div v-if="selectedUser.traits.length > 0">
            <div class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">性格特征</div>
            <div class="space-y-1">
              <div
                v-for="(trait, idx) in selectedUser.traits"
                :key="idx"
                class="text-xs text-neutral-600 dark:text-neutral-300 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 p-2 rounded-md"
              >
                {{ trait }}
              </div>
            </div>
          </div>

          <!-- 偏好 -->
          <div v-if="selectedUser.preferences.length > 0">
            <div class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">偏好</div>
            <div class="space-y-1">
              <div
                v-for="(pref, idx) in selectedUser.preferences"
                :key="idx"
                class="text-xs text-neutral-600 dark:text-neutral-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 p-2 rounded-md"
              >
                {{ pref }}
              </div>
            </div>
          </div>

          <!-- 常聊话题 -->
          <div v-if="selectedUser.topics.length > 0">
            <div class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">常聊话题</div>
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-for="(topic, idx) in selectedUser.topics"
                :key="idx"
                color="success"
                size="xs"
              >
                {{ topic }}
              </UBadge>
            </div>
          </div>

          <!-- 无数据提示 -->
          <div
            v-if="selectedUser.traits.length === 0 && selectedUser.preferences.length === 0 && selectedUser.topics.length === 0"
            class="text-sm text-neutral-400 dark:text-neutral-500 text-center py-4"
          >
            暂无性格分析数据，机器人会在对话中逐渐了解该用户
          </div>
        </div>
      </template>

      <template #footer>
        <UButton
          v-if="selectedUser"
          block
          class="cursor-pointer"
          color="error"
          size="lg"
          variant="soft"
          @click="handleDeleteUser(selectedUser.groupId, selectedUser.userId)"
        >
          <UIcon class="w-5 h-5" name="i-heroicons-trash" />
          删除该用户档案
        </UButton>
      </template>
    </USlideover>
  </div>
</template>
