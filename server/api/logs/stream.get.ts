export default defineEventHandler(async (event) => {
  // 设置 SSE 响应头
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // 禁用 nginx 缓冲
  })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // 发送最近的日志作为初始数据
      const recentLogs = logger.getLogs({ limit: 100 })
      for (const log of recentLogs) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(log)}\n\n`))
      }

      // 订阅新日志
      const unsubscribe = logger.subscribe((entry) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`))
        } catch {
          // 连接已关闭
          unsubscribe()
        }
      })

      // 定期发送心跳保持连接（每 15 秒）
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          clearInterval(heartbeat)
          unsubscribe()
        }
      }, 15000)

      // 当流被取消时清理
      return () => {
        clearInterval(heartbeat)
        unsubscribe()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
})
