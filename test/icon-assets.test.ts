import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

const index = read('index.html')
assert.match(index, /href="\/icon-light\.svg"[^>]+media="\(prefers-color-scheme: light\)"/)
assert.match(index, /href="\/icon-dark\.svg"[^>]+media="\(prefers-color-scheme: dark\)"/)
assert.match(index, /rel="apple-touch-icon" href="\/apple-touch-icon\.png" sizes="180x180"/)

const light = read('public/icon-light.svg')
assert.match(light, /fill="#f5f5f3"/)
assert.match(light, /fill="#0a0a0a"/)
assert.match(light, /fill="#2c4bff"/)

const dark = read('public/icon-dark.svg')
const installed = read('public/icon.svg')
for (const svg of [dark, installed]) {
  assert.match(svg, /fill="#0b0b0c"/)
  assert.match(svg, /fill="#f5f5f4"/)
  assert.match(svg, /fill="#7b90ff"/)
  assert.doesNotMatch(svg, /prefers-color-scheme/)
}

const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
  icons: { src: string; sizes: string; type: string; purpose: string }[]
}
assert.deepEqual(
  manifest.icons.map(({ src, sizes, purpose }) => ({ src, sizes, purpose })),
  [
    { src: 'icon-192.png', sizes: '192x192', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', purpose: 'any' },
    { src: 'icon-maskable-512.png', sizes: '512x512', purpose: 'maskable' },
    { src: 'icon.svg', sizes: 'any', purpose: 'any' },
  ],
)

function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(new URL(path, root))
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

assert.deepEqual(pngSize('public/apple-touch-icon.png'), { width: 180, height: 180 })
assert.deepEqual(pngSize('public/icon-192.png'), { width: 192, height: 192 })
assert.deepEqual(pngSize('public/icon-512.png'), { width: 512, height: 512 })
assert.deepEqual(pngSize('public/icon-maskable-512.png'), { width: 512, height: 512 })

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

assert.ok(contrast('#0a0a0a', '#f5f5f3') >= 7)
assert.ok(contrast('#f5f5f4', '#0b0b0c') >= 7)
assert.ok(contrast('#2c4bff', '#f5f5f3') >= 4.5)
assert.ok(contrast('#7b90ff', '#0b0b0c') >= 4.5)

console.log('icon-assets.test.ts: all tests passed')
