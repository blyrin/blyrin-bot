import { type Connection, MultiServerMCPClient } from '@langchain/mcp-adapters'
import type { StructuredToolInterface } from '@langchain/core/tools'

// MCP 客户端实例
let mcpClient: MultiServerMCPClient | null = null
let mcpTools: StructuredToolInterface[] = []
let initialized = false

/**
 * 将现有 MCPServerConfig 转换为 LangChain MCP 配置格式
 */
function convertMCPConfig(servers: MCPServerConfig[]): Record<string, Connection> {
  const config: Record<string, Connection> = {}

  for (const server of servers) {
    if (!server.enabled) continue

    if (server.transportType === 'stdio') {
      config[server.name] = {
        transport: 'stdio',
        command: server.command,
        args: server.args ?? [],
        env: server.env,
      }
    } else if (server.transportType === 'sse' || server.transportType === 'streamable-http') {
      // LangChain MCP adapters 使用 'sse' 处理 HTTP 传输
      config[server.name] = {
        transport: 'sse',
        url: server.url,
        headers: server.headers,
      }
    }
  }

  return config
}

/**
 * 初始化 MCP 客户端
 */
export async function initializeMCPClient(): Promise<void> {
  if (initialized) {
    logger.debug('MCP', 'MCP 客户端已初始化，跳过')
    return
  }

  const config = getMCPConfig()

  if (!config.enabled) {
    logger.info('MCP', 'MCP 已禁用，跳过初始化')
    return
  }

  const enabledServers = config.servers.filter(s => s.enabled)
  if (enabledServers.length === 0) {
    logger.info('MCP', '没有启用的 MCP 服务器')
    return
  }

  logger.info('MCP', '正在初始化 MCP 客户端...', {
    servers: enabledServers.map(s => s.name),
  })

  try {
    const mcpConfig = convertMCPConfig(enabledServers)

    mcpClient = new MultiServerMCPClient(mcpConfig)

    // 获取所有工具
    mcpTools = await mcpClient.getTools()

    logger.info('MCP', 'MCP 客户端初始化完成', {
      toolCount: mcpTools.length,
      tools: mcpTools.map(t => t.name),
    })

    initialized = true
  } catch (error) {
    logger.error('MCP', 'MCP 客户端初始化失败', { error: String(error) })
    mcpClient = null
    mcpTools = []
    throw error
  }
}

/**
 * 关闭 MCP 客户端
 */
export async function shutdownMCPClient(): Promise<void> {
  if (!initialized || !mcpClient) {
    return
  }

  logger.info('MCP', '正在关闭 MCP 客户端...')

  try {
    await mcpClient.close()
  } catch (error) {
    logger.error('MCP', '关闭 MCP 客户端时出错', { error: String(error) })
  }

  mcpClient = null
  mcpTools = []
  initialized = false

  logger.info('MCP', 'MCP 客户端已关闭')
}

/**
 * 重新连接 MCP 客户端
 */
export async function reconnectMCPClient(): Promise<void> {
  await shutdownMCPClient()
  await initializeMCPClient()
}

/**
 * 获取已启用的 MCP 工具
 * 根据 toolStates 过滤工具
 */
export function getEnabledMCPTools(): StructuredToolInterface[] {
  if (!initialized || mcpTools.length === 0) {
    return []
  }

  const config = getMCPConfig()
  if (!config.enabled) {
    return []
  }

  // LangChain MCP adapters 使用 "serverName_toolName" 格式
  // 我们需要将其映射到 "serverName:toolName" 格式来检查 toolStates
  return mcpTools.filter((tool) => {
    // 工具名格式: serverName_toolName
    const parts = tool.name.split('_')
    if (parts.length < 2) return true // 无法解析，默认启用

    const serverName = parts[0]
    const toolName = parts.slice(1).join('_')
    const key = `${serverName}:${toolName}`

    // 默认启用，除非明确禁用
    return config.toolStates[key] !== false
  })
}

/**
 * 获取所有 MCP 服务器状态
 */
export function getMCPServerStatuses(): MCPServerStatus[] {
  const config = getMCPConfig()
  const statuses: MCPServerStatus[] = []

  for (const server of config.servers) {
    // 从 mcpTools 中提取该服务器的工具
    const serverTools = mcpTools
      .filter(t => t.name.startsWith(`${server.name}_`))
      .map((t) => {
        const toolName = t.name.slice(server.name.length + 1)
        return {
          name: toolName,
          description: t.description || '',
          inputSchema: {},
        }
      })

    statuses.push({
      name: server.name,
      connected: initialized && server.enabled && serverTools.length > 0,
      tools: serverTools,
    })
  }

  return statuses
}

/**
 * 获取 MCP 客户端实例
 */
export function getMCPClient(): MultiServerMCPClient | null {
  return mcpClient
}

/**
 * 检查 MCP 是否已初始化
 */
export function isMCPInitialized(): boolean {
  return initialized
}
