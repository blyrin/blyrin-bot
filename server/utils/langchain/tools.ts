import { tool } from '@langchain/core/tools'
import type { RunnableConfig } from '@langchain/core/runnables'
import { z } from 'zod'

/**
 * 从 RunnableConfig 中获取工具上下文
 * 工具上下文通过 config.configurable.toolContext 传递，确保并发安全
 */
export function getToolContextFromConfig(config?: RunnableConfig): ToolContext | null {
  return (config?.configurable?.toolContext as ToolContext) ?? null
}

// ============ 内置工具定义 ============

/**
 * Exa 搜索工具
 */
export const exaSearchTool = tool(
  async ({ query, num_results, type }, config?: RunnableConfig) => {
    const context = getToolContextFromConfig(config)
    const toolsConfig = getToolsConfig()
    const exaConfig = toolsConfig.exa

    if (!exaConfig?.baseUrl || !exaConfig?.apiKey) {
      return 'Exa 搜索未配置，请在 AI 设置中配置 Exa API 地址和密钥'
    }

    let numResults = num_results || 5
    const searchType = type || 'neural'
    numResults = Math.max(1, Math.min(10, numResults))

    try {
      const response = await fetch(`${exaConfig.baseUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': exaConfig.apiKey,
        },
        body: JSON.stringify({
          query,
          numResults,
          type: searchType,
          contents: { text: true },
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Exa API 错误: ${response.status} ${errorText}`)
      }

      const data = await response.json() as {
        results: Array<{
          title: string
          url: string
          text?: string
          publishedDate?: string
        }>
      }

      logger.info('Tools', `Exa 搜索成功`, {
        query,
        numResults: data.results.length,
        context,
      })

      const formattedResults = data.results.map((result, index) => {
        let text = `${index + 1}. ${result.title}\n   链接: ${result.url}`
        if (result.publishedDate) {
          text += `\n   发布时间: ${result.publishedDate}`
        }
        if (result.text) {
          const summary = result.text.length > 200
            ? result.text.substring(0, 200) + '...'
            : result.text
          text += `\n   摘要: ${summary}`
        }
        return text
      }).join('\n\n')

      return `搜索 "${query}" 找到 ${data.results.length} 条结果:\n\n${formattedResults}`
    } catch (error) {
      logger.error('Tools', `Exa 搜索失败`, { query, error: String(error) })
      return `搜索失败: ${String(error)}`
    }
  },
  {
    name: 'exa_search',
    description: '使用 Exa 搜索引擎搜索网络信息。可以搜索最新的新闻、文章、技术文档等内容。',
    schema: z.object({
      query: z.string().describe('搜索查询内容'),
      num_results: z.number().optional().describe('返回结果数量，默认为 5，最大 10'),
      type: z.enum(['keyword', 'neural']).optional().describe('搜索类型：keyword（关键词搜索）或 neural（语义搜索），默认为 neural'),
    }),
  },
)

/**
 * 点赞工具
 */
export const sendLikeTool = tool(
  async ({ user_id, times }, config?: RunnableConfig) => {
    const context = getToolContextFromConfig(config)
    const client = getClient()

    if (!client) {
      return '机器人未连接，无法执行点赞操作'
    }

    let likeCount = times || 1
    likeCount = Math.max(1, Math.min(10, likeCount))

    try {
      await client.sendLike(String(user_id), likeCount)

      logger.info('Tools', `点赞成功`, {
        targetUserId: user_id,
        times: likeCount,
        context,
      })

      return `已成功给用户 ${user_id} 点了 ${likeCount} 个赞`
    } catch (error) {
      logger.error('Tools', `点赞失败`, {
        targetUserId: user_id,
        times: likeCount,
        error: String(error),
      })
      return `点赞失败: ${String(error)}`
    }
  },
  {
    name: 'send_like',
    description: '给指定用户点赞（赞名片）。可以给群友点赞表示喜欢或感谢。每次最多点10个赞。',
    schema: z.object({
      user_id: z.number().describe('要点赞的用户QQ号。可以从对话上下文中获取用户ID。'),
      times: z.number().optional().describe('点赞次数，1-10之间，默认为1'),
    }),
  },
)

