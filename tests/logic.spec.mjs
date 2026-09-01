/**
 * dsh-read-image-preview-xg 纯逻辑单元测试（node --test）。
 * 测试导入 lib/ 构建产物：先构建、后测试。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractEnvelopePath,
  extractImageAttachment,
  firstLine,
  flattenResultContent,
  formatBytes,
  formatImageMeta,
  mediaTypeShort,
  readImageCardModel,
  singleFit,
} from '../lib/logic.js'

const ENVELOPE = '<path>D:\\shots\\a.png</path>\n<type>image</type>\n<content>\nimage/png image, 800x600 px, 5120 bytes\n</content>'

const IMAGE = {
  attachmentId: 'att-1',
  mediaType: 'image/png',
  bytes: 5120,
  width: 800,
  height: 600,
  name: 'a.png',
}

function runningBlock(argsRaw, callId = 'call-1') {
  return { callId, name: 'read_image', argsRaw, turn: 1, step: 2 }
}

function settledBlock({ content = [], isError = false, error, call = { name: 'read_image', argsRaw: '{"file_path":"a.png"}' }, callId = 'call-1' } = {}) {
  return { kind: 'tool-result', callId, call, content, isError, error }
}

test('running：从参数提取 file_path，状态 running', () => {
  const model = readImageCardModel(runningBlock('{"file_path":"Saved/Screenshots/s.png"}'))
  assert.equal(model.state, 'running')
  assert.equal(model.path, 'Saved/Screenshots/s.png')
  assert.equal(model.summary, 'Saved/Screenshots/s.png')
  assert.equal(model.image, null)
  assert.equal(model.output, null)
})

test('running：无参数时摘要回落 callId', () => {
  const model = readImageCardModel(runningBlock('', 'call-42'))
  assert.equal(model.state, 'running')
  assert.equal(model.path, null)
  assert.equal(model.summary, 'call-42')
})

test('settled ok：信封路径优先于参数，image 附件提取完整', () => {
  const model = readImageCardModel(settledBlock({
    content: [{ type: 'text', text: ENVELOPE }, { type: 'image', attachment: IMAGE }],
  }))
  assert.equal(model.state, 'ok')
  assert.equal(model.path, 'D:\\shots\\a.png')
  assert.deepEqual(model.image, IMAGE)
  assert.equal(model.output, null)
})

test('settled ok：无信封时路径回落参数 file_path', () => {
  const model = readImageCardModel(settledBlock({
    content: [{ type: 'image', attachment: IMAGE }],
    call: { name: 'read_image', argsRaw: '{"file_path":"relative/b.png"}' },
  }))
  assert.equal(model.state, 'ok')
  assert.equal(model.path, 'relative/b.png')
  assert.equal(model.summary, 'relative/b.png')
})

test('settled error：错误首行展示，无内容时回落 name: code', () => {
  const withText = readImageCardModel(settledBlock({
    isError: true,
    error: { name: 'Error', code: 'E1' },
    content: [{ type: 'text', text: 'cannot read "x.png": boom' }],
  }))
  assert.equal(withText.state, 'error')
  assert.equal(withText.output, 'cannot read "x.png": boom')
  assert.equal(withText.image, null)

  const bare = readImageCardModel(settledBlock({ isError: true, error: { name: 'Error', code: 'E2' }, content: [] }))
  assert.equal(bare.state, 'error')
  assert.equal(bare.output, 'Error: E2')
})

test('settled ok 但无图片块：退化为文本展示（兜底）', () => {
  const model = readImageCardModel(settledBlock({ content: [{ type: 'text', text: 'no image here' }] }))
  assert.equal(model.state, 'ok')
  assert.equal(model.image, null)
  assert.equal(model.output, 'no image here')
})

test('extractEnvelopePath：解析 <path> 信封，非信封返回 null', () => {
  assert.equal(extractEnvelopePath(ENVELOPE), 'D:\\shots\\a.png')
  assert.equal(extractEnvelopePath('<path>   </path>'), null)
  assert.equal(extractEnvelopePath('plain text'), null)
  assert.equal(extractEnvelopePath(undefined), null)
})

test('extractImageAttachment：取首个 image 块，缺字段忽略', () => {
  assert.deepEqual(extractImageAttachment([{ type: 'image', attachment: IMAGE }]), IMAGE)
  assert.equal(extractImageAttachment([{ type: 'text', text: 'x' }]), null)
  assert.equal(extractImageAttachment([{ type: 'image', attachment: { mediaType: 'image/png' } }]), null)
  assert.equal(extractImageAttachment(undefined), null)
})

test('flattenResultContent：text 原样、其他块 JSON 化', () => {
  const flat = flattenResultContent([
    { type: 'text', text: 'line1\nline2' },
    { type: 'image', attachment: IMAGE },
  ])
  assert.ok(flat.startsWith('line1\nline2\n{'))
  assert.ok(flat.includes('"attachmentId": "att-1"'))
  assert.equal(flattenResultContent([]), '')
  assert.equal(flattenResultContent(undefined), '')
})

test('firstLine：取首行', () => {
  assert.equal(firstLine('a\nb'), 'a')
  assert.equal(firstLine('only'), 'only')
})

test('mediaTypeShort / formatBytes / formatImageMeta', () => {
  assert.equal(mediaTypeShort('image/png'), 'PNG')
  assert.equal(mediaTypeShort('image/jpeg'), 'JPEG')
  assert.equal(mediaTypeShort('weird'), 'weird')
  assert.equal(formatBytes(900), '900 B')
  assert.equal(formatBytes(5120), '5.0 KB')
  assert.equal(formatBytes(1048576), '1.0 MB')
  assert.equal(formatImageMeta(IMAGE), 'PNG · 800×600 · 5.0 KB')
})

test('singleFit：长边 240 且比例钳制 [0.25, 4]，不放大', () => {
  const normal = singleFit({ width: 800, height: 600 })
  assert.equal(normal.width, 240)
  assert.equal(normal.height, 180)
  assert.equal(normal.objectPosition, 'center')

  const wide = singleFit({ width: 4000, height: 100 })
  assert.equal(wide.width, 240)
  assert.equal(wide.height, 60)
  assert.equal(wide.objectPosition, 'left center')

  const tall = singleFit({ width: 100, height: 4000 })
  assert.equal(tall.objectPosition, 'center top')
  assert.ok(tall.height > tall.width)

  const small = singleFit({ width: 30, height: 20 })
  assert.equal(small.width, 30) // 不放大
  assert.equal(small.height, 20)
})
