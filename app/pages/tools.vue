<script lang="ts" setup>
const toast = useToast()

interface ToolsApiData {
  enabled: boolean
  tools: ToolInfo[]
  exa?: {
    baseUrl: string
    apiKey: string
  }
}

type MCPTransportType = 'streamable-http' | 'sse' | 'stdio'

interface MCPServerWithStatus {
  id: string
  name: string
  enabled: boolean
  transportType: MCPTransportType
  url?: string
  headers?: Record<string, string>
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  connected: boolean
  error?: string
  tools: MCPToolDefinition[]
}

interface MCPApiData {
  enabled: boolean
  servers: MCPServerWithStatus[]
  toolStates: Record<string, boolean>
}

interface ServerFormData {
  name: string
  transportType: MCPTransportType
  url: string
  headers: string
  command: string
  args: string
  env: string
  cwd: string
}

const loading = ref(true)
const toolsData = ref<ToolsApiData | null>(null)
const exaBaseUrl = ref('')
const exaApiKey = ref('')
const savingExa = ref(false)

// MCP 状态
const mcpLoading = ref(true)
const mcpData = ref<MCPApiData | null>(null)
const showAddServer = ref(false)
const editingServer = ref<MCPServerWithStatus | null>(null)
const expandedServers = ref<Set<string>>(new Set())
const connectingServers = ref<Set<string>>(new Set())

const serverForm = ref<ServerFormData>({
  name: '',
  transportType: 'streamable-http',
  url: '',
  headers: '',
  command: '',
  args: '',
  env: '',
  cwd: '',
})

// 确认弹窗状态
const confirmOpen = ref(false)
const pendingRemoveServerId = ref<string | null>(null)

const transportOptions = [
  { label: 'Streamable HTTP', value: 'streamable-http' },
  { label: 'SSE (Server-Sent Events)', value: 'sse' },
  { label: 'Stdio (本地进程)', value: 'stdio' },
]

async function fetchConfig() {
  try {
    const res = await $fetch('/api/config/tools')
    if (res.success) {
      toolsData.value = res.data
      exaBaseUrl.value = res.data.exa?.baseUrl || ''
      exaApiKey.value = res.data.exa?.apiKey || ''
    }
  } catch (err) {
    console.error('获取工具配置失败:', err)
  } finally {
    loading.value = false
  }
}

async function fetchMCPConfig() {
  try {
    const res = await $fetch('/api/config/mcp')
    if (res.success) {
      mcpData.value = res.data
    }
  } catch (err) {
    console.error('获取 MCP 配置失败:', err)
  } finally {
    mcpLoading.value = false
  }
}

onMounted(() => {
  fetchConfig()
  fetchMCPConfig()
})

async function handleGlobalToggle(enabled: boolean) {
  try {
    const res = await $fetch('/api/tools/enabled', {
      method: 'PUT',
      body: { enabled },
    })
    if (res.success) {
      toolsData.value = res.data
      toast.add({ title: enabled ? '工具系统已启用' : '工具系统已禁用', color: 'success' })
    }
  } catch {
    toast.add({ title: '操作失败', color: 'error' })
  }
}

async function handleToolToggle(toolName: string, enabled: boolean) {
  try {
    const res = await $fetch(`/api/tools/${toolName}/enabled`, {
      method: 'PUT',
      body: { enabled },
    })
    if (res.success) {
      toolsData.value = res.data
      toast.add({ title: `工具 "${toolName}" 已${enabled ? '启用' : '禁用'}`, color: 'success' })
    }
  } catch {
    toast.add({ title: '操作失败', color: 'error' })
  }
}

async function handleSaveExa() {
  savingExa.value = true
  try {
    const res = await $fetch('/api/tools/exa', {
      method: 'PUT',
      body: { baseUrl: exaBaseUrl.value, apiKey: exaApiKey.value },
    })
    if (res.success) {
      toolsData.value = res.data
      toast.add({ title: 'Exa 配置已保存', color: 'success' })
    }
  } catch {
    toast.add({ title: '保存失败', color: 'error' })
  } finally {
    savingExa.value = false
  }
}

// MCP 相关函数
async function handleMCPGlobalToggle(enabled: boolean) {
  try {
    const res = await $fetch('/api/mcp/enabled', {
      method: 'PUT',
      body: { enabled },
    })
    if (res.success) {
      mcpData.value = res.data
      toast.add({ title: enabled ? 'MCP 已启用' : 'MCP 已禁用', color: 'success' })
    }
  } catch {
    toast.add({ title: '操作失败', color: 'error' })
  }
}

