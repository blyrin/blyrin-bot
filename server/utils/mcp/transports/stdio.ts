import { ChildProcess, spawn } from 'node:child_process'

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

export class StdioTransport {
  private config: MCPServerStdioConfig
  private process: ChildProcess | null = null
  private requestId = 0
  private connected = false
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>()
  private buffer = ''

  constructor(config: MCPServerStdioConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    logger.info('MCP', `正在通过 stdio 启动 ${this.config.name}...`)

    return new Promise((resolve, reject) => {
      const env = { ...process.env, ...this.config.env }

      this.process = spawn(this.config.command, this.config.args || [], {
        cwd: this.config.cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      })

      this.process.on('error', (error) => {
        logger.error('MCP', `${this.config.name} 进程错误`, { error: String(error) })
        if (!this.connected) {
          reject(error)
        }
      })

      this.process.on('exit', (code, signal) => {
        logger.info('MCP', `进程 ${this.config.name} 已退出`, { code, signal })
        this.connected = false
        this.rejectAllPending(new Error(`进程退出，退出码 ${code}`))
      })

      this.process.stderr?.on('data', (data: Buffer) => {
        logger.warn('MCP', `[${this.config.name}] stderr: ${data.toString()}`)
      })

      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleData(data.toString())
      })

      // 发送 initialize 请求
      this.sendInitialize().then(() => {
        this.connected = true
        resolve()
      }).catch(reject)
    })
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
    this.connected = false
    this.rejectAllPending(new Error('已断开连接'))
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

  private handleData(data: string): void {
    this.buffer += data

    // 按行分割处理
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue

      try {
        const response = JSON.parse(line) as JSONRPCResponse
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
        logger.warn('MCP', `解析 stdio 消息失败: ${line}`)
      }
    }
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error)
    }
    this.pendingRequests.clear()
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
    this.sendNotification('notifications/initialized')
  }

  private sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.process?.stdin) {
      return Promise.reject(new Error('进程未启动'))
    }

    const requestId = this.getNextId()
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    }

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

      const message = JSON.stringify(request) + '\n'
      this.process!.stdin!.write(message)
    })
  }

  private sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this.process?.stdin) {
      return
    }

    // 通知没有 id，服务器不返回响应
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      method,
      params,
    }

    const message = JSON.stringify(request) + '\n'
    this.process.stdin.write(message)
  }
}
