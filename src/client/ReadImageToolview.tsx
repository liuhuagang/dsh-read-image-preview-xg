/**
 * dsh-read-image-preview-xg 客户端 toolview：认领 `read_image` 工具卡片的
 * `tool.call.toolview` keyed 槽，内联渲染图片缩略图（240px 长边、比例钳制，
 * 与官方 MessageImage 规则一致），点击缩略图打开全尺寸 lightbox。
 *
 * 纯浏览器 bundle：不 import 任何 DSH 宿主包（类型为本地结构子集），
 * 主题色走 DSH CSS 变量（--dsw-alias-*，缺省回退），样式以 <style> 注入。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  formatImageMeta,
  readImageCardModel,
  singleFit,
  type ImageAttachmentLike,
  type ReadImageCardModel,
  type ToolCallBlockLike,
} from '../logic.ts'

/** 会话授权图片加载器：sessionId + 附件引用 → 浏览器可用 URL。 */
export type ImageLoader = (sessionId: string, attachment: ImageAttachmentLike) => Promise<string>

/** 槽注入钩子 useLoadImage 的结构子集。 */
type UseLoadImage = (selector: (value: ImageLoader | undefined) => ImageLoader | undefined) => ImageLoader | undefined

/** tool.call.toolview owner props + session 标准 props 的结构子集。 */
export interface ReadImageToolviewProps {
  callId: string
  toolName: string
  block: unknown
  cwd?: string
  home?: string
  openFile: (path: string) => void
  inspect?: (() => void) | undefined
  sessionId: string
  /** 注入钩子；未注入时组件降级为「无缩略图」卡片，不崩溃、不影响其他工具渲染。 */
  useLoadImage?: UseLoadImage
}

const STYLES = `
.rip-card { border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.1)); border-radius: 10px; background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.04)); padding: 10px 12px; min-width: 0; }
.rip-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.rip-icon { display: inline-flex; flex: 0 0 auto; color: var(--dsw-alias-label-secondary, rgba(255,255,255,0.55)); }
.rip-title { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary, #ffffff); flex: 0 0 auto; }
.rip-path { font-size: 11px; color: var(--dsw-alias-label-secondary, rgba(255,255,255,0.55)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1 1 auto; font-family: ui-monospace, Consolas, monospace; }
.rip-dot { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; }
.rip-dot[data-state="ok"] { background: var(--dsw-alias-state-success-primary, #4cd964); }
.rip-dot[data-state="error"] { background: var(--dsw-alias-state-error-primary, #ff5c5c); }
.rip-dot[data-state="running"] { background: var(--dsw-alias-brand-primary, #ff7a1a); animation: rip-pulse 1.2s ease-in-out infinite; }
@keyframes rip-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.rip-open { flex: 0 0 auto; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.1)); background: transparent; color: var(--dsw-alias-label-secondary, rgba(255,255,255,0.55)); font-size: 11px; padding: 2px 8px; border-radius: 6px; cursor: pointer; line-height: 1.5; }
.rip-open:hover { color: var(--dsw-alias-label-primary, #ffffff); }
.rip-body { margin-top: 8px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.rip-thumb { border: 0; padding: 0; background: transparent; cursor: zoom-in; overflow: hidden; border-radius: 6px; display: block; }
.rip-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
.rip-loading { font-size: 11px; color: var(--dsw-alias-label-secondary, rgba(255,255,255,0.55)); padding: 12px 0; }
.rip-retry { border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.1)); background: transparent; color: var(--dsw-alias-state-error-primary, #ff5c5c); font-size: 11px; padding: 6px 14px; border-radius: 6px; cursor: pointer; line-height: 1.5; }
.rip-retry:hover { background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.06)); }
.rip-meta { font-size: 11px; color: var(--dsw-alias-label-secondary, rgba(255,255,255,0.45)); font-variant-numeric: tabular-nums; }
.rip-error { font-size: 11px; color: var(--dsw-alias-state-error-primary, #ff5c5c); margin-top: 8px; word-break: break-all; }
.rip-running { font-size: 11px; color: var(--dsw-alias-label-secondary, rgba(255,255,255,0.55)); margin-top: 8px; }
.rip-output { margin-top: 8px; font-size: 11px; color: var(--dsw-alias-label-secondary, rgba(255,255,255,0.55)); white-space: pre-wrap; word-break: break-all; max-height: 120px; overflow-y: auto; }
.rip-lightbox { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.72); cursor: zoom-out; }
.rip-lightbox-img { max-width: 92vw; max-height: 88vh; border-radius: 8px; box-shadow: 0 8px 40px rgba(0,0,0,0.5); cursor: default; }
.rip-lightbox-close { position: absolute; top: 14px; right: 18px; border: 0; background: rgba(255,255,255,0.12); color: #ffffff; width: 32px; height: 32px; border-radius: 50%; font-size: 15px; cursor: pointer; line-height: 1; }
.rip-lightbox-close:hover { background: rgba(255,255,255,0.24); }
`

