/**
 * dsh-read-image-preview-xg 客户端入口：安装预览样式，并在
 * `tool.call.toolview` 槽注册 keyed `read_image` 视图（认领 read_image
 * 工具卡片的渲染；未认领时原本走通用卡片）。
 *
 * 图片数据通路：组件经注入钩子 useLoadImage 拿到会话授权加载器，底层是
 * `ctx.uiConversation.imageUrl(sessionId, attachment)`（会话绑定 REST 读附件
 * → blob URL，按会话缓存并随绑定释放回收），与聊天消息图片同一条路径。
 *
 * 关键：cordis 服务访问以 inject 声明为前提——想在 ctx 上按属性访问
 * uiConversation（乃至在组件注入钩子里闭包捕获它），必须把它列入 inject。
 * 缺了它运行时抛 "cannot get property 'uiConversation' without inject"。
 * uiConversation 由 ui-conversation 客户端插件提供（web 核心组成，必然就绪），
 * inject 既保证 apply 时服务已就绪，也保证属性访问合法。
 */

import { ReadImageToolview, installReadImagePreviewStyles } from './ReadImageToolview.tsx'

/** 结构性 slots 服务面（与运行时 SlotRegistry 一致；仅取本插件用到的方法） */
type SlotsService = {
  inject(key: string, callback: () => void | (() => void)): () => void
  register(options: Record<string, unknown>, component: unknown): () => void
}

/** 结构性 uiConversation 服务面（历史图片 URL 缓存/解析的最小用法） */
type UiConversationLike = {
  imageUrl(sessionId: string, attachment: { attachmentId: string }): Promise<string>
}

/** 结构性客户端根上下文面（仅取本插件用到的字段；服务以 inject 声明注入） */
type ClientContext = {
  slots: SlotsService
  effect(dispose: () => void, label?: string): void
  uiConversation: UiConversationLike
}

/** 硬依赖：slots（注册槽）+ uiConversation（取图，属性访问需 inject 声明） */
export const inject = ['slots', 'uiConversation']

export function apply(ctx: ClientContext): void {
  ctx.effect(installReadImagePreviewStyles, 'read-image-preview:styles')

  // 会话授权图片加载器。getSnapshot 必须返回**稳定引用**（一次定义、反复返回
  // 同一函数）：注入钩子是 uSES 样式，若每次 snapshot 都造新函数，快照引用
  // 恒定变化 → 无限重渲染 → React #185（最大更新深度超限）。
  const loadImage = (sessionId: string, attachment: { attachmentId: string }): Promise<string> =>
    ctx.uiConversation.imageUrl(sessionId, attachment)
  const loadImageObservable = {
    getSnapshot: () => loadImage,
    subscribe: () => () => {},
  }

  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'read_image',
    inject: () => ({ hooks: { loadImage: loadImageObservable } }),
  }, ReadImageToolview))

  console.info('[dsh-read-image-preview-xg] 已启用：read_image 工具结果内联预览')
}