function resetServerForm() {
  serverForm.value = {
    name: '',
    transportType: 'streamable-http',
    url: '',
    headers: '',
    command: '',
    args: '',
    env: '',
    cwd: '',
  }
}

async function handleAddServer() {
  try {
    const serverConfig: Record<string, unknown> = {
      name: serverForm.value.name,
      transportType: serverForm.value.transportType,
    }

    if (serverForm.value.transportType === 'streamable-http' || serverForm.value.transportType === 'sse') {
      serverConfig.url = serverForm.value.url
      if (serverForm.value.headers) {
        try {
          serverConfig.headers = JSON.parse(serverForm.value.headers)
        } catch {
          toast.add({ title: 'Headers 格式错误，请输入有效的 JSON', color: 'error' })
          return
        }
      }
    } else if (serverForm.value.transportType === 'stdio') {
      serverConfig.command = serverForm.value.command
      if (serverForm.value.args) {
        serverConfig.args = serverForm.value.args.split(' ').filter(Boolean)
      }
      if (serverForm.value.env) {
        try {
          serverConfig.env = JSON.parse(serverForm.value.env)
        } catch {
          toast.add({ title: '环境变量格式错误，请输入有效的 JSON', color: 'error' })
          return
        }
      }
      if (serverForm.value.cwd) {
        serverConfig.cwd = serverForm.value.cwd
      }
    }

    const res = await $fetch('/api/mcp/servers', {
      method: 'POST',
      body: serverConfig,
    })
    if (res.success) {
      mcpData.value = res.data
      showAddServer.value = false
      resetServerForm()
      toast.add({ title: 'MCP 服务器已添加', color: 'success' })
    } else {
      toast.add({ title: '添加失败', color: 'error' })
    }
  } catch {
    toast.add({ title: '添加失败', color: 'error' })
  }
}

async function handleUpdateServer() {
  if (!editingServer.value) return

  try {
    const updates: Record<string, unknown> = {
      name: serverForm.value.name,
      transportType: serverForm.value.transportType,
    }

    if (serverForm.value.transportType === 'streamable-http' || serverForm.value.transportType === 'sse') {
      updates.url = serverForm.value.url
      if (serverForm.value.headers) {
        try {
          updates.headers = JSON.parse(serverForm.value.headers)
        } catch {
          toast.add({ title: 'Headers 格式错误，请输入有效的 JSON', color: 'error' })
          return
        }
      }
    } else if (serverForm.value.transportType === 'stdio') {
      updates.command = serverForm.value.command
      if (serverForm.value.args) {
        updates.args = serverForm.value.args.split(' ').filter(Boolean)
      }
      if (serverForm.value.env) {
        try {
          updates.env = JSON.parse(serverForm.value.env)
        } catch {
          toast.add({ title: '环境变量格式错误，请输入有效的 JSON', color: 'error' })
          return
        }
      }
      if (serverForm.value.cwd) {
        updates.cwd = serverForm.value.cwd
      }
    }

    const res = await $fetch(`/api/mcp/servers/${editingServer.value.id}`, {
      method: 'PUT',
      body: updates,
    })
    if (res.success) {
      mcpData.value = res.data
      editingServer.value = null
      resetServerForm()
      toast.add({ title: 'MCP 服务器已更新', color: 'success' })
    } else {
      toast.add({ title: '更新失败', color: 'error' })
    }
  } catch {
    toast.add({ title: '更新失败', color: 'error' })
  }
}

function showRemoveServerConfirm(serverId: string) {
  pendingRemoveServerId.value = serverId
  confirmOpen.value = true
}

async function handleRemoveServer() {
  if (!pendingRemoveServerId.value) return

  try {
    const res = await $fetch(`/api/mcp/servers/${pendingRemoveServerId.value}`, {
      method: 'DELETE',
    })
    if (res.success) {
      mcpData.value = res.data
      toast.add({ title: 'MCP 服务器已删除', color: 'success' })
    }
  } catch {
    toast.add({ title: '删除失败', color: 'error' })
  } finally {
    pendingRemoveServerId.value = null
  }
}