/**
 * 戳一戳工具
 */
export const groupPokeTool = tool(
  async ({ user_id }, config?: RunnableConfig) => {
    const context = getToolContextFromConfig(config)
    const client = getClient()

    if (!client) {
      return '机器人未连接，无法执行戳一戳操作'
    }

    if (!context) {
      return '缺少上下文信息'
    }

    try {
      await client.sendGroupPoke(String(context.groupId), String(user_id))

      logger.info('Tools', `戳一戳成功`, {
        targetUserId: user_id,
        context,
      })

      return `已成功戳了用户 ${user_id}`
    } catch (error) {
      logger.error('Tools', `戳一戳失败`, {
        targetUserId: user_id,
        error: String(error),
      })
      return `戳一戳失败: ${String(error)}`
    }
  },
  {
    name: 'group_poke',
    description: '戳一戳群成员。可以用来打招呼、提醒某人，注意短时间内不要执行多次。',
    schema: z.object({
      user_id: z.number().describe('要戳的用户QQ号。可以从对话上下文中获取用户ID。'),
    }),
  },
)

/**
 * 查询群荣誉工具
 */
export const getGroupHonorTool = tool(
  async ({ honor_type }, config?: RunnableConfig) => {
    const context = getToolContextFromConfig(config)
    const client = getClient()

    if (!client) {
      return '机器人未连接，无法查询群荣誉'
    }

    if (!context) {
      return '缺少上下文信息'
    }

    const honorType = honor_type || 'all'

    try {
      const honorInfo = await client.getGroupHonorInfo(String(context.groupId), honorType)

      logger.info('Tools', `查询群荣誉成功`, {
        groupId: context.groupId,
        honorType,
      })

      const result: string[] = []

      if (honorInfo.current_talkative) {
        const t = honorInfo.current_talkative
        result.push(`当前龙王：${t.nickname}(${t.user_id})，已蝉联 ${t.day_count} 天`)
      }

      if (honorInfo.talkative_list?.length) {
        result.push(`历史龙王：${honorInfo.talkative_list.map((u: {
          nickname: string;
          user_id: number
        }) => `${u.nickname}(${u.user_id})`).join('、')}`)
      }

      if (honorInfo.performer_list?.length) {
        result.push(`群聊之火：${honorInfo.performer_list.map((u: {
          nickname: string;
          user_id: number
        }) => `${u.nickname}(${u.user_id})`).join('、')}`)
      }

      if (honorInfo.legend_list?.length) {
        result.push(`群聊炽焰：${honorInfo.legend_list.map((u: {
          nickname: string;
          user_id: number
        }) => `${u.nickname}(${u.user_id})`).join('、')}`)
      }

      if (honorInfo.strong_newbie_list?.length) {
        result.push(`冒尖小春笋：${honorInfo.strong_newbie_list.map((u: {
          nickname: string;
          user_id: number
        }) => `${u.nickname}(${u.user_id})`).join('、')}`)
      }

      if (honorInfo.emotion_list?.length) {
        result.push(`快乐源泉：${honorInfo.emotion_list.map((u: {
          nickname: string;
          user_id: number
        }) => `${u.nickname}(${u.user_id})`).join('、')}`)
      }

      const message = result.length > 0 ? result.join('\n') : '暂无群荣誉信息'

      return message
    } catch (error) {
      logger.error('Tools', `查询群荣誉失败`, {
        groupId: context.groupId,
        honorType,
        error: String(error),
      })
      return `查询群荣誉失败: ${String(error)}`
    }
  },
  {
    name: 'get_group_honor',
    description: '查询群荣誉信息，包括龙王、群聊之火等荣誉称号。',
    schema: z.object({
      honor_type: z.enum(['all', 'talkative', 'performer', 'legend', 'strong_newbie', 'emotion']).optional()
        .describe('荣誉类型：all(全部)、talkative(龙王)、performer(群聊之火)、legend(群聊炽焰)、strong_newbie(冒尖小春笋)、emotion(快乐源泉)。默认为 all。'),
    }),
  },
)

/**
 * 设置群精华工具
 */
