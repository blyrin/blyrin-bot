import z from 'zod'

// 部分更新（不允许修改 name）
const MCPServerUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  transportType: z.enum(['streamable-http', 'sse', 'stdio']).optional(),
  url: z.string().url().max(500).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  command: z.string().min(1).max(500).optional(),
  args: z.array(z.string().max(500)).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().max(500).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: '至少需要提供一个更新字段',
})

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')
  if (!name) {
    throw createError({
      statusCode: 400,
      message: '缺少服务器名称',
    })
  }

  const body = await readBody(event)

  // 验证请求体
  const result = MCPServerUpdateSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: result.error.errors[0]?.message || '请求数据无效',
    })
  }

  const config = getMCPConfig()
  const existingServer = config.servers.find(s => s.name === name)
  if (!existingServer) {
    throw createError({
      statusCode: 404,
      message: '服务器不存在',
    })
  }

  // 更新服务器配置
  const updatedServer = { ...existingServer, ...result.data } as MCPServerConfig
  updateMCPServer(name, updatedServer)

  // 重新初始化 MCP 客户端
  await reconnectMCPClient()

  // 返回完整的 MCP 配置数据
  const updatedConfig = getMCPConfig()
  const statuses = getMCPServerStatuses()

  const servers = updatedConfig.servers.map((server: MCPServerConfig) => {
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
      enabled: updatedConfig.enabled,
      servers,
      toolStates: updatedConfig.toolStates,
    },
  }
})
