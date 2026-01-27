export default defineEventHandler(async () => {
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    configs: {
      bot: getBotConfig(),
      ai: getAIConfig(),
      groups: getGroupsConfig(),
      prompts: getPromptsConfig(),
      tools: getToolsConfig(),
      mcp: getMCPConfig(),
    },
  }

  return { success: true, data: exportData }
})