export const setEssenceMessageTool = tool(
  async ({ message_id }, config?: RunnableConfig) => {
    const context = getToolContextFromConfig(config)
    const client = getClient()

    if (!client) {
      return '机器人未连接，无法设置群精华'
    }

    if (!context) {
      return '缺少上下文信息'
    }

    if (!isBotAdmin(context.groupId)) {
      return '机器人不是群管理员，无法设置群精华'
    }

    try {
      await client.setEssenceMessage(String(message_id))

      logger.info('Tools', `设置群精华成功`, {
        messageId: message_id,
        context,
      })

      return `已成功将消息 ${message_id} 设为群精华`
    } catch (error) {
      logger.error('Tools', `设置群精华失败`, {
        messageId: message_id,
        error: String(error),
      })
      return `设置群精华失败: ${String(error)}`
    }
  },
  {
    name: 'set_essence_message',
    description: '将消息设为群精华。需要机器人有管理员权限。',
    schema: z.object({
      message_id: z.number().describe('要设为精华的消息ID。可以从对话上下文中获取消息ID。'),
    }),
  },
)

/**
 * 撤回消息工具
 */
export const deleteMessageTool = tool(
  async ({ message_id }, config?: RunnableConfig) => {
    const context = getToolContextFromConfig(config)
    const client = getClient()

    if (!client) {
      return '机器人未连接，无法撤回消息'
    }

    if (!context) {
      return '缺少上下文信息'
    }

    const isAdmin = isBotAdmin(context.groupId)

    try {
      await client.deleteMessage(String(message_id))

      logger.info('Tools', `撤回消息成功`, {
        messageId: message_id,
        context,
        isAdmin,
      })

      return `已成功撤回消息 ${message_id}`
    } catch (error) {
      const errorMsg = String(error)

      if (!isAdmin && errorMsg.includes('permission')) {
        logger.warn('Tools', `撤回消息失败：权限不足`, {
          messageId: message_id,
          error: errorMsg,
        })
        return '撤回消息失败：机器人不是群管理员，无法撤回他人消息'
      }

      logger.error('Tools', `撤回消息失败`, {
        messageId: message_id,
        error: errorMsg,
      })
      return `撤回消息失败: ${errorMsg}`
    }
  },
  {
    name: 'delete_message',
    description: '撤回消息。撤回自己的消息无需权限，撤回他人消息需要管理员权限。',
    schema: z.object({
      message_id: z.number().describe('要撤回的消息ID。可以从对话上下文中获取消息ID。'),
    }),
  },
)

// 所有内置工具
export const builtinTools = [
  exaSearchTool,
  sendLikeTool,
  groupPokeTool,
  getGroupHonorTool,
  setEssenceMessageTool,
  deleteMessageTool,
]

// 工具名称到工具的映射
export const builtinToolsMap = new Map(
  builtinTools.map(t => [t.name, t]),
)

// 系统定义的所有工具元数据（用于管理界面显示）
export const ALL_TOOLS_META: Array<{ name: string; description: string }> = [
  {
    name: 'subagent',
    description: '委托子代理执行工具密集型任务，返回精简结果。适用于需要多次工具调用的复杂任务。',
  },
  {
    name: 'exa_search',
    description: '使用 Exa 搜索引擎搜索网络信息。可以搜索最新的新闻、文章、技术文档等内容。',
  },
  {
    name: 'send_like',
    description: '给指定用户点赞（赞名片）。可以给群友点赞表示喜欢或感谢。每次最多点10个赞。',
  },
  {
    name: 'group_poke',
    description: '戳一戳群成员。可以用来打招呼、提醒某人。',
  },
  {
    name: 'get_group_honor',
    description: '查询群荣誉信息，包括龙王、群聊之火等荣誉称号。',
  },
  {
    name: 'set_essence_message',
    description: '将消息设为群精华。需要机器人有管理员权限。',
  },
  {
    name: 'delete_message',
    description: '撤回消息。撤回他人消息需要管理员权限。',
  },
]

// 获取所有已注册的工具信息（用于管理界面）
export function getAllToolInfos(): ToolInfo[] {
  const config = getToolsConfig()

  return ALL_TOOLS_META.map(tool => ({
    name: tool.name,
    description: tool.description,
    enabled: config.tools[tool.name] ?? false,
  }))
}
