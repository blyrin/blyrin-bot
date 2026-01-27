import { z } from 'zod'

// ============ Bot Config ============

export const BotConnectionSchema = z.object({
  url: z.string().url('无效的 URL').max(500),
  token: z.string().min(1, 'Token 不能为空').max(500),
  reconnectInterval: z.number().int().min(1000).max(300000).optional(),
  maxReconnectAttempts: z.number().int().min(0).max(1000).optional(),
})

export const BotBehaviorSchema = z.object({
  replyDelayMin: z.number().int().min(0).max(60000),
  replyDelayMax: z.number().int().min(0).max(60000),
})

export const BotConfigSchema = z.object({
  connection: BotConnectionSchema,
  behavior: BotBehaviorSchema,
})

// ============ AI Config ============

export const AIProviderSchema = z.object({
  baseUrl: z.string().url('无效的 URL').max(500).or(z.literal('')),
  apiKey: z.string().min(1, 'API Key 不能为空').max(500),
  model: z.string().min(1, '模型名称不能为空').max(100),
  supportsVision: z.boolean(),
  timeout: z.number().int().min(5000).max(600000).optional(),
})

export const AIGenerationSchema = z.object({
  maxTokens: z.number().int().min(1).max(128000),
  temperature: z.number().min(0).max(2),
})

export const AIContextSchema = z.object({
  maxMessages: z.number().int().min(1).max(1000),
  compressionThreshold: z.number().int().min(1).max(1000),
  maxImagesPerRequest: z.number().int().min(0).max(20),
})

export const AICompressionSchema = z.object({
  model: z.string().min(1).max(100),
  maxTokens: z.number().int().min(1).max(128000),
})

export const AIConfigSchema = z.object({
  provider: AIProviderSchema,
  generation: AIGenerationSchema,
  context: AIContextSchema,
  compression: AICompressionSchema,
})

// ============ Groups Config ============

export const GroupSettingsSchema = z.object({
  enabled: z.boolean(),
  randomReplyProbability: z.number().min(0).max(1),
  mustReplyOnAt: z.boolean(),
  mustReplyOnQuote: z.boolean(),
  customPrompt: z.string().max(10000).optional(),
  aggregationCooldown: z.number().int().min(0).max(60000).optional(),
})

export const GroupsConfigSchema = z.object({
  whitelist: z.array(z.number().int()).max(1000),
  groups: z.record(z.string(), GroupSettingsSchema),
  defaults: GroupSettingsSchema.omit({ enabled: true, customPrompt: true }),
})

// ============ Prompts Config ============

export const PromptsSystemSchema = z.object({
  base: z.string().min(1, '基础提示词不能为空').max(50000),
  constraints: z.array(z.string().max(1000)).max(50),
})

export const PromptsCompressionSchema = z.object({
  instruction: z.string().min(1).max(5000),
})

export const PromptsConfigSchema = z.object({
  system: PromptsSystemSchema,
  compression: PromptsCompressionSchema,
})

// ============ Auth Config ============

export const AuthConfigSchema = z.object({
  password: z.string().min(1, '密码不能为空'),
  sessionSecret: z.string().min(16, 'Session Secret 至少 16 个字符'),
  sessionMaxAge: z.number().int().min(60000).max(604800000),
})

// ============ Tools Config ============

export const ExaConfigSchema = z.object({
  baseUrl: z.string().url().max(500).or(z.literal('')),
  apiKey: z.string().max(500),
})

export const ToolsConfigSchema = z.object({
  enabled: z.boolean(),
  tools: z.record(z.string(), z.boolean()),
  exa: ExaConfigSchema.optional(),
})

// ============ MCP Config ============

const MCPServerBase = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1, '服务器名称不能为空').max(100),
  enabled: z.boolean(),
})

export const MCPServerStreamableHTTPSchema = MCPServerBase.extend({
  transportType: z.literal('streamable-http'),
  url: z.string().url('无效的 URL').max(500),
  headers: z.record(z.string(), z.string()).optional(),
})

export const MCPServerSSESchema = MCPServerBase.extend({
  transportType: z.literal('sse'),
  url: z.string().url('无效的 URL').max(500),
  headers: z.record(z.string(), z.string()).optional(),
})

export const MCPServerStdioSchema = MCPServerBase.extend({
  transportType: z.literal('stdio'),
  command: z.string().min(1, '命令不能为空').max(500),
  args: z.array(z.string().max(500)).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().max(500).optional(),
})

export const MCPServerSchema = z.discriminatedUnion('transportType', [
  MCPServerStreamableHTTPSchema,
  MCPServerSSESchema,
  MCPServerStdioSchema,
])

export const MCPConfigSchema = z.object({
  enabled: z.boolean(),
  servers: z.array(MCPServerSchema).max(50),
  toolStates: z.record(z.string(), z.boolean()),
})
