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

export class StreamableHTTPTransport {
  private config: MCPServerStreamableHTTPConfig
  private sessionId: string | null = null
  private requestId = 0
  private connected = false

  constructor(config: MCPServerStreamableHTTPConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    logger.info('MCP', `正在通过 Streamable HTTP 连接到 ${this.config.name}...`)

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

    this.connected = true
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.sessionId = null
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

    // 提取文本内容
    const textContent = result.content?.find(c => c.type === 'text')
    return textContent?.text || JSON.stringify(result.content)
  }

  isConnected(): boolean {
    return this.connected
  }

  private getNextId(): number {
    return ++this.requestId
  }

  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const requestId = this.getNextId()
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      ...this.config.headers,
    }

    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId
    }

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`HTTP 错误: ${response.status} ${response.statusText}`)
    }

    // 保存 session id
    const newSessionId = response.headers.get('Mcp-Session-Id')
    if (newSessionId) {
      this.sessionId = newSessionId
    }

    const contentType = response.headers.get('Content-Type') || ''

    // 处理 SSE 流式响应
    if (contentType.includes('text/event-stream')) {
      return this.parseSSEResponse(response, requestId)
    }

    // 处理普通 JSON 响应
    const jsonResponse = await response.json() as JSONRPCResponse
    if (jsonResponse.error) {
      throw new Error(`JSON-RPC 错误: ${jsonResponse.error.message}`)
    }
    return jsonResponse.result
  }

  private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    // 通知没有 id，服务器不返回响应
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      method,
      params,
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      ...this.config.headers,
    }

    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId
    }

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    })

    // 通知可能返回 202 Accepted 或 204 No Content
    if (!response.ok && response.status !== 202 && response.status !== 204) {
      throw new Error(`HTTP 错误: ${response.status} ${response.statusText}`)
    }

    // 保存 session id
    const newSessionId = response.headers.get('Mcp-Session-Id')
    if (newSessionId) {
      this.sessionId = newSessionId
    }
  }

  private async parseSSEResponse(response: Response, requestId: number): Promise<unknown> {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无响应体')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let result: unknown = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const jsonResponse = JSON.parse(data) as JSONRPCResponse
            if (jsonResponse.id === requestId) {
              if (jsonResponse.error) {
                throw new Error(`JSON-RPC 错误: ${jsonResponse.error.message}`)
              }
              result = jsonResponse.result
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              logger.warn('MCP', `SSE 中的 JSON 无效: ${data}`)
            } else {
              throw e
            }
          }
        }
      }
    }

    return result
  }
}
