# dsh-read-image-preview-xg

**简体中文** · [English](README_EN.md)

DSH 插件：`read_image` 工具调用结果**内联图片预览**。

模型调用 `read_image` 后，聊天里原本只显示一行"Read image <路径>"和拍平后的
JSON（图片块被 `resultText` 序列化展示）。本插件在 `tool.call.toolview` 槽注册
keyed `read_image` 视图，把该工具卡片替换为带**缩略图**的预览卡片：

- 缩略图规则与官方消息图片一致：长边 240px、比例钳制 [0.25, 4]、不放大；
- 点击缩略图打开**全尺寸 lightbox**（Esc / 点击遮罩 / ✕ 关闭）；
- 图片经**会话授权**路径解析（`uiConversation.imageUrl`，与聊天消息图片同一条
  通路：会话绑定 REST 读附件 → blob URL，按会话缓存、随绑定释放回收）；
- running / error 态与官方卡片语义一致；加载失败可点击重试；
- 附带"打开"按钮（经宿主打开结果路径）。

## 结构

- `src/logic.ts` —— 纯函数：卡片模型推导（路径/图片附件/状态提取）+ 展示格式化
  （mediaType 简写、字节数、尺寸规则），宿主/客户端共用，`tests/` 全覆盖；
- `src/client/` —— 浏览器端：`tool.call.toolview` keyed `read_image` 注册 +
  预览组件（自绘卡片与 lightbox，零 DSH 运行时依赖，主题走 `--dsw-alias-*`）；
- `src/index.ts` —— 宿主最小入口（无宿主逻辑，仅为 loader 装载包体）；
- `scripts/build.mjs` —— 构建（tsdown 客户端 bundle + tsc 宿主 + 验证 + 测试）。

## 构建与测试

```powershell
cd plugins\dsh-read-image-preview-xg
npm run build   # tsdown bundle + tsc + verify + node --test
npm test        # 仅单元测试（需先构建）
```

## 部署

构建后拷贝插件目录到 DSH web profile 并重启：

```powershell
Copy-Item -Recurse plugins\dsh-read-image-preview-xg `
  $HOME\.dsh\profiles\web\node_modules\dsh-read-image-preview-xg
# 重启 DSH 生效（client-modules 扫描 dsh.client 声明并注入浏览器端 bundle）
```

## 机制要点

- `tool.call.toolview` 是开放式 keyed 槽：按 wire 工具名认领渲染，`read_image`
  原本无人认领（走通用卡片），注册即接管，不影响其他工具；
- 组件经注册 `inject` 钩子 `useLoadImage` 拿到会话授权加载器（底层
  `ctx.uiConversation.imageUrl(sessionId, attachment)`），`sessionId` 来自
  session 作用域槽的标准 props；
- 客户端 bundle 为纯浏览器代码：不 import 任何 DSH 宿主包（类型为本地结构
  子集），react 走平台模块表 external。

## 版本历史

- 0.1.0 首发：read_image 卡片内联缩略图 + lightbox 预览。
