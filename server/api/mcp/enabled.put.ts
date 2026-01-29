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

  // 重新初始化 MCP 客户端
  await reconnectMCPClient()

  const config = getMCPConfig()
  const statuses = getMCPServerStatuses()

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
