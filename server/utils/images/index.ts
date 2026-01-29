import type { Sharp } from 'sharp'
import sharp from 'sharp'

const WEBP_QUALITY = 50
const WEBP_EFFORT = 4
const WEBP_CONTENT_TYPE = 'image/webp'
const GIF_MAX_FRAMES = 8
const MAX_DIMENSION = 500

interface ImageSource {
  url: string
  imageIndex: number
}

const REMOTE_URL_PATTERN = /^https?:\/\//i
const DATA_URL_PATTERN = /^data:([^;]+);base64,(.+)$/i
const BASE64_URL_PREFIX = 'base64://'

const RESIZE_OPTIONS = {
  width: MAX_DIMENSION,
  height: MAX_DIMENSION,
  fit: 'inside' as const,
  withoutEnlargement: true,
}

function applyResizeIfNeeded(pipeline: Sharp, width: number, height: number): Sharp {
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    return pipeline.resize(RESIZE_OPTIONS)
  }
  return pipeline
}

export function isRemoteUrl(source: string): boolean {
  return REMOTE_URL_PATTERN.test(source)
}

export function isBase64Source(source: string): boolean {
  return DATA_URL_PATTERN.test(source) || source.startsWith(BASE64_URL_PREFIX)
}

export function isSupportedSource(source: string): boolean {
  return isRemoteUrl(source) || isBase64Source(source)
}

function decodeBase64Source(source: string): Buffer {
  if (source.startsWith(BASE64_URL_PREFIX)) {
    const base64 = source.slice(BASE64_URL_PREFIX.length)
    if (!base64) throw new Error('无效的 base64 URL')
    return Buffer.from(base64, 'base64')
  }
  const match = source.match(DATA_URL_PATTERN)
  if (!match || !match[2]) {
    throw new Error('无效的数据 URL')
  }
  return Buffer.from(match[2], 'base64')
}

async function fetchImageBuffer(source: string): Promise<Buffer> {
  if (isBase64Source(source)) {
    return decodeBase64Source(source)
  }
  if (!isRemoteUrl(source)) {
    throw new Error(`不支持的图片源: ${source}`)
  }
  const response = await fetch(source)
  if (!response.ok) {
    throw new Error(`图片下载失败: ${response.status}`)
  }
  const data = await response.arrayBuffer()
  return Buffer.from(data)
}

interface CompressResult {
  buffer: Buffer
  isAnimated: boolean
  metadata: sharp.Metadata
}

async function compressToWebp(buffer: Buffer): Promise<CompressResult> {
  const image = sharp(buffer, { animated: true })
  const metadata = await image.metadata()
  const isAnimated = (metadata.pages ?? 1) > 1

  const pipeline = applyResizeIfNeeded(image, metadata.width ?? 0, metadata.height ?? 0)
  const webpBuffer = await pipeline.webp({
    quality: WEBP_QUALITY,
    effort: WEBP_EFFORT,
    loop: 0,
  }).toBuffer()
  return { buffer: webpBuffer, isAnimated, metadata }
}

async function extractGifFrames(
  buffer: Buffer,
  metadata: sharp.Metadata,
  maxFrames = GIF_MAX_FRAMES,
): Promise<Buffer[]> {
  const totalPages = metadata.pages ?? 1
  if (totalPages <= 1) {
    return []
  }

  const width = metadata.width ?? 0
  const height = metadata.height ?? 0

  // 计算要抽取的帧索引（均匀分布）
  const frameCount = Math.min(totalPages, maxFrames)
  const step = totalPages <= maxFrames ? 1 : (totalPages - 1) / (maxFrames - 1)
  const frameIndices = Array.from({ length: frameCount }, (_, i) => Math.round(i * step))

  // 抽取每一帧并转换为静态 WebP
  const frames = await Promise.all(
    frameIndices.map(async (pageIndex) => {
      const pipeline = applyResizeIfNeeded(
        sharp(buffer, { animated: true, page: pageIndex }),
        width,
        height,
      )
      return pipeline.webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT }).toBuffer()
    }),
  )

  return frames
}

function toDataUrl(base64: string, contentType = WEBP_CONTENT_TYPE): string {
  return `data:${contentType};base64,${base64}`
}

export async function storeMessageImagesFromUrls(
  groupId: number,
  messageId: number,
  userId: number | undefined,
  images: ImageSource[],
): Promise<void> {
  if (images.length === 0) return
  const storedImages: StoredImageInput[] = []

  await Promise.all(images.map(async (image) => {
    try {
      const sourceBuffer = await fetchImageBuffer(image.url)
      const { buffer: webpBuffer, isAnimated, metadata } = await compressToWebp(sourceBuffer)
      storedImages.push({
        imageIndex: image.imageIndex,
        base64: webpBuffer.toString('base64'),
        contentType: WEBP_CONTENT_TYPE,
        isAnimated,
      })

      // 如果是动图，抽帧并存储
      if (isAnimated) {
        try {
          const frameBuffers = await extractGifFrames(sourceBuffer, metadata)
          if (frameBuffers.length > 0) {
            const frames: StoredFrameInput[] = frameBuffers.map((buf, idx) => ({
              frameIndex: idx,
              base64: buf.toString('base64'),
              contentType: WEBP_CONTENT_TYPE,
            }))
            saveImageFramesToDb(groupId, messageId, image.imageIndex, frames)
            logger.info('Images', '动图抽帧完成', {
              groupId,
              messageId,
              imageIndex: image.imageIndex,
              frameCount: frames.length,
            })
          }
        } catch (frameError) {
          logger.error('Images', '动图抽帧失败', { error: String(frameError), url: image.url })
        }
      }
    } catch (error) {
      logger.error('Images', '处理图片失败', { error: String(error), url: image.url })
    }
  }))

  if (storedImages.length > 0) {
    saveMessageImagesToDb(groupId, messageId, userId, storedImages)
  }
}

export function getMessageImageDataUrls(groupId: number, messageId: number): string[] {
  const images = getMessageImagesFromDb(groupId, messageId)
  // 按 imageIndex 排序后返回 URL 数组
  return images
    .sort((a, b) => a.imageIndex - b.imageIndex)
    .map(image => toDataUrl(image.base64, image.contentType))
}

export interface ExpandedImageResult {
  dataUrls: string[]
  hasAnimated: boolean
}

export function getMessageImageDataUrlsExpanded(
  groupId: number,
  messageId: number,
): ExpandedImageResult {
  const images = getMessageImagesFromDb(groupId, messageId)
  if (images.length === 0) {
    return { dataUrls: [], hasAnimated: false }
  }

  const sortedImages = images.sort((a, b) => a.imageIndex - b.imageIndex)
  const dataUrls: string[] = []
  let hasAnimated = false

  for (const image of sortedImages) {
    if (image.isAnimated) {
      hasAnimated = true
      // 从帧表读取抽取的帧
      const frames = getImageFramesFromDb(groupId, messageId, image.imageIndex)
      if (frames.length > 0) {
        for (const frame of frames) {
          dataUrls.push(toDataUrl(frame.base64, frame.contentType))
        }
      } else {
        // 没有帧数据，回退到原图
        dataUrls.push(toDataUrl(image.base64, image.contentType))
      }
    } else {
      // 静态图片直接返回
      dataUrls.push(toDataUrl(image.base64, image.contentType))
    }
  }

  return { dataUrls, hasAnimated }
}

export function getMessageImageDataUrlsBatch(
  groupId: number,
  messageIds: number[],
): Record<number, string[]> {
  const imageMap = getMessageImagesByMessageIdsFromDb(groupId, messageIds)
  const result: Record<number, string[]> = {}
  for (const id of messageIds) {
    const images = imageMap[id]
    if (images) {
      result[id] = images.map(image => toDataUrl(image.base64, image.contentType))
    }
  }
  return result
}

export function deleteMessageImages(groupId: number, messageIds: number[]): void {
  deleteMessageImagesFromDb(groupId, messageIds)
  deleteImageFramesFromDb(groupId, messageIds)
}

export function deleteGroupImages(groupId: number): void {
  deleteGroupImagesFromDb(groupId)
  deleteGroupImageFramesFromDb(groupId)
}
