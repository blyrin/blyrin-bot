import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import {
  deleteGroupImagesFromDb,
  deleteMessageImagesFromDb,
  getMessageImagesByMessageIdsFromDb,
  getMessageImagesFromDb,
  saveMessageImagesToDb,
  type StoredImageInput,
} from '../db'

const WEBP_QUALITY = 45
const WEBP_EFFORT = 4
const WEBP_CONTENT_TYPE = 'image/webp'

interface ImageSource {
  url: string
  imageIndex: number
}

const DATA_URL_PATTERN = /^data:([^;]+);base64,(.+)$/i
const BASE64_URL_PREFIX = 'base64://'

function decodeDataUrl(value: string): Buffer {
  const match = value.match(DATA_URL_PATTERN)
  if (!match || !match[2]) {
    throw new Error('Invalid data URL')
  }
  return Buffer.from(match[2], 'base64')
}

function decodeBase64Url(value: string): Buffer {
  const base64 = value.slice(BASE64_URL_PREFIX.length)
  if (!base64) {
    throw new Error('Invalid base64 URL')
  }
  return Buffer.from(base64, 'base64')
}

function resolveFilePath(value: string): string {
  if (value.startsWith('file://')) {
    return fileURLToPath(value)
  }
  return value
}

async function fetchImageBuffer(source: string): Promise<Buffer> {
  if (source.startsWith('data:')) {
    return decodeDataUrl(source)
  }
  if (source.startsWith(BASE64_URL_PREFIX)) {
    return decodeBase64Url(source)
  }
  if (source.startsWith('file://') || path.isAbsolute(source)) {
    return fs.readFile(resolveFilePath(source))
  }
  if (!/^https?:\/\//i.test(source)) {
    throw new Error(`Unsupported image source: ${source}`)
  }
  const response = await fetch(source)
  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status}`)
  }
  const data = await response.arrayBuffer()
  return Buffer.from(data)
}

async function compressToWebp(buffer: Buffer): Promise<{ buffer: Buffer; isAnimated: boolean }> {
  const image = sharp(buffer, { animated: true })
  const metadata = await image.metadata()
  const isAnimated = (metadata.pages ?? 1) > 1
  const webpBuffer = await image.webp({
    quality: WEBP_QUALITY,
    effort: WEBP_EFFORT,
    loop: 0,
  }).toBuffer()
  return { buffer: webpBuffer, isAnimated }
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

  for (const image of images) {
    try {
      const sourceBuffer = await fetchImageBuffer(image.url)
      const { buffer: webpBuffer, isAnimated } = await compressToWebp(sourceBuffer)
      storedImages.push({
        imageIndex: image.imageIndex,
        base64: webpBuffer.toString('base64'),
        contentType: WEBP_CONTENT_TYPE,
        isAnimated,
      })
    } catch (error) {
      logger.error('Images', 'Failed to process image', { error: String(error), url: image.url })
    }
  }

  if (storedImages.length > 0) {
    saveMessageImagesToDb(groupId, messageId, userId, storedImages)
  }
}

export function getMessageImageDataUrls(groupId: number, messageId: number): string[] {
  const images = getMessageImagesFromDb(groupId, messageId)
  return images.map(image => toDataUrl(image.base64, image.contentType))
}

export function getMessageImageDataUrlsBatch(
  groupId: number,
  messageIds: number[],
): Record<number, string[]> {
  const imageMap = getMessageImagesByMessageIdsFromDb(groupId, messageIds)
  const result: Record<number, string[]> = {}
  for (const [messageId, images] of Object.entries(imageMap)) {
    const id = Number(messageId)
    result[id] = images.map(image => toDataUrl(image.base64, image.contentType))
  }
  return result
}

export function deleteMessageImages(groupId: number, messageIds: number[]): void {
  deleteMessageImagesFromDb(groupId, messageIds)
}

export function deleteGroupImages(groupId: number): void {
  deleteGroupImagesFromDb(groupId)
}
