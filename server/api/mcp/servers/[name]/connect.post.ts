export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')
  if (!name) {
    throw createError({
      statusCode: 400,
      message: '缺少服务器名称',
    })
  }

  const config = getMCPConfig()
  const server = config.servers.find(s => s.name === name)
  if (!server) {
    throw createError({
      statusCode: 404,
      message: '服务器不存在',
    })
  }

  // 重新初始化 MCP 客户端
  await reconnectMCPClient()

  // 返回完整的 MCP 配置数据
  const statuses = getMCPServerStatuses()

  const servers = config.servers.map((s: MCPServerConfig) => {
    const status = statuses.find(st => st.name === s.name)
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
