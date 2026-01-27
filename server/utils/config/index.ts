import crypto from 'node:crypto'

// 生成随机密码
function generateRandomPassword(): string {
  return crypto.randomBytes(8).toString('hex') // 16位随机密码
}

// 生成随机 session secret
function generateSessionSecret(): string {
  return crypto.randomBytes(32).toString('hex')
}

// 获取默认配置
function getDefaultConfig(): UnifiedConfig {
  return {
    version: 1,
    bot: {
      connection: { url: '', token: '' },
      behavior: { replyDelayMin: 500, replyDelayMax: 2000 },
    },
    ai: {
      provider: { baseUrl: '', apiKey: '', model: 'gpt-4o-mini', supportsVision: true },
      generation: { maxTokens: 2000, temperature: 0.8 },
      context: { maxMessages: 50, compressionThreshold: 40, maxImagesPerRequest: 3 },
      compression: { model: 'gpt-4o-mini', maxTokens: 1000 },
    },
    groups: {
      whitelist: [],
      groups: {},
      defaults: { randomReplyProbability: 0.1, mustReplyOnAt: true, mustReplyOnQuote: true, aggregationCooldown: 3000 },
    },
    prompts: {
      system: { base: '你是一个友好的QQ群聊机器人。', constraints: [] },
      compression: { instruction: '请将以下对话压缩为简洁的摘要，保留关键信息：' },
    },
    auth: {
      password: '',
      sessionSecret: '',
      sessionMaxAge: 86400000,
    },
    tools: {
      enabled: false,
      tools: {},
    },
    mcp: {
      enabled: false,
      servers: [],
      toolStates: {},
    },
  }
}

// 读取配置
function readConfig(): UnifiedConfig {
  const config = getFullConfig()
  if (config) {
    return config
  }
  // 如果没有配置，返回默认配置
  return getDefaultConfig()
}

// 写入配置
function writeConfig(config: UnifiedConfig): void {
  saveFullConfig(config)
}

// 初始化配置
export function initializeConfig(): void {
  // 如果配置已存在则不加载
  if (hasConfig()) {
    return
  }

  // 首次运行，生成默认配置和随机密码
  const config = getDefaultConfig()
  const password = generateRandomPassword()
  config.auth.password = hashPassword(password)  // 存储哈希后的密码
  config.auth.sessionSecret = generateSessionSecret()

  writeConfig(config)

  // 在控制台输出密码
  logger.info('Config', '============================================================')
  logger.info('Config', '首次运行 - 已生成管理面板登录密码')
  logger.info('Config', '============================================================')
  logger.info('Config', `密码: ${password}`)
  logger.info('Config', '============================================================')
  logger.info('Config', '请妥善保存此密码，它不会再次显示！')
  logger.info('Config', '如需重置密码，请删除 data/blyrin-bot.db 后重启程序')
  logger.info('Config', '============================================================')
}

// 机器人配置
export function getBotConfig(): BotConfig {
  return readConfig().bot
}

export function updateBotConfig(config: Partial<BotConfig>): BotConfig {
  const current = readConfig()
  const updated: BotConfig = {
    ...current.bot,
    ...config,
    connection: { ...current.bot.connection, ...config.connection },
    behavior: { ...current.bot.behavior, ...config.behavior },
  }
  current.bot = updated
  writeConfig(current)
  return updated
}

// AI 配置
export function getAIConfig(): AIConfig {
  return readConfig().ai
}

export function updateAIConfig(config: Partial<AIConfig>): AIConfig {
  const current = readConfig()
  const updated: AIConfig = {
    ...current.ai,
    ...config,
    provider: { ...current.ai.provider, ...config.provider },
    generation: { ...current.ai.generation, ...config.generation },
    context: { ...current.ai.context, ...config.context },
    compression: { ...current.ai.compression, ...config.compression },
  }
  current.ai = updated
  writeConfig(current)
  return updated
}

// 群组配置
export function getGroupsConfig(): GroupsConfig {
  return readConfig().groups
}

export function updateGroupsConfig(config: Partial<GroupsConfig>): GroupsConfig {
  const current = readConfig()
  const updated: GroupsConfig = {
    ...current.groups,
    ...config,
    defaults: { ...current.groups.defaults, ...config.defaults },
  }
  current.groups = updated
  writeConfig(current)
  return updated
}

export function isGroupWhitelisted(groupId: number): boolean {
  const config = getGroupsConfig()
  return config.whitelist.includes(groupId)
}

export function getGroupSettings(groupId: number): GroupSettings {
  const config = getGroupsConfig()
  const groupSettings = config.groups[String(groupId)]
  if (groupSettings) {
    return groupSettings
  }
  return {
    enabled: true,
    ...config.defaults,
  }
}

export function updateGroupSettings(groupId: number, settings: Partial<GroupSettings>): GroupSettings {
  const current = readConfig()
  const currentSettings = getGroupSettings(groupId)
  const updated = { ...currentSettings, ...settings }
  current.groups.groups[String(groupId)] = updated
  writeConfig(current)
  return updated
}

export function addGroupToWhitelist(groupId: number): void {
  const current = readConfig()
  if (!current.groups.whitelist.includes(groupId)) {
    current.groups.whitelist.push(groupId)
    writeConfig(current)
  }
}

export function removeGroupFromWhitelist(groupId: number): void {
  const current = readConfig()
  current.groups.whitelist = current.groups.whitelist.filter(id => id !== groupId)
  delete current.groups.groups[String(groupId)]
  writeConfig(current)
}

// 提示词配置
export function getPromptsConfig(): PromptsConfig {
  return readConfig().prompts
}

