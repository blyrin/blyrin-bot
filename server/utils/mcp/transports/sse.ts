import { EventSource } from 'eventsource'

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id?: number;  // 通知没有 id
  method: string;
  params?: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export class SSETransport {
  private config: MCPServerSSEConfig
  private messageEndpoint: string | null = null
  private requestId = 0
  private connected = false
  private eventSource: EventSource | null = null
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>()

  constructor(config: MCPServerSSEConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    logger.info('MCP', `正在通过 SSE 连接到 ${this.config.name}...`)

    return new Promise((resolve, reject) => {
      // 建立 SSE 连接
      const url = new URL(this.config.url)

      // 使用 eventsource 包支持 Node.js 环境和自定义 headers
      const eventSourceOptions: EventSource.EventSourceInitDict = {}
      if (this.config.headers && Object.keys(this.config.headers).length > 0) {
        eventSourceOptions.headers = this.config.headers
      }

      this.eventSource = new EventSource(url.toString(), eventSourceOptions)

      this.eventSource.onopen = () => {
        logger.info('MCP', `SSE 连接已打开: ${this.config.name}`)
      }

      this.eventSource.onerror = (error: MessageEvent) => {
        logger.error('MCP', `${this.config.name} SSE 错误`, { error: String(error) })
        if (!this.connected) {
          reject(new Error('SSE 连接失败'))
        }
      }

      // 监听 endpoint 事件获取消息端点
      this.eventSource.addEventListener('endpoint', (event: MessageEvent) => {
        const data = event.data as string
        // 消息端点可能是相对路径或绝对路径
        if (data.startsWith('http')) {
          this.messageEndpoint = data
        } else {
          const baseUrl = new URL(this.config.url)
          this.messageEndpoint = new URL(data, baseUrl.origin).toString()
        }
        logger.info('MCP', `获取到消息端点: ${this.messageEndpoint}`)

        // 发送 initialize 请求
        this.sendInitialize().then(() => {
          this.connected = true
          resolve()
        }).catch(reject)
      })

      // 监听消息响应
      this.eventSource.addEventListener('message', (event: MessageEvent) => {
        try {
          const response = JSON.parse(event.data) as JSONRPCResponse
          const pending = this.pendingRequests.get(response.id)
          if (pending) {
            this.pendingRequests.delete(response.id)
            if (response.error) {
              pending.reject(new Error(`JSON-RPC 错误: ${response.error.message}`))
            } else {
              pending.resolve(response.result)
            }
          }
        } catch (e) {
          logger.warn('MCP', `解析 SSE 消息失败: ${event.data}`)
        }
      })
    })
  }

  async disconnect(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    this.connected = false
    this.messageEndpoint = null
    this.pendingRequests.clear()
    logger.info('MCP', `已断开与 ${this.config.name} 的连接`)
  }

  async listTools(): Promise<MCPToolDefinition[]> {
    if (!this.connected) {
      throw new Error('未连接')
    }

    const result = await this.sendRequest('tools/list') as { tools: MCPToolDefinition[] }
    return result.tools || []
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) {
      throw new Error('未连接')
    }

    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    }) as { content: Array<{ type: string; text?: string }> }

    const textContent = result.content?.find(c => c.type === 'text')
    return textContent?.text || JSON.stringify(result.content)
  }

  isConnected(): boolean {
    return this.connected
  }

  private getNextId(): number {
    return ++this.requestId
  }

  private async sendInitialize(): Promise<void> {
    const result = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'blyrin-bot',
        version: '1.0.0',
      },
    }) as {
      protocolVersion: string;
      capabilities: Record<string, unknown>;
      serverInfo: { name: string; version: string }
    }

    logger.info('MCP', `已连接到 ${result.serverInfo.name} v${result.serverInfo.version}`)

    // 发送 initialized 通知（无 id，服务器不返回响应）
    await this.sendNotification('notifications/initialized')
  }

  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.messageEndpoint) {
      throw new Error('消息端点不可用')
    }

    const requestId = this.getNextId()
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    }

    const response = await fetch(this.messageEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`HTTP 错误: ${response.status} ${response.statusText}`)
    }

    // 对于 SSE 模式，响应通过 SSE 事件返回
    // 这里等待响应
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error('请求超时'))
      }, 30000)

      this.pendingRequests.set(requestId, {
        resolve: (value) => {
          clearTimeout(timeout)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
      })
    })
  }

  private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    if (!this.messageEndpoint) {
      throw new Error('消息端点不可用')
    }

    // 通知没有 id，服务器不返回响应
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      method,
      params,
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    }

    const response = await fetch(this.messageEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    })

    // 通知可能返回 202 Accepted 或 204 No Content
    if (!response.ok && response.status !== 202 && response.status !== 204) {
      throw new Error(`HTTP 错误: ${response.status} ${response.statusText}`)
    }
  }
}
