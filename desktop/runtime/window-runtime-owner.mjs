export class WindowRuntimeOwner {
  #current = null
  #pendingStop = Promise.resolve()
  #stopTasks = new WeakMap()

  current() {
    return this.#current
  }

  async create(factory) {
    await this.#pendingStop
    if (this.#current) {
      throw new Error('A window runtime is already attached.')
    }
    const runtime = factory()
    if (!runtime || typeof runtime.stop !== 'function') {
      throw new TypeError('A window runtime must provide stop().')
    }
    this.#current = runtime
    return runtime
  }

  release(runtime) {
    const existing = this.#stopTasks.get(runtime)
    if (existing) return existing
    if (this.#current === runtime) this.#current = null
    const stopTask = this.#pendingStop.then(() => runtime.stop())
    this.#pendingStop = stopTask
    this.#stopTasks.set(runtime, stopTask)
    return stopTask
  }

  async shutdown() {
    const current = this.#current
    if (current) this.release(current)
    await this.#pendingStop
  }
}
