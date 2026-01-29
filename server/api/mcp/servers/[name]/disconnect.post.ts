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

  // 禁用该服务器并重新初始化
  updateMCPServer(name, { ...server, enabled: false } as MCPServerConfig)
  await reconnectMCPClient()

  // 返回完整的 MCP 配置数据
  const updatedConfig = getMCPConfig()
  const statuses = getMCPServerStatuses()

  const servers = updatedConfig.servers.map((s: MCPServerConfig) => {
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
      enabled: updatedConfig.enabled,
      servers,
      toolStates: updatedConfig.toolStates,
    },
  }
})
