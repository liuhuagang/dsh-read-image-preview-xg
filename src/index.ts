/**
 * dsh-read-image-preview-xg 宿主入口（最小）。
 *
 * 插件功能全部在浏览器端（tool.call.toolview keyed read_image 预览视图）；
 * 宿主侧无需任何逻辑。包体存在仅为了让 DSH loader 装载该包 ——
 * client-modules 据此扫描 `dsh.client` 声明并注入浏览器端 bundle。
 */

export const name = 'dsh-read-image-preview-xg'

export function apply(): void {
  // 纯客户端插件：宿主侧无逻辑。
}
