export default defineNitroPlugin(() => {
  logger.info('Plugin', '正在初始化配置...')
  initializeConfig()
  startSessionCleanup()
  logger.info('Plugin', '配置初始化完成')
})
