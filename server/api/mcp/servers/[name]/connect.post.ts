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

  // 添加服务器配置并连接
  mcpManager.addServer(server)
  await mcpManager.connectServer(name)

  // 返回完整的 MCP 配置数据
  const statuses = mcpManager.getAllServerStatuses()

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
