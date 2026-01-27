export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      message: '缺少服务器 ID',
    })
  }

  const config = getMCPConfig()
  const server = config.servers.find(s => s.id === id)
  if (!server) {
    throw createError({
      statusCode: 404,
      message: '服务器不存在',
    })
  }

  // 断开连接
  await mcpManager.disconnectServer(id)

  // 返回完整的 MCP 配置数据
  const statuses = mcpManager.getAllServerStatuses()

  const servers = config.servers.map((s: MCPServerConfig) => {
    const status = statuses.find(st => st.id === s.id)
    return {
      ...s,
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
