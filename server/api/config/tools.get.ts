export default defineEventHandler(async () => {
  const config = getToolsConfig()
  const tools = getAllToolInfos()
  return {
    success: true,
    data: {
      enabled: config.enabled,
      tools,
      exa: config.exa,
    },
  }
})
