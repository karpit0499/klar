/** Trigger one browser download without revoking its object URL too early. */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Mobile Safari can cancel the download if the URL is revoked synchronously.
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
