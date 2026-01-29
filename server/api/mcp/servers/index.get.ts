export default defineEventHandler(async () => {
  const config = getMCPConfig()
  const statuses = getMCPServerStatuses()

  // 合并配置和状态
  const servers = config.servers.map((server: MCPServerConfig) => {
    const status = statuses.find(s => s.name === server.name)
    return {
      ...server,
      connected: status?.connected ?? false,
      error: status?.error,
      tools: status?.tools ?? [],
    }
  })

  return { success: true, data: servers }
})
