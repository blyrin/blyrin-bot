export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')
  if (!name) {
    throw createError({
      statusCode: 400,
      message: '缺少服务器名称',
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

  // 删除服务器
  deleteMCPServer(name)
  await mcpManager.removeServer(name)

  // 返回完整的 MCP 配置数据
  const updatedConfig = getMCPConfig()
  const statuses = mcpManager.getAllServerStatuses()

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
