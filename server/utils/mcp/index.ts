import { StreamableHTTPTransport } from './transports/streamable-http'
import { SSETransport } from './transports/sse'
import { StdioTransport } from './transports/stdio'

type Transport = StreamableHTTPTransport | SSETransport | StdioTransport

interface ServerState {
  config: MCPServerConfig;
  transport: Transport | null;
  tools: MCPToolDefinition[];
  error?: string;
  reconnectAttempts: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
}

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_BASE_DELAY = 5000 // 5 秒

class MCPClientManager {
  private servers = new Map<string, ServerState>()
  private onToolsUpdated?: (serverName: string, tools: MCPToolDefinition[]) => void

  setToolsUpdatedCallback(callback: (serverName: string, tools: MCPToolDefinition[]) => void): void {
    this.onToolsUpdated = callback
  }

  addServer(config: MCPServerConfig): void {
    if (this.servers.has(config.name)) {
      logger.warn('MCP', `服务器 ${config.name} 已存在，正在更新配置`)
    }
    this.servers.set(config.name, {
      config,
      transport: null,
      tools: [],
      reconnectAttempts: 0,
    })
    logger.info('MCP', `已添加 MCP 服务器: ${config.name}`)
  }

  async removeServer(serverName: string): Promise<void> {
    const state = this.servers.get(serverName)
    if (state) {
      // 清除重连定时器
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer)
      }
      if (state.transport?.isConnected()) {
        try {
          await state.transport.disconnect()
        } catch (err) {
          logger.error('MCP', `断开服务器 ${serverName} 连接时出错`, { error: String(err) })
        }
      }
      this.servers.delete(serverName)
      logger.info('MCP', `已移除 MCP 服务器: ${serverName}`)
    }
  }

  updateServerConfig(serverName: string, config: MCPServerConfig): void {
    const state = this.servers.get(serverName)
    if (state) {
      state.config = config
      logger.info('MCP', `已更新服务器 ${serverName} 的配置`)
    }
  }

  async connectServer(serverName: string): Promise<void> {
    const state = this.servers.get(serverName)
    if (!state) {
      throw new Error(`Server ${serverName} not found`)
    }

    if (state.transport?.isConnected()) {
      logger.info('MCP', `服务器 ${serverName} 已处于连接状态`)
      return
    }

    // 清除之前的重连定时器
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer)
      state.reconnectTimer = undefined
    }

    try {
      // 创建传输层
      const transport = this.createTransport(state.config)
      state.transport = transport
      state.error = undefined
      state.reconnectAttempts = 0

      // 连接
      await transport.connect()

      // 获取工具列表
      state.tools = await transport.listTools()
      logger.info('MCP', `服务器 ${serverName} 连接成功，${state.tools.length} 个工具可用`)

      // 通知工具列表更新
      if (this.onToolsUpdated) {
        this.onToolsUpdated(serverName, state.tools)
      }
    } catch (error) {
      state.error = String(error)
      state.transport = null
      state.tools = []
      logger.error('MCP', `连接服务器 ${serverName} 失败`, { error: String(error) })

      // 如果服务器已启用，尝试自动重连
      if (state.config.enabled) {
        this.scheduleReconnect(serverName)
      }

      throw error
    }
  }

  async disconnectServer(serverName: string): Promise<void> {
    const state = this.servers.get(serverName)
    if (!state) {
      throw new Error(`Server ${serverName} not found`)
    }

    // 清除重连定时器
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer)
      state.reconnectTimer = undefined
    }
    state.reconnectAttempts = 0

    if (state.transport) {
      await state.transport.disconnect()
      state.transport = null
      state.tools = []
      logger.info('MCP', `服务器 ${serverName} 已断开连接`)
    }
  }

  getAllServerStatuses(): MCPServerStatus[] {
    const statuses: MCPServerStatus[] = []
    for (const [name, state] of this.servers) {
      statuses.push({
        name,
        connected: state.transport?.isConnected() ?? false,
        error: state.error,
        tools: state.tools,
      })
    }
    return statuses
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const state = this.servers.get(serverName)
    if (!state) {
      throw new Error(`Server ${serverName} not found`)
    }

    if (!state.transport?.isConnected()) {
      throw new Error(`Server ${serverName} not connected`)
    }

    return state.transport.callTool(toolName, args)
  }

  getEnabledTools(toolStates: Record<string, boolean>): Array<{
    serverName: string;
    tool: MCPToolDefinition;
  }> {
    const enabledTools: Array<{
      serverName: string;
      tool: MCPToolDefinition;
    }> = []

    for (const [serverName, state] of this.servers) {
      if (!state.config.enabled || !state.transport?.isConnected()) {
        continue
      }

      for (const tool of state.tools) {
        const key = `${serverName}:${tool.name}`
        // 默认启用，除非明确禁用（toolStates[key] === false）
        if (toolStates[key] !== false) {
          enabledTools.push({
            serverName,
            tool,
          })
        }
      }
    }

    return enabledTools
  }

  async disconnectAll(): Promise<void> {
    const promises: Promise<void>[] = []
    for (const [serverName] of this.servers) {
      promises.push(this.disconnectServer(serverName).catch(err => {
        logger.error('MCP', `关闭服务器 ${serverName} 时出错`, { error: String(err) })
      }))
    }
    await Promise.all(promises)
  }

  private scheduleReconnect(serverName: string): void {
    const state = this.servers.get(serverName)
    if (!state || !state.config.enabled) {
      return
    }

    // 如果已有重连定时器，不重复创建
    if (state.reconnectTimer) {
      logger.debug('MCP', `服务器 ${serverName} 已有重连定时器，跳过`)
      return
    }

    if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.warn('MCP', `服务器 ${serverName} 已达到最大重连次数 (${MAX_RECONNECT_ATTEMPTS})`)
      return
    }

    state.reconnectAttempts++
    const delay = RECONNECT_BASE_DELAY * Math.pow(2, state.reconnectAttempts - 1) // 指数退避
    logger.info('MCP', `计划在 ${delay}ms 后重连服务器 ${serverName} (尝试第 ${state.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} 次)`)

    state.reconnectTimer = setTimeout(async () => {
      state.reconnectTimer = undefined
      if (!state.config.enabled) {
        return
      }

      try {
        await this.connectServer(serverName)
        logger.info('MCP', `服务器 ${serverName} 重新连接成功`)
      } catch {
        // connectServer 内部会再次调度重连
      }
    }, delay)
  }

  private createTransport(config: MCPServerConfig): Transport {
    switch (config.transportType) {
      case 'streamable-http':
        return new StreamableHTTPTransport(config)
      case 'sse':
        return new SSETransport(config)
      case 'stdio':
        return new StdioTransport(config)
      default:
        throw new Error(`Unknown transport type: ${(config as MCPServerConfig).transportType}`)
    }
  }
}

export const mcpManager = new MCPClientManager()

let initialized = false

export async function initializeMCP(): Promise<void> {
  logger.info('MCP', '正在初始化 MCP...')
  if (initialized) {
    logger.debug('MCP', '已初始化，跳过')
    return
  }

  const config = getMCPConfig()

  if (!config.enabled) {
    logger.info('MCP', 'MCP 已禁用，跳过初始化')
    return
  }

  // 添加所有服务器配置
  for (const server of config.servers) {
    mcpManager.addServer(server)
  }

  // 连接已启用的服务器
  for (const server of config.servers) {
    if (server.enabled) {
      try {
        await mcpManager.connectServer(server.name)
      } catch (error) {
        logger.error('MCP', `无法连接到服务器 ${server.name}`, { error: String(error) })
      }
    }
  }

  initialized = true
  logger.info('MCP', 'MCP 初始化完成')
}

export async function shutdownMCP(): Promise<void> {
  if (!initialized) {
    logger.debug('MCP', '未初始化，跳过关闭')
    return
  }

  logger.info('MCP', '正在关闭 MCP...')
  await mcpManager.disconnectAll()
  initialized = false
  logger.info('MCP', 'MCP 关闭完成')
}
