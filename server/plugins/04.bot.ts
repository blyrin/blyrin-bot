export default defineNitroPlugin(async (nitroApp) => {
  await connectBot()

  // 关闭时断开连接
  nitroApp.hooks.hook('close', async () => {
    await disconnectBot()
  })
})