export function updatePromptsConfig(config: Partial<PromptsConfig>): PromptsConfig {
  const current = readConfig()
  const updated: PromptsConfig = {
    ...current.prompts,
    ...config,
    system: { ...current.prompts.system, ...config.system },
    compression: { ...current.prompts.compression, ...config.compression },
  }
  current.prompts = updated
  writeConfig(current)
  return updated
}

// 认证配置
export function getAuthConfig(): AuthConfig {
  return readConfig().auth
}

export function updateAuthConfig(config: Partial<AuthConfig>): AuthConfig {
  const current = readConfig()
  const updated: AuthConfig = { ...current.auth, ...config }
  current.auth = updated
  writeConfig(current)
  return updated
}

// 构建系统提示词
export function buildSystemPrompt(groupId?: number): string {
  const prompts = getPromptsConfig()
  let prompt = prompts.system.base

  // 添加消息格式说明
  prompt += `

## 消息格式说明
你正在一个 QQ 群聊中与群友们对话。为了帮助你理解上下文，系统会在用户消息前添加时间戳（如 [2026 01-01 12:01]）和发送者名称。这些是元信息，仅供你参考。
你的回复应该是自然的对话内容，不要模仿这种格式，不要在回复中添加时间戳、用户名前缀或其他元信息。`

  if (prompts.system.constraints.length > 0) {
    prompt += '\n\n注意事项：\n' + prompts.system.constraints.map(c => `- ${c}`).join('\n')
  }

  if (groupId) {
    const groupSettings = getGroupSettings(groupId)
    if (groupSettings.customPrompt) {
      prompt += '\n\n' + groupSettings.customPrompt
    }
  }

  return prompt
}

// 工具配置
export function getToolsConfig(): ToolsConfig {
  return readConfig().tools
}

export function updateToolsConfig(config: Partial<ToolsConfig>): ToolsConfig {
  const current = readConfig()
  const updated: ToolsConfig = {
    ...current.tools,
    ...config,
    tools: { ...current.tools.tools, ...config.tools },
  }
  current.tools = updated
  writeConfig(current)
  return updated
}

export function setToolEnabled(toolName: string, enabled: boolean): ToolsConfig {
  const current = readConfig()
  current.tools.tools[toolName] = enabled
  writeConfig(current)
  return current.tools
}

export function setToolsGlobalEnabled(enabled: boolean): ToolsConfig {
  const current = readConfig()
  current.tools.enabled = enabled
  writeConfig(current)
  return current.tools
}

export function setExaConfig(exa: { baseUrl: string; apiKey: string }): ToolsConfig {
  const current = readConfig()
  current.tools.exa = exa
  writeConfig(current)
  return current.tools
}

// MCP 配置
export function getMCPConfig(): MCPConfig {
  const config = readConfig()
  // 确保 mcp 配置存在（兼容旧配置）
  if (!config.mcp) {
    return {
      enabled: false,
      servers: [],
      toolStates: {},
    }
  }
  return config.mcp
}

export function updateMCPConfig(config: MCPConfig): MCPConfig {
  const current = readConfig()
  current.mcp = config
  writeConfig(current)
  return current.mcp
}

export function setMCPGlobalEnabled(enabled: boolean): MCPConfig {
  const current = readConfig()
  if (!current.mcp) {
    current.mcp = { enabled: false, servers: [], toolStates: {} }
  }
  current.mcp.enabled = enabled
  writeConfig(current)
  return current.mcp
}

export function addMCPServer(server: MCPServerConfig): MCPConfig {
  const current = readConfig()
  if (!current.mcp) {
    current.mcp = { enabled: false, servers: [], toolStates: {} }
  }
  current.mcp.servers.push(server)
  writeConfig(current)
  return current.mcp
}

export function updateMCPServer(serverName: string, updates: Partial<MCPServerConfig>): MCPConfig {
  const current = readConfig()
  if (!current.mcp) {
    current.mcp = { enabled: false, servers: [], toolStates: {} }
  }
  const index = current.mcp.servers.findIndex(s => s.name === serverName)
  if (index !== -1) {
    current.mcp.servers[index] = { ...current.mcp.servers[index], ...updates } as MCPServerConfig
    writeConfig(current)
  }
  return current.mcp
}

export function deleteMCPServer(serverName: string): MCPConfig {
  const current = readConfig()
  if (!current.mcp) {
    current.mcp = { enabled: false, servers: [], toolStates: {} }
  }
  current.mcp.servers = current.mcp.servers.filter(s => s.name !== serverName)
  // 清理该服务器相关的工具状态
  const newToolStates: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(current.mcp.toolStates)) {
    if (!key.startsWith(`${serverName}:`)) {
      newToolStates[key] = value
    }
  }
  current.mcp.toolStates = newToolStates
  writeConfig(current)
  return current.mcp
}

export function setMCPServerEnabled(serverName: string, enabled: boolean): MCPConfig {
  const current = readConfig()
  if (!current.mcp) {
    current.mcp = { enabled: false, servers: [], toolStates: {} }
  }
  const server = current.mcp.servers.find(s => s.name === serverName)
  if (server) {
    server.enabled = enabled
    writeConfig(current)
  }
  return current.mcp
}

export function setMCPToolEnabled(serverName: string, toolName: string, enabled: boolean): MCPConfig {
  const current = readConfig()
  if (!current.mcp) {
    current.mcp = { enabled: false, servers: [], toolStates: {} }
  }
  current.mcp.toolStates[`${serverName}:${toolName}`] = enabled
  writeConfig(current)
  return current.mcp
}
