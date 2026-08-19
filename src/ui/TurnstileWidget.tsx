import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: {
        sitekey: string
        action: string
        appearance: 'interaction-only'
        callback: (token: string) => void
        'expired-callback': () => void
        'error-callback': () => void
      }) => string
      remove: (widgetId: string) => void
    }
  }
}

let scriptPromise: Promise<void> | undefined

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-klar-turnstile]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => {
        existing.remove()
        scriptPromise = undefined
        reject(new Error('turnstile_load_failed'))
      }, { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.dataset.klarTurnstile = 'true'
    script.onload = () => resolve()
    script.onerror = () => {
      script.remove()
      scriptPromise = undefined
      reject(new Error('turnstile_load_failed'))
    }
    document.head.append(script)
  })
  return scriptPromise
}

export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let active = true
    let widgetId = ''
    const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY
    if (!sitekey || !root.current) return
    void loadTurnstile()
      .then(() => {
        if (!active || !root.current || !window.turnstile) return
        widgetId = window.turnstile.render(root.current, {
          sitekey,
          action: 'klar_feedback',
          appearance: 'interaction-only',
          callback: onToken,
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        })
      })
      .catch(() => onToken(''))
    return () => {
      active = false
      if (widgetId) window.turnstile?.remove(widgetId)
    }
  }, [onToken])
  return <div ref={root} />
}
