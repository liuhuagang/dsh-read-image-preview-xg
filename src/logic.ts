/**
 * dsh-read-image-preview-xg 纯逻辑：从工具调用块（running/settled 两态）推导
 * read_image 预览卡片模型，以及展示所需的格式化/尺寸纯函数。
 *
 * 环境无关（不 import node/浏览器 API），宿主与客户端 bundle 共用；
 * 判读规则全部收敛在此文件，tests/logic.spec.mjs 覆盖。
 */

/** read_image 结果中的 image 内容块所携带的附件引用（结构子集）。 */
export interface ImageAttachmentLike {
  attachmentId: string
  mediaType: string
  bytes: number
  width: number
  height: number
  name?: string
}

/** 工具结果 content 块（结构子集：text / image / 未知形状）。 */
export type ContentBlockLike =
  | { type: 'text'; text: string }
  | { type: 'image'; attachment: ImageAttachmentLike }
  | { type: string; [key: string]: unknown }

/** 运行中的工具调用（结构子集：kind 不存在）。 */
export interface RunningCallLike {
  callId: string
  name: string
  argsRaw: string
  turn: number
  step: number
  subCalls?: readonly unknown[]
}

/** 已结算的工具结果（结构子集）。 */
export interface ResultNodeLike {
  kind: 'tool-result'
  callId: string
  call: { name: string; argsRaw: string } | null
  content: readonly ContentBlockLike[]
  isError: boolean
  error?: { name?: string; code?: string }
  subCalls?: readonly unknown[]
}

/** 工具调用块并集（结构子集）。 */
export type ToolCallBlockLike = RunningCallLike | ResultNodeLike

/** 预览卡片状态。 */
export type ReadImageCardState = 'running' | 'ok' | 'error'

/** read_image 预览卡片模型。 */
export interface ReadImageCardModel {
  state: ReadImageCardState
  /**
   * 展示路径：优先结果信封 `<path>`（后端解析后的绝对路径），
   * 否则回落到调用参数 file_path。
   */
  path: string | null
  /** 摘要（无路径时显示 callId 或参数首行）。 */
  summary: string
  /** 已结算结果中的 image 附件引用；running / 异常 / 缺失时为 null。 */
  image: ImageAttachmentLike | null
  /** 拍平的结果文本（错误行 / 无图片块时的兜底展示）。 */
  output: string | null
}

