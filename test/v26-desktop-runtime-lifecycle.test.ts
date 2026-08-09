import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WindowRuntimeOwner } from '../desktop/runtime/window-runtime-owner.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const mainSource = await readFile(path.join(root, 'desktop', 'main.mjs'), 'utf8')
assert.match(mainSource, /runtimeOwner\.create\(/)
assert.match(mainSource, /runtimeOwner\.release\(runtime\)/)
assert.match(mainSource, /runtimeOwner\.shutdown\(\)/)

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const owner = new WindowRuntimeOwner()
const firstStop = deferred()
let firstStops = 0
const first = {
  async stop() {
    firstStops += 1
    await firstStop.promise
  },
}

assert.equal(await owner.create(() => first), first)
assert.equal(owner.current(), first)
const releasingFirst = owner.release(first)
assert.equal(owner.current(), null)
assert.equal(owner.release(first), releasingFirst)

let secondCreated = false
const second = {
  async stop() {},
}
const creatingSecond = owner.create(() => {
  secondCreated = true
  return second
})
await Promise.resolve()
assert.equal(
  secondCreated,
  false,
  'reactivation must wait until the closed window runtime has stopped',
)

firstStop.resolve()
await releasingFirst
assert.equal(await creatingSecond, second)
assert.equal(firstStops, 1, 'a closed window runtime must be stopped exactly once')
assert.equal(owner.current(), second)

await owner.shutdown()
assert.equal(owner.current(), null)

const invalidOwner = new WindowRuntimeOwner()
await assert.rejects(
  invalidOwner.create(() => ({})),
  /must provide stop/,
)

console.log('v26-desktop-runtime-lifecycle.test.ts: all tests passed')
