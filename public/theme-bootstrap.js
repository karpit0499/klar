// Synchronous, content-security-policy-compatible theme setup before first
// paint. Keep this dependency-free because it runs before the application.
;(function () {
  try {
    var mode = localStorage.getItem('klar-theme') || 'system'
    var dark =
      mode === 'dark' ||
      (mode === 'system' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    var root = document.documentElement
    root.classList.toggle('dark', dark)
    root.style.colorScheme = dark ? 'dark' : 'light'
  } catch (_error) {
    // The default light theme is safe when storage or media queries are absent.
  }
})()