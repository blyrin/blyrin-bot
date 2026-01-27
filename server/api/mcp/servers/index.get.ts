export default defineEventHandler(async () => {
  const config = getMCPConfig()
  const statuses = mcpManager.getAllServerStatuses()

  // 合并配置和状态
  const servers = config.servers.map((server: any) => {
    const status = statuses.find(s => s.id === server.id)
    return {
      ...server,
      connected: status?.connected ?? false,
      error: status?.error,
      tools: status?.tools ?? [],
    }
  })

  return { success: true, data: servers }
})
