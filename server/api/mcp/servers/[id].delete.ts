export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      message: '缺少服务器 ID',
    })
  }

  const config = getMCPConfig()
  const existingServer = config.servers.find(s => s.id === id)
  if (!existingServer) {
    throw createError({
      statusCode: 404,
      message: '服务器不存在',
    })
  }

  // 删除服务器
  deleteMCPServer(id)
  await mcpManager.removeServer(id)

  // 返回完整的 MCP 配置数据
  const updatedConfig = getMCPConfig()
  const statuses = mcpManager.getAllServerStatuses()

  const servers = updatedConfig.servers.map((server: MCPServerConfig) => {
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
      enabled: updatedConfig.enabled,
      servers,
      toolStates: updatedConfig.toolStates,
    },
  }
})
