import { registerTool } from './index'

// 设置群精华工具定义
const setEssenceMessageDefinition: ToolDefinition = {
  name: 'set_essence_message',
  description: '将消息设为群精华。需要机器人有管理员权限。',
  parameters: {
    type: 'object',
    properties: {
      message_id: {
        type: 'number',
        description: '要设为精华的消息ID。可以从对话上下文中获取消息ID。',
      },
    },
    required: ['message_id'],
  },
}

// 设置群精华工具执行函数
async function executeSetEssenceMessage(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const client = getClient()

  if (!client) {
    return {
      success: false,
      message: '机器人未连接，无法设置群精华',
    }
  }

  // 检查管理员权限
  if (!isBotAdmin(context.groupId)) {
    return {
      success: false,
      message: '机器人不是群管理员，无法设置群精华',
    }
  }

  const messageId = args.message_id as number

  if (!messageId) {
    return {
      success: false,
      message: '缺少消息ID参数',
    }
  }

  try {
    await client.setEssenceMessage(String(messageId))

    logger.info('Tools', `设置群精华成功`, {
      messageId,
      groupId: context.groupId,
      operatorUserId: context.userId,
    })

    return {
      success: true,
      message: `已成功将消息 ${messageId} 设为群精华`,
      data: { messageId, groupId: context.groupId },
    }
  } catch (error) {
    logger.error('Tools', `设置群精华失败`, {
      messageId,
      groupId: context.groupId,
      error: String(error),
    })

    return {
      success: false,
      message: `设置群精华失败: ${String(error)}`,
    }
  }
}

function register(): void {
  registerTool(setEssenceMessageDefinition, executeSetEssenceMessage)
}

register()
