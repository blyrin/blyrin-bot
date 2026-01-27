export default defineNitroPlugin(() => {
  logger.info('Plugin', '正在初始化数据库...')
  getDatabase()
  logger.info('Plugin', '数据库初始化完成')
})
