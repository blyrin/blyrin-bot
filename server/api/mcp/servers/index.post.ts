import z from 'zod'

// 创建服务器 (ID 自动生成)
const MCPServerCreateSchema = z.discriminatedUnion('transportType', [
  MCPServerStreamableHTTPSchema.extend({ id: z.string().optional(), enabled: z.boolean().optional() }),
  MCPServerSSESchema.extend({ id: z.string().optional(), enabled: z.boolean().optional() }),
  MCPServerStdioSchema.extend({ id: z.string().optional(), enabled: z.boolean().optional() }),
])

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // 验证请求体
  const result = MCPServerCreateSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: result.error.errors[0]?.message || '请求数据无效',
    })
  }

  // 自动生成 id 和设置 enabled 默认值
  const serverConfig: MCPServerConfig = {
    ...result.data,
    id: result.data.id || `mcp-${Date.now()}`,
    enabled: result.data.enabled ?? true,
  } as MCPServerConfig

  addMCPServer(serverConfig)
  mcpManager.addServer(serverConfig)

  // 如果服务器已启用且全局 MCP 已启用，自动连接
  let config = getMCPConfig()
  if (serverConfig.enabled && config.enabled) {
    try {
      await mcpManager.connectServer(serverConfig.id)
    } catch (err) {
      logger.error('MCP', `连接 ${serverConfig.id} 失败`, { error: String(err) })
    }
  }

  // 返回完整的 MCP 配置数据
  config = getMCPConfig()
  const statuses = mcpManager.getAllServerStatuses()

  const servers = config.servers.map((server: MCPServerConfig) => {
    const status = statuses.find(s => s.id === server.id)
    return {
      ...server,
      connected: status?.connected ?? false,
      error: status?.error,
      tools: status?.tools ?? [],
    }
  })

  return {
    success: true,
    data: {
      enabled: config.enabled,
      servers,
      toolStates: config.toolStates,
    },
  }
})
