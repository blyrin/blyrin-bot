import { registerTool } from './index'

// 群荣誉类型
type HonorType = 'all' | 'talkative' | 'performer' | 'legend' | 'strong_newbie' | 'emotion'

// 查询群荣誉工具定义
const getGroupHonorDefinition: ToolDefinition = {
  name: 'get_group_honor',
  description: '查询群荣誉信息，包括龙王、群聊之火等荣誉称号。',
  parameters: {
    type: 'object',
    properties: {
      honor_type: {
        type: 'string',
        description: '荣誉类型：all(全部)、talkative(龙王)、performer(群聊之火)、legend(群聊炽焰)、strong_newbie(冒尖小春笋)、emotion(快乐源泉)。默认为 all。',
        enum: ['all', 'talkative', 'performer', 'legend', 'strong_newbie', 'emotion'],
      },
    },
    required: [],
  },
}

// 查询群荣誉工具执行函数
async function executeGetGroupHonor(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const client = getClient()

  if (!client) {
    return {
      success: false,
      message: '机器人未连接，无法查询群荣誉',
    }
  }

  const honorType = (args.honor_type as HonorType) || 'all'

  try {
    const honorInfo = await client.getGroupHonorInfo(String(context.groupId), honorType)

    logger.info('Tools', `查询群荣誉成功`, {
      groupId: context.groupId,
      honorType,
    })

    // 格式化荣誉信息
    const result: string[] = []

    if (honorInfo.current_talkative) {
      const t = honorInfo.current_talkative
      result.push(`当前龙王：${t.nickname}(${t.user_id})，已蝉联 ${t.day_count} 天`)
    }

    if (honorInfo.talkative_list && honorInfo.talkative_list.length > 0) {
      result.push(`历史龙王：${honorInfo.talkative_list.map((u: {
        nickname: string;
        user_id: number
      }) => `${u.nickname}(${u.user_id})`).join('、')}`)
    }

    if (honorInfo.performer_list && honorInfo.performer_list.length > 0) {
      result.push(`群聊之火：${honorInfo.performer_list.map((u: {
        nickname: string;
        user_id: number
      }) => `${u.nickname}(${u.user_id})`).join('、')}`)
    }

    if (honorInfo.legend_list && honorInfo.legend_list.length > 0) {
      result.push(`群聊炽焰：${honorInfo.legend_list.map((u: {
        nickname: string;
        user_id: number
      }) => `${u.nickname}(${u.user_id})`).join('、')}`)
    }

    if (honorInfo.strong_newbie_list && honorInfo.strong_newbie_list.length > 0) {
      result.push(`冒尖小春笋：${honorInfo.strong_newbie_list.map((u: {
        nickname: string;
        user_id: number
      }) => `${u.nickname}(${u.user_id})`).join('、')}`)
    }

    if (honorInfo.emotion_list && honorInfo.emotion_list.length > 0) {
      result.push(`快乐源泉：${honorInfo.emotion_list.map((u: {
        nickname: string;
        user_id: number
      }) => `${u.nickname}(${u.user_id})`).join('、')}`)
    }

    const message = result.length > 0 ? result.join('\n') : '暂无群荣誉信息'

    return {
      success: true,
      message,
      data: honorInfo,
    }
  } catch (error) {
    logger.error('Tools', `查询群荣誉失败`, {
      groupId: context.groupId,
      honorType,
      error: String(error),
    })

    return {
      success: false,
      message: `查询群荣誉失败: ${String(error)}`,
    }
  }
}

function register(): void {
  registerTool(getGroupHonorDefinition, executeGetGroupHonor)
}

register()