async function handleConnectServer(serverId: string) {
  connectingServers.value.add(serverId)
  try {
    const res = await $fetch(`/api/mcp/servers/${serverId}/connect`, {
      method: 'POST',
    })
    if (res.success) {
      mcpData.value = res.data
      toast.add({ title: '服务器已连接', color: 'success' })
    } else {
      toast.add({ title: '连接失败', color: 'error' })
    }
  } catch {
    toast.add({ title: '连接失败', color: 'error' })
  } finally {
    connectingServers.value.delete(serverId)
  }
}

async function handleDisconnectServer(serverId: string) {
  try {
    const res = await $fetch(`/api/mcp/servers/${serverId}/disconnect`, {
      method: 'POST',
    })
    if (res.success) {
      mcpData.value = res.data
      toast.add({ title: '服务器已断开', color: 'success' })
    }
  } catch {
    toast.add({ title: '断开失败', color: 'error' })
  }
}

async function handleToolStateToggle(serverId: string, toolName: string, enabled: boolean) {
  try {
    const res = await $fetch(`/api/mcp/tools/${serverId}/${toolName}/enabled`, {
      method: 'PUT',
      body: { enabled },
    })
    if (res.success) {
      mcpData.value = res.data
    }
  } catch {
    toast.add({ title: '操作失败', color: 'error' })
  }
}

function toggleServerExpanded(serverId: string) {
  if (expandedServers.value.has(serverId)) {
    expandedServers.value.delete(serverId)
  } else {
    expandedServers.value.add(serverId)
  }
}

