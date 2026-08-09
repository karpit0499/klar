import net from 'node:net'

/**
 * Reserve an ephemeral loopback port long enough to discover its number.
 * llama-server binds immediately afterwards. Its API key remains the security
 * boundary if another local process wins the small release/bind race.
 */
export function allocateLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not allocate a loopback port.')))
        return
      }
      const port = address.port
      server.close((error) => {
        if (error) reject(error)
        else resolve(port)
      })
    })
  })
}
