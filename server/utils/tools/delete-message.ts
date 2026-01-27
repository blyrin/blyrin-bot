import { registerTool } from './index'

// 撤回消息工具定义
const deleteMessageDefinition: ToolDefinition = {
  name: 'delete_message',
  description: '撤回消息。撤回自己的消息无需权限，撤回他人消息需要管理员权限。',
  parameters: {
    type: 'object',
    properties: {
      message_id: {
        type: 'number',
        description: '要撤回的消息ID。可以从对话上下文中获取消息ID。',
      },
    },
    required: ['message_id'],
  },
}

// 撤回消息工具执行函数
async function executeDeleteMessage(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const client = getClient()

  if (!client) {
    return {
      success: false,
      message: '机器人未连接，无法撤回消息',
    }
  }

  const messageId = args.message_id as number

  if (!messageId) {
    return {
      success: false,
      message: '缺少消息ID参数',
    }
  }

  // 检查管理员权限（撤回他人消息需要）
  const isAdmin = isBotAdmin(context.groupId)

  try {
    await client.deleteMessage(String(messageId))

    logger.info('Tools', `撤回消息成功`, {
      messageId,
      groupId: context.groupId,
      operatorUserId: context.userId,
      isAdmin,
    })

    return {
      success: true,
      message: `已成功撤回消息 ${messageId}`,
      data: { messageId, groupId: context.groupId },
    }
  } catch (error) {
    const errorMsg = String(error)

    // 如果不是管理员且撤回失败，可能是权限问题
    if (!isAdmin && errorMsg.includes('permission')) {
      logger.warn('Tools', `撤回消息失败：权限不足`, {
        messageId,
        groupId: context.groupId,
        error: errorMsg,
      })

      return {
        success: false,
        message: '撤回消息失败：机器人不是群管理员，无法撤回他人消息',
      }
    }

    logger.error('Tools', `撤回消息失败`, {
      messageId,
      groupId: context.groupId,
      error: errorMsg,
    })

    return {
      success: false,
      message: `撤回消息失败: ${errorMsg}`,
    }
  }
}

function register(): void {
  registerTool(deleteMessageDefinition, executeDeleteMessage)
}

register()