/** 解析调用参数 JSON；非 JSON 或非对象返回 null。 */
function parseArgs(argsRaw: string | undefined): Record<string, unknown> | null {
  if (argsRaw === undefined || argsRaw.trim() === '') return null
  try {
    const value: unknown = JSON.parse(argsRaw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    return value as Record<string, unknown>
  } catch {
    return null
  }
}

/** 从信封文本提取 `<path>…</path>`（read_image 输出信封的 resolved 路径）。 */
export function extractEnvelopePath(text: string | undefined): string | null {
  if (text === undefined) return null
  const match = /^<path>([\s\S]*?)<\/path>/m.exec(text)
  if (match === null) return null
  const path = match[1]?.trim()
  return path !== undefined && path !== '' ? path : null
}

/** 判别守卫：image 内容块（附件引用形状完整）。 */
function isImageBlock(block: ContentBlockLike): block is { type: 'image'; attachment: ImageAttachmentLike } {
  if (block.type !== 'image') return false
  const attachment = (block as { attachment?: unknown }).attachment
  return typeof attachment === 'object' && attachment !== null
    && typeof (attachment as { attachmentId?: unknown }).attachmentId === 'string'
}

/** 判别守卫：text 内容块。 */
function isTextBlock(block: ContentBlockLike): block is { type: 'text'; text: string } {
  return block.type === 'text' && typeof (block as { text?: unknown }).text === 'string'
}

/** 从结果 content 中提取 image 附件块。 */
export function extractImageAttachment(content: readonly ContentBlockLike[] | undefined): ImageAttachmentLike | null {
  if (content === undefined) return null
  for (const block of content) {
    if (isImageBlock(block)) return block.attachment
  }
  return null
}

/** 拍平结果 content 为展示文本：text 原样，其余块 JSON 化。 */
export function flattenResultContent(content: readonly ContentBlockLike[] | undefined): string {
  if (content === undefined || content.length === 0) return ''
  const parts: string[] = []
  for (const block of content) {
    if (isTextBlock(block)) parts.push(block.text)
    else parts.push(JSON.stringify(block, null, 2))
  }
  return parts.join('\n')
}

/** 取结果文本首行（错误行的摘要展示）。 */
export function firstLine(text: string): string {
  const index = text.indexOf('\n')
  return index === -1 ? text : text.slice(0, index)
}

/** 调用参数中的 file_path（read_image 的参数名）。 */
function argsFilePath(block: ToolCallBlockLike): string | null {
  const argsRaw = 'kind' in block ? block.call?.argsRaw : block.argsRaw
  const args = parseArgs(argsRaw)
  if (args === null) return null
  const path = args.file_path
  return typeof path === 'string' && path.trim() !== '' ? path.trim() : null
}

/**
 * 推导 read_image 预览卡片模型。
 * @param block - running 或 settled 的工具调用块。
 * @returns 卡片模型（纯函数，不触碰网络/附件存储）。
 */
export function readImageCardModel(block: ToolCallBlockLike): ReadImageCardModel {
  const running = !('kind' in block)
  const callId = block.callId
  if (running) {
    const path = argsFilePath(block)
    const fallback = (block.argsRaw !== undefined && block.argsRaw.trim() !== '' ? firstLine(block.argsRaw) : '') || callId
    return { state: 'running', path, summary: path ?? fallback, image: null, output: null }
  }
  const settled = block as ResultNodeLike
  const flat = flattenResultContent(settled.content)
  if (settled.isError) {
    const line = flat !== '' ? firstLine(flat) : `${settled.error?.name ?? 'error'}: ${settled.error?.code ?? 'unknown'}`
    const path = extractEnvelopePath(flat) ?? argsFilePath(settled)
    return { state: 'error', path, summary: path ?? callId, image: null, output: line }
  }
  const image = extractImageAttachment(settled.content)
  const path = extractEnvelopePath(flat) ?? argsFilePath(settled)
  if (image === null) {
    // 罕见兜底（窗口截断等）：无图片块时退化为文本展示。
    return { state: 'ok', path, summary: path ?? callId, image: null, output: flat || null }
  }
  return { state: 'ok', path, summary: path ?? image.name ?? callId, image, output: null }
}

/** mediaType 简写：image/png → PNG。 */
export function mediaTypeShort(mediaType: string): string {
  const match = /^image\/([a-z0-9+.-]+)$/i.exec(mediaType)
  return match === null ? mediaType : match[1]!.toUpperCase()
}

/** 字节数人类可读格式：< 1KB 显示 B，否则 KB/MB 一位小数。 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

/** 图片元信息行：`PNG · 1280×720 · 245.3 KB`。 */
export function formatImageMeta(image: ImageAttachmentLike): string {
  return `${mediaTypeShort(image.mediaType)} · ${image.width}×${image.height} · ${formatBytes(image.bytes)}`
}

/**
 * 单图缩略框（DeepSeek Chat 规则，与官方 MessageImage 一致）：长边 240px，
 * 比例钳制 [0.25, 4]（object-fit: cover 裁剪溢出），不放大超过原始尺寸。
 * @returns 展示盒尺寸与裁剪锚点。
 */
export function singleFit(dimensions: { readonly width: number; readonly height: number }): {
  width: number
  height: number
  objectPosition: string
} {
  const natural = dimensions.width / dimensions.height
  const ratio = Math.min(4, Math.max(0.25, natural))
  const box = ratio >= 1 ? { width: 240, height: 240 / ratio } : { width: 240 * ratio, height: 240 }
  const scale = Math.min(1, dimensions.width / box.width, dimensions.height / box.height)
  return {
    width: Math.max(1, Math.round(box.width * scale)),
    height: Math.max(1, Math.round(box.height * scale)),
    objectPosition: natural < 0.25 ? 'center top' : natural > 4 ? 'left center' : 'center',
  }
}
