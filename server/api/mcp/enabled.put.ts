import { z } from 'zod'

const BodySchema = z.object({
  enabled: z.boolean(),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const result = BodySchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: result.error.errors[0]?.message || '请求数据无效',
    })
  }

  const { enabled } = result.data

  setMCPGlobalEnabled(enabled)
  if (enabled) {
    // 启用时，连接所有已启用的服务器
    const config = getMCPConfig()
    for (const server of config.servers) {
      if (server.enabled) {
        mcpManager.addServer(server)
        try {
          await mcpManager.connectServer(server.id)
        } catch (err) {
          logger.error('MCP', `连接 ${server.name} 失败`, { error: String(err) })
        }
      }
    }
  } else {
    // 禁用时，断开所有连接
    await mcpManager.disconnectAll()
  }

  const config = getMCPConfig()
  const statuses = mcpManager.getAllServerStatuses()

  const servers = config.servers.map((server: any) => {
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
