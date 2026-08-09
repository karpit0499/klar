import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const panel = readFileSync('src/ui/DesktopCapabilityPanel.tsx', 'utf8')
const settings = readFileSync('src/ui/SettingsStep.tsx', 'utf8')
const main = readFileSync('src/main.tsx', 'utf8')

assert.match(panel, /desktopBridge\(\)/)
assert.match(panel, /system\.getInfo/)
assert.match(panel, /runtime\.start/)
assert.match(panel, /runtime\.stop/)
assert.match(panel, /diagnostics\.getRedactedReport/)
assert.doesNotMatch(panel, /(?:readFile|writeFile|exec|spawn|shell\.|process\.)/)
assert.match(panel, /never a file path/)
assert.match(panel, /niemals einen Dateipfad/)
assert.match(panel, /qwen3\.5-9b-q4km-base-validation/)
assert.doesNotMatch(panel, /DEFAULT_ARTIFACT_ID = 'qwen3\.5-9b-q4km-klar-lab-1'/)
assert.match(settings, /<DesktopCapabilityPanel \/>/)
assert.match(main, /!window\.klarDesktop/)

console.log('v26-desktop-panel.test.ts: all tests passed')
