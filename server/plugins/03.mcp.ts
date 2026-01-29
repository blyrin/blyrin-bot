export default defineNitroPlugin(async (nitroApp) => {
  await initializeMCPClient()

  // 关闭时断开连接
  nitroApp.hooks.hook('close', async () => {
    await shutdownMCPClient()
  })
})