function installStyles(): void {
  if (document.querySelector('style[data-plugin-css="read-image-preview"]') === null) {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-read-image-preview-xg'
    tag.dataset.pluginCss = 'read-image-preview'
    tag.textContent = STYLES
    document.head.appendChild(tag)
  }
}

/** 极简图片图标（内联 SVG，避免运行时依赖）。 */
function ImageGlyph(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5.6" cy="6" r="1.4" fill="currentColor" />
      <path d="M2.5 12.5 6.4 8.8 9.2 11.2 12 8.6 13.5 10.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * read_image 工具卡片：标题 + 路径摘要 + 状态点；settled 成功时渲染
 * 缩略图（加载失败可重试），点击打开全尺寸 lightbox；running/error 态
 * 与官方卡片语义一致。
 */
export function ReadImageToolview({
  callId,
  block,
  sessionId,
  useLoadImage,
  openFile,
}: ReadImageToolviewProps): JSX.Element {
  const model: ReadImageCardModel = useMemo(() => readImageCardModel(block as ToolCallBlockLike), [block])
  const loadImage = useLoadImage?.(value => value)
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [open, setOpen] = useState(false)

  // 附件 URL 解析：随 image/加载器/会话变化重载，加载失败进入可重试态。
  useEffect(() => {
    if (model.state !== 'ok' || model.image === null || loadImage === undefined) return
    let live = true
    setUrl(null)
    setFailed(false)
    loadImage(sessionId, model.image)
      .then((value) => { if (live) setUrl(value) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [model.state, model.image, loadImage, sessionId, attempt])

  // lightbox：Esc 关闭。
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const close = useCallback(() => { setOpen(false) }, [])
  const retry = useCallback(() => { setAttempt(value => value + 1) }, [])
  const fit = model.image === null ? undefined : singleFit(model.image)
  const label = model.image?.name ?? model.path ?? callId

  return (
    <div className="rip-card">
      <div className="rip-head">
        <span className="rip-icon"><ImageGlyph /></span>
        <span className="rip-title">读取图片</span>
        <span className="rip-path" title={model.path ?? undefined}>{model.path ?? model.summary}</span>
        <span className="rip-dot" data-state={model.state} />
        {model.path !== null && model.state !== 'running' ? (
          <button type="button" className="rip-open" onClick={() => openFile(model.path!)}>打开</button>
        ) : null}
      </div>
      {model.state === 'running' ? <div className="rip-running">正在读取图片…</div> : null}
      {model.state === 'error' ? <div className="rip-error">{model.output ?? '读取失败'}</div> : null}
      {model.state === 'ok' && model.image !== null && fit !== undefined ? (
        <div className="rip-body">
          {loadImage === undefined ? (
            <div className="rip-loading">预览服务暂不可用</div>
          ) : failed ? (
            <button type="button" className="rip-retry" onClick={retry}>图片加载失败 · 点击重试</button>
          ) : url === null ? (
            <div className="rip-loading">图片加载中…</div>
          ) : (
            <>
              <button
                type="button"
                className="rip-thumb"
                style={{ width: fit.width, height: fit.height }}
                title="点击查看原图"
                onClick={() => setOpen(true)}
              >
                <img src={url} alt={label} style={{ objectPosition: fit.objectPosition }} />
              </button>
              <div className="rip-meta">{formatImageMeta(model.image)}</div>
            </>
          )}
        </div>
      ) : null}
      {model.state === 'ok' && model.output !== null ? <pre className="rip-output">{model.output}</pre> : null}
      {open && url !== null ? (
        <div className="rip-lightbox" onClick={close}>
          <img className="rip-lightbox-img" src={url} alt={label} onClick={event => event.stopPropagation()} />
          <button type="button" className="rip-lightbox-close" onClick={close} aria-label="关闭预览">✕</button>
        </div>
      ) : null}
    </div>
  )
}

/** 样式安装由客户端入口负责（fiber 级生命周期），组件保持纯渲染。 */
export function installReadImagePreviewStyles(): void {
  installStyles()
}
