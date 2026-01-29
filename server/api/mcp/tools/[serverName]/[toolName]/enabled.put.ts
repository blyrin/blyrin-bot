import { z } from 'zod'

const BodySchema = z.object({
  enabled: z.boolean(),
})

export default defineEventHandler(async (event) => {
  const serverName = getRouterParam(event, 'serverName')
  const toolName = getRouterParam(event, 'toolName')

  if (!serverName || !toolName) {
    throw createError({
      statusCode: 400,
      message: '无效的参数',
    })
  }

  const body = await readBody(event)
  const result = BodySchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: result.error.errors[0]?.message || '请求数据无效',
    })
  }

  setMCPToolEnabled(serverName, toolName, result.data.enabled)

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