function startEditServer(server: MCPServerWithStatus) {
  editingServer.value = server
  serverForm.value = {
    name: server.name,
    transportType: server.transportType,
    url: server.url || '',
    headers: server.headers ? JSON.stringify(server.headers, null, 2) : '',
    command: server.command || '',
    args: server.args?.join(' ') || '',
    env: server.env ? JSON.stringify(server.env, null, 2) : '',
    cwd: server.cwd || '',
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold text-neutral-900 dark:text-white mb-6">工具管理</h1>

    <UTabs :items="[{ label: '内置工具', slot: 'builtin' }, { label: 'MCP', slot: 'mcp' }]">
      <!-- 内置工具 Tab -->
      <template #builtin>
        <div v-if="loading" class="text-neutral-500 dark:text-neutral-400 py-8 text-center">加载中...</div>

        <div v-else-if="toolsData" class="space-y-6 mt-4">
          <!-- 全局开关 -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">内置工具</h3>
              <p class="text-sm text-neutral-500 dark:text-neutral-400">启用后，AI 可以调用工具执行特定操作（如点赞、戳一戳等）</p>
            </template>

            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium">启用内置工具</p>
                <p class="text-sm text-neutral-500 dark:text-neutral-400">关闭后所有内置工具将不可用</p>
              </div>
              <USwitch
                :model-value="toolsData.enabled"
                @update:model-value="handleGlobalToggle"
              />
            </div>
          </UCard>

          <!-- 工具列表 -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">可用工具</h3>
              <p class="text-sm text-neutral-500 dark:text-neutral-400">管理各个工具的启用状态</p>
            </template>

            <div class="space-y-4">
              <div
                v-for="tool in toolsData.tools"
                :key="tool.name"
                class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 rounded-lg"
              >
                <div class="flex items-center gap-4">
                  <div class="min-w-0">
                    <p class="font-medium flex items-center gap-2 mb-1">
                      <UIcon name="i-heroicons-wrench" />
                      {{ tool.name }}
                    </p>
                    <p class="text-sm text-neutral-500 dark:text-neutral-400">{{ tool.description }}</p>
                  </div>
                </div>
                <USwitch
                  :disabled="!toolsData.enabled"
                  :model-value="tool.enabled"
                  @update:model-value="(enabled) => handleToolToggle(tool.name, enabled)"
                />
              </div>

              <p v-if="toolsData.tools.length === 0" class="text-center text-neutral-500 dark:text-neutral-400 py-8">
                暂无可用工具
              </p>
            </div>
          </UCard>

          <!-- Exa 搜索设置 -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon class="w-5 h-5" name="i-heroicons-magnifying-glass" />
                <h3 class="font-semibold">Exa 搜索设置</h3>
              </div>
              <p class="text-sm text-neutral-500 dark:text-neutral-400">配置 Exa 搜索 API，启用后 AI 可以搜索网络信息</p>
            </template>

            <div class="space-y-4">
              <UFormField label="API 地址">
                <UInput v-model="exaBaseUrl" class="w-full" placeholder="https://api.exa.ai" size="lg" />
              </UFormField>

              <UFormField label="API Key">
                <UInput v-model="exaApiKey" class="w-full" placeholder="exa-..." size="lg" type="password" />
              </UFormField>

              <UButton class="cursor-pointer" :loading="savingExa" size="lg" @click="handleSaveExa">
                <UIcon class="w-5 h-5" name="i-heroicons-check" />
                保存 Exa 配置
              </UButton>
            </div>
          </UCard>
        </div>
      </template>

      <!-- MCP Tab -->
      <template #mcp>
        <div class="space-y-6 mt-4">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <div>
                  <div class="flex items-center gap-2 mb-2">
                    <UIcon class="w-5 h-5" name="i-heroicons-server" />
                    <h3 class="font-semibold">MCP 服务器</h3>
                  </div>
                  <p class="text-sm text-neutral-500 dark:text-neutral-400">管理 Model Context Protocol 服务器，扩展 AI 能力</p>
                </div>
                <USwitch
                  :disabled="mcpLoading"
                  :model-value="mcpData?.enabled ?? false"
                  @update:model-value="handleMCPGlobalToggle"
                />
              </div>
            </template>

            <div v-if="mcpLoading" class="flex items-center justify-center py-8">
              <UIcon class="w-5 h-5 animate-spin text-neutral-400" name="i-heroicons-arrow-path" />
            </div>

            <div v-else class="space-y-4">
              <!-- 服务器列表 -->
              <div v-for="server in mcpData?.servers" :key="server.id" class="border border-neutral-200 dark:border-neutral-700 rounded-lg">
                <div
                  class="flex flex-col md:flex-row md:items-center gap-2 justify-between p-4 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  @click="toggleServerExpanded(server.id)"
                >
                  <div class="flex items-center gap-2">
                    <UIcon
                      :name="expandedServers.has(server.id) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                      class="w-5 h-5 text-neutral-500 dark:text-neutral-400"
                    />
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="font-medium">{{ server.name }}</span>
                        <UBadge :color="server.connected ? 'success' : 'info'" size="xs">
                          {{ server.connected ? '已连接' : '未连接' }}
                        </UBadge>
                        <span class="text-xs text-neutral-400">{{ server.transportType }}</span>
                      </div>
                      <p class="text-sm text-neutral-500 dark:text-neutral-400">
                        {{ server.transportType === 'stdio' ? server.command : server.url }}
                      </p>
                      <p v-if="server.error" class="text-sm text-red-500 dark:text-red-400">{{ server.error }}</p>
                    </div>
                  </div>
                  <div class="flex items-center justify-end" @click.stop>
                    <UButton class="cursor-pointer" size="xs" variant="ghost" @click="startEditServer(server)">
                      <UIcon class="w-5 h-5" name="i-heroicons-pencil" />
                    </UButton>
                    <UButton class="cursor-pointer" size="xs" variant="ghost" @click="showRemoveServerConfirm(server.id)">
                      <UIcon class="w-5 h-5 text-red-500 mr-2" name="i-heroicons-trash" />
                    </UButton>
                    <UButton
                      v-if="server.connected"
                      class="cursor-pointer"
                      size="xs"
                      variant="soft"
                      @click="handleDisconnectServer(server.id)"
                    >
                      <UIcon class="w-5 h-5" name="i-heroicons-stop" />
                      断开
                    </UButton>
                    <UButton
                      v-else
                      :disabled="!mcpData?.enabled"
                      :loading="connectingServers.has(server.id)"
                      class="cursor-pointer"
                      size="xs"
                      variant="soft"
                      @click="handleConnectServer(server.id)"
                    >
                      <UIcon class="w-5 h-5" name="i-heroicons-play" />
                      连接
                    </UButton>
                  </div>
                </div>

                <!-- 展开的工具列表 -->
                <div v-if="expandedServers.has(server.id) && server.connected"
                     class="border-t border-neutral-200 dark:border-neutral-700 px-4 py-3 bg-neutral-50 dark:bg-neutral-800">
                  <p class="text-sm font-medium mb-2">可用工具 ({{ server.tools.length }})</p>
                  <div v-if="server.tools.length > 0" class="space-y-2">
                    <div
                      v-for="tool in server.tools"
                      :key="tool.name"
                      class="flex items-center justify-between p-2 bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700"
                    >
                      <div>
                        <p class="font-medium text-sm">{{ tool.name }}</p>
                        <p class="text-xs text-neutral-500 dark:text-neutral-400">{{ tool.description }}</p>
                      </div>
                      <USwitch
                        :disabled="!mcpData?.enabled"
                        :model-value="mcpData?.toolStates[`${server.id}:${tool.name}`] !== false"
                        @update:model-value="(enabled) => handleToolStateToggle(server.id, tool.name, enabled)"
                      />
                    </div>
                  </div>
                  <p v-else class="text-sm text-neutral-500 dark:text-neutral-400">暂无可用工具</p>
                </div>
              </div>

              <p v-if="mcpData?.servers.length === 0 && !showAddServer" class="text-center text-neutral-500 dark:text-neutral-400 py-4">
                暂无 MCP 服务器
              </p>

              <!-- 添加/编辑服务器表单 -->
              <div v-if="showAddServer || editingServer"
                   class="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 space-y-4 bg-neutral-50 dark:bg-neutral-800">
                <div class="flex items-center justify-between">
                  <h4 class="font-medium">{{ editingServer ? '编辑服务器' : '添加服务器' }}</h4>
                  <UButton
                    size="xs"
                    class="cursor-pointer"
                    variant="ghost"
                    @click="showAddServer = false; editingServer = null; resetServerForm()"
                  >
                    <UIcon class="w-5 h-5" name="i-heroicons-x-mark" />
                  </UButton>
                </div>

                <UFormField label="名称">
                  <UInput v-model="serverForm.name" class="w-full" placeholder="服务器名称" size="lg" />
                </UFormField>

                <UFormField label="传输类型">
                  <USelect v-model="serverForm.transportType" :options="transportOptions" class="w-full" size="lg" />
                </UFormField>

                <template v-if="serverForm.transportType === 'streamable-http' || serverForm.transportType === 'sse'">
                  <UFormField label="URL">
                    <UInput v-model="serverForm.url" class="w-full" placeholder="http://localhost:3001/mcp" size="lg" />
                  </UFormField>
                  <UFormField label="Headers (JSON, 可选)">
                    <UInput v-model="serverForm.headers" class="w-full" placeholder='{"Authorization": "Bearer xxx"}'
                            size="lg" />
                  </UFormField>
                </template>

                <template v-if="serverForm.transportType === 'stdio'">
                  <UFormField label="命令">
                    <UInput v-model="serverForm.command" class="w-full" placeholder="npx" size="lg" />
                  </UFormField>
                  <UFormField label="参数 (空格分隔)">
                    <UInput v-model="serverForm.args" class="w-full"
                            placeholder="-y @modelcontextprotocol/server-filesystem" size="lg" />
                  </UFormField>
                  <UFormField label="环境变量 (JSON, 可选)">
                    <UInput v-model="serverForm.env" class="w-full" placeholder='{"API_KEY": "xxx"}' size="lg" />
                  </UFormField>
                  <UFormField label="工作目录 (可选)">
                    <UInput v-model="serverForm.cwd" class="w-full" placeholder="/path/to/directory" size="lg" />
                  </UFormField>
                </template>

                <UButton class="cursor-pointer" block size="lg" @click="editingServer ? handleUpdateServer() : handleAddServer()">
                  <UIcon class="w-5 h-5" name="i-heroicons-check" />
                  {{ editingServer ? '保存修改' : '添加服务器' }}
                </UButton>
              </div>

              <!-- 添加按钮 -->
              <UButton
                v-if="!showAddServer && !editingServer"
                block
                class="cursor-pointer"
                size="lg"
                variant="soft"
                @click="showAddServer = true"
              >
                <UIcon class="w-5 h-5" name="i-heroicons-plus" />
                添加 MCP 服务器
              </UButton>
            </div>
          </UCard>
        </div>
      </template>
    </UTabs>

    <!-- 确认删除弹窗 -->
    <ConfirmModal
      v-model:open="confirmOpen"
      description="确定要删除这个 MCP 服务器吗？删除后需要重新添加和配置。"
      title="删除 MCP 服务器"
      variant="destructive"
      @confirm="handleRemoveServer"
    />
  </div>
</template>
