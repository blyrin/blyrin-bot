import z from 'zod'

// 创建服务器
const MCPServerCreateSchema = z.discriminatedUnion('transportType', [
  MCPServerStreamableHTTPSchema.extend({ enabled: z.boolean().optional() }),
  MCPServerSSESchema.extend({ enabled: z.boolean().optional() }),
  MCPServerStdioSchema.extend({ enabled: z.boolean().optional() }),
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

  // 检查名称是否已存在
  let config = getMCPConfig()
  if (config.servers.some(s => s.name === result.data.name)) {
    throw createError({
      statusCode: 400,
      message: '服务器名称已存在',
    })
  }

  // 设置 enabled 默认值
  const serverConfig: MCPServerConfig = {
    ...result.data,
    enabled: result.data.enabled ?? true,
  } as MCPServerConfig

  addMCPServer(serverConfig)
  mcpManager.addServer(serverConfig)

  // 如果服务器已启用且全局 MCP 已启用，自动连接
  config = getMCPConfig()
  if (serverConfig.enabled && config.enabled) {
    try {
      await mcpManager.connectServer(serverConfig.name)
    } catch (err) {
      logger.error('MCP', `连接 ${serverConfig.name} 失败`, { error: String(err) })
    }
  }

  // 返回完整的 MCP 配置数据
  config = getMCPConfig()
  const statuses = mcpManager.getAllServerStatuses()

  const servers = config.servers.map((server: MCPServerConfig) => {
    const status = statuses.find(s => s.name === server.name)
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
