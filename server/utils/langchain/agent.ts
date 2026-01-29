import { ChatOpenAI } from '@langchain/openai'
import { addMessages, entrypoint, task } from '@langchain/langgraph'
import type { BaseMessage } from '@langchain/core/messages'
import { AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import { tool } from '@langchain/core/tools'
import type { RunnableConfig } from '@langchain/core/runnables'
import { z } from 'zod'
import { builtinToolsMap, getToolContextFromConfig } from './tools'
import { getEnabledMCPTools } from './mcp-client'

// Agent 调用选项
export interface AgentInvokeOptions {
  systemPrompt: string
  messages: BaseMessage[]
  toolContext?: ToolContext
  onIntermediateOutput?: (content: string) => Promise<void>
  abortSignal?: AbortSignal
}

// Agent 调用结果
export interface AgentResult {
  content: string
  toolMessages: ChatMessage[]
  aborted: boolean
}

// Agent 内部状态
interface AgentState {
  messages: BaseMessage[]
  response: AIMessage | null
}

/**
 * 创建 callModel task
 */
function createCallModelTask(llm: ChatOpenAI, tools: StructuredToolInterface[]) {
  const boundLLM = llm.bindTools(tools)

  return task('callModel', async (messages: BaseMessage[], config?: RunnableConfig): Promise<AIMessage> => {
    const response = await boundLLM.invoke(messages, config)
    return response as AIMessage
  })
}

/**
 * 创建 callTool task
 */
function createCallToolTask(tools: StructuredToolInterface[]) {
  const toolsByName = Object.fromEntries(tools.map(t => [t.name, t]))

  return task('callTool', async (input: {
    toolCall: { id?: string; name: string; args: Record<string, unknown> };
    config?: RunnableConfig
  }): Promise<ToolMessage> => {
    const { toolCall, config } = input
    const selectedTool = toolsByName[toolCall.name]

    if (!selectedTool) {
      return new ToolMessage({
        content: JSON.stringify({ success: false, message: `工具 ${toolCall.name} 不存在` }),
        tool_call_id: toolCall.id || '',
      })
    }

    try {
      // 传递 config 给工具，工具可从中获取 toolContext
      const result = await selectedTool.invoke(toolCall.args, config)
      return new ToolMessage({
        content: typeof result === 'string' ? result : JSON.stringify(result),
        tool_call_id: toolCall.id || '',
      })
    } catch (error) {
      return new ToolMessage({
        content: JSON.stringify({ success: false, message: `工具执行失败: ${String(error)}` }),
        tool_call_id: toolCall.id || '',
      })
    }
  })
}

/**
 * 创建 Agent entrypoint
 */
function createAgent(llm: ChatOpenAI, tools: StructuredToolInterface[]) {
  const callModel = createCallModelTask(llm, tools)
  const callTool = createCallToolTask(tools)

  return entrypoint(
    'agent',
    async (messages: BaseMessage[], config?: RunnableConfig): Promise<AgentState> => {
      let currentMessages = messages
      let llmResponse = await callModel(currentMessages, config)

      // ReAct 循环：持续调用工具直到没有工具调用
      while (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
        // 并行执行所有工具调用
        const toolResults = await Promise.all(
          llmResponse.tool_calls.map(tc => callTool({ toolCall: tc, config })),
        )

        // 更新消息列表
        currentMessages = addMessages(currentMessages, [llmResponse, ...toolResults])

        // 继续调用模型
        llmResponse = await callModel(currentMessages, config)
      }

      return { response: llmResponse, messages: currentMessages }
    },
  )
}

/**
 * 创建 subagent 工具
 * 需要动态创建以避免循环依赖
 */
function createSubagentTool(
  llm: ChatOpenAI,
  availableTools: StructuredToolInterface[],
): StructuredToolInterface {
  return tool(
    async ({ task: taskDesc, tools: allowedToolNames, max_rounds }, config?: RunnableConfig) => {
      const context = getToolContextFromConfig(config)
      if (!context) {
        return JSON.stringify({
          success: false,
          message: '缺少上下文信息',
        })
      }

      let maxRounds = max_rounds || 10
      maxRounds = Math.max(1, Math.min(50, maxRounds))

      // 过滤可用工具（排除 subagent 自身）
      let filteredTools = availableTools.filter(t => t.name !== 'subagent')

      // 如果指定了白名单，进一步过滤
      if (allowedToolNames && allowedToolNames.length > 0) {
        const allowedSet = new Set(allowedToolNames)
        filteredTools = filteredTools.filter(t => allowedSet.has(t.name))
      }

      if (filteredTools.length === 0) {
        return JSON.stringify({
          success: false,
          message: '没有可用的工具，无法执行任务',
        })
      }

      logger.info('Subagent', `开始执行任务`, {
        task: taskDesc.slice(0, 100),
        availableTools: filteredTools.map(t => t.name),
        maxRounds,
      })

      try {
        // 创建子 Agent
        const subAgent = createAgent(llm, filteredTools)

        const systemPrompt = `你是一个专注执行任务的子代理。你的唯一目标是完成以下任务：

任务：${taskDesc}

执行要求：
1. 专注于任务目标，使用可用工具完成任务
2. 每次工具调用后评估结果，决定是否需要继续
3. 任务完成后，输出简洁的结果摘要
4. 如果无法完成任务，说明原因

注意：你的输出将作为结果返回给主 AI，请保持简洁明了。`

        const result = await subAgent.invoke(
          [new SystemMessage(systemPrompt)],
          {
            configurable: { toolContext: context }, // 继承上下文
          },
        )

        // 提取最终输出
        const content = typeof result.response?.content === 'string'
          ? result.response.content
          : ''

        // 统计使用的工具
        const toolsUsed = new Set<string>()
        for (const msg of result.messages) {
          if (msg instanceof AIMessage && msg.tool_calls) {
            for (const tc of msg.tool_calls) {
              toolsUsed.add(tc.name)
            }
          }
        }

        logger.info('Subagent', `任务完成`, {
          toolsUsed: Array.from(toolsUsed),
          messageCount: result.messages.length,
        })

        return JSON.stringify({
          success: true,
          message: content || '任务已完成，但没有输出内容',
          data: {
            toolsUsed: Array.from(toolsUsed),
            rounds: Math.ceil(result.messages.length / 2),
          },
        })
      } catch (error) {
        logger.error('Subagent', `任务执行失败`, { error: String(error) })
        return JSON.stringify({
          success: false,
          message: `子代理执行失败: ${String(error)}`,
        })
      }
    },
    {
      name: 'subagent',
      description: '委托子代理执行工具密集型任务，返回精简结果。适用于需要多次工具调用的复杂任务，避免工具调用过程污染主对话上下文。',
      schema: z.object({
        task: z.string().describe('任务描述，清晰说明需要完成的目标'),
        tools: z.array(z.string()).optional().describe('允许使用的工具白名单（可选），不指定则使用所有已启用工具（除 subagent 外）'),
        max_rounds: z.number().optional().describe('最大执行轮数（可选），默认 10，最大 50'),
      }),
    },
  )
}

/**
 * 获取所有已启用的工具
 */
export function getEnabledTools(llm: ChatOpenAI): StructuredToolInterface[] {
  const config = getToolsConfig()

  if (!config.enabled) {
    return []
  }

  const enabledTools: StructuredToolInterface[] = []

  // 内置工具（除 subagent 外）
  for (const [name, builtinTool] of builtinToolsMap) {
    if (config.tools[name]) {
      enabledTools.push(builtinTool)
    }
  }

  // MCP 工具
  const mcpTools = getEnabledMCPTools()
  enabledTools.push(...mcpTools)

  // 如果 subagent 启用，创建并添加
  if (config.tools['subagent']) {
    const subagentTool = createSubagentTool(llm, enabledTools)
    enabledTools.push(subagentTool)
  }

  return enabledTools
}

/**
 * 创建 LLM 实例
 */
export function createLLM(options?: {
  model?: string
  temperature?: number
  maxTokens?: number
}): ChatOpenAI {
  const config = getAIConfig()

  return new ChatOpenAI({
    model: options?.model ?? config.provider.model,
    temperature: options?.temperature ?? config.generation.temperature,
    maxTokens: options?.maxTokens ?? config.generation.maxTokens,
    apiKey: config.provider.apiKey,
    configuration: {
      baseURL: config.provider.baseUrl,
    },
  })
}

/**
 * 调用 Agent 进行对话
 */
export async function invokeAgent(options: AgentInvokeOptions): Promise<AgentResult> {
  const { systemPrompt, messages, toolContext, onIntermediateOutput, abortSignal } = options

  // 检查是否已被打断
  if (abortSignal?.aborted) {
    return { content: '', toolMessages: [], aborted: true }
  }

  const llm = createLLM()
  const tools = getEnabledTools(llm)
  const hasTools = tools.length > 0 && toolContext

  logger.debug('Agent', '开始调用 Agent', {
    messageCount: messages.length,
    toolCount: tools.length,
    hasToolContext: !!toolContext,
  })

  // 构建完整消息列表
  const fullMessages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    ...messages,
  ]

  if (!hasTools) {
    // 没有工具，直接调用 LLM
    const response = await llm.invoke(fullMessages, {
      signal: abortSignal,
    })

    const content = typeof response.content === 'string' ? response.content : ''

    return { content, toolMessages: [], aborted: false }
  }

  // 创建 Agent
  const agent = createAgent(llm, tools)

  // 收集工具消息
  const toolMessages: ChatMessage[] = []
  let finalContent = ''

  // 使用 stream 来获取中间输出
  const stream = await agent.stream(fullMessages, {
    configurable: { toolContext },
    signal: abortSignal,
  })

  for await (const step of stream) {
    // 检查打断
    if (abortSignal?.aborted) {
      logger.info('Agent', 'Agent 调用被打断')
      return { content: '', toolMessages, aborted: true }
    }

    // 处理 task 输出
    for (const [taskName, output] of Object.entries(step)) {
      if (taskName === 'callModel') {
        // 处理 LLM 响应
        const msg = output as AIMessage

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          // 记录 assistant 消息（含 tool_calls）
          const toolCalls = msg.tool_calls.map(tc => ({
            id: tc.id || '',
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args),
            },
          }))

          toolMessages.push({
            role: 'assistant',
            content: (msg.content as string) || null,
            tool_calls: toolCalls,
            timestamp: Date.now(),
          })

          // 如果有文本内容，发送中间输出
          if (msg.content && onIntermediateOutput) {
            await onIntermediateOutput(msg.content as string)
          }
        } else {
          // 最终输出
          finalContent = msg.content as string
        }
      } else if (taskName === 'callTool') {
        // 记录工具结果
        const toolMsg = output as ToolMessage
        toolMessages.push({
          role: 'tool',
          content: toolMsg.content as string,
          tool_call_id: toolMsg.tool_call_id,
          timestamp: Date.now(),
        })
      }
    }
  }

  logger.debug('Agent', 'Agent 调用完成', {
    contentLength: finalContent.length,
    toolMessageCount: toolMessages.length,
  })

  return { content: finalContent, toolMessages, aborted: false }
}

/**
 * 使用 LLM 进行简单对话（无工具）
 */
export async function simpleLLMCall(
  messages: BaseMessage[],
  options?: {
    model?: string
    temperature?: number
    maxTokens?: number
  },
): Promise<string> {
  const llm = createLLM(options)
  const response = await llm.invoke(messages)
  return typeof response.content === 'string' ? response.content : ''
}
