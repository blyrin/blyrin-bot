// 机器人配置
export interface BotConfig {
  connection: {
    url: string;
    token: string;
    reconnectInterval?: number;  // 重连间隔（毫秒），默认 5000
    maxReconnectAttempts?: number;  // 最大重连次数，默认 10
  };
  behavior: {
    replyDelayMin: number;
    replyDelayMax: number;
  };
}

// AI 配置
export interface AIConfig {
  provider: {
    baseUrl: string;
    apiKey: string;
    model: string;
    supportsVision: boolean;
    timeout?: number;  // API 超时时间（毫秒），默认 60000
  };
  generation: {
    maxTokens: number;
    temperature: number;
  };
  context: {
    maxMessages: number;
    compressionThreshold: number;
    maxImagesPerRequest: number;
  };
  compression: {
    model: string;
    maxTokens: number;
  };
}

// 群组配置
export interface GroupSettings {
  enabled: boolean;
  randomReplyProbability: number;
  mustReplyOnAt: boolean;
  mustReplyOnQuote: boolean;
  customPrompt?: string;
  aggregationCooldown?: number;  // 消息聚合冷却时间（毫秒），触发回复后等待此时间再处理
}

export interface GroupsConfig {
  whitelist: number[];
  groups: Record<string, GroupSettings>;
  defaults: Omit<GroupSettings, 'enabled' | 'customPrompt'>;
}

// 提示词配置
export interface PromptsConfig {
  system: {
    base: string;
    constraints: string[];
  };
  compression: {
    instruction: string;
  };
}

// 认证配置
export interface AuthConfig {
  password: string;
  sessionSecret: string;
  sessionMaxAge: number;
}

// 消息元数据，记录@和引用信息
export interface MessageMeta {
  atUsers?: number[];      // @的用户ID列表
  replyTo?: {              // 引用的消息
    messageId: number;
    userId?: number;       // 被引用消息的发送者ID
  };
}

// AI 聊天消息
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ChatMessageContent[];
  messageId?: number;  // 消息ID，用于引用关联
  userId?: number;  // 用户ID，用于关联用户记忆获取名称
  timestamp?: number;
  meta?: MessageMeta;  // 消息元数据
}

export interface ChatMessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

// 上下文数据
export interface GroupContext {
  groupId: number;
  messages: ChatMessage[];
  lastUpdated: number;
}

export interface GroupMemory {
  groupId: number;
  summary: string;
  lastCompressed: number;
}

// 用户记忆
export interface UserMemory {
  userId: number;
  groupId: number;
  nicknames: string[];  // 历史昵称列表，最新的在最前面
  traits: string[];
  preferences: string[];
  topics: string[];
  lastSeen: number;
  messageCount: number;
}

// ============ 工具系统类型 ============

// 工具参数定义（OpenAI Function Calling 格式）
export interface ToolParameterProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: string[];
  items?: ToolParameterProperty;
}

export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

// 工具定义
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameters;
}

// 工具执行上下文
export interface ToolContext {
  groupId: number;
  userId: number;
  nickname: string;
  messageId: number;
}

// 工具执行结果
export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

// 工具配置
export interface ToolsConfig {
  enabled: boolean;  // 全局开关
  tools: Record<string, boolean>;  // 工具名 -> 是否启用
  exa?: {
    baseUrl: string;
    apiKey: string;
  };
}

// API 返回的工具信息（包含系统定义的元数据）
export interface ToolInfo {
  name: string;
  description: string;
  enabled: boolean;
}

// OpenAI Tool Call 格式
export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIToolMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

// ============ MCP 类型 ============

// MCP 服务器配置 - Streamable HTTP (默认)
export interface MCPServerStreamableHTTPConfig {
  id: string;
  name: string;
  enabled: boolean;
  transportType: 'streamable-http';
  url: string;
  headers?: Record<string, string>;
}

// MCP 服务器配置 - SSE (旧版兼容)
export interface MCPServerSSEConfig {
  id: string;
  name: string;
  enabled: boolean;
  transportType: 'sse';
  url: string;
  headers?: Record<string, string>;
}

// MCP 服务器配置 - stdio
export interface MCPServerStdioConfig {
  id: string;
  name: string;
  enabled: boolean;
  transportType: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export type MCPServerConfig = MCPServerStreamableHTTPConfig | MCPServerSSEConfig | MCPServerStdioConfig;

// MCP 工具定义
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// MCP 配置 (存储在 UnifiedConfig)
export interface MCPConfig {
  enabled: boolean;
  servers: MCPServerConfig[];
  toolStates: Record<string, boolean>;  // "serverId:toolName" -> enabled
}

// MCP 服务器运行时状态
export interface MCPServerStatus {
  id: string;
  connected: boolean;
  error?: string;
  tools: MCPToolDefinition[];
}

// 统一配置类型
export interface UnifiedConfig {
  version: number;
  bot: BotConfig;
  ai: AIConfig;
  groups: GroupsConfig;
  prompts: PromptsConfig;
  auth: AuthConfig;
  tools: ToolsConfig;
  mcp: MCPConfig;
}
