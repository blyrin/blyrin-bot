export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const groupId = Number(body?.groupId)
  const messageIds = Array.isArray(body?.messageIds)
    ? body.messageIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id))
    : []

  if (!Number.isFinite(groupId)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid groupId',
    })
  }

  const data = getMessageImageDataUrlsBatch(groupId, messageIds)
  return { success: true, data }
})
