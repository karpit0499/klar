import { useEffect, useId, useRef } from 'react'
import { Button } from './atoms'

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const titleId = useId()
  const descriptionId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    dialog.current?.querySelector<HTMLElement>('[data-initial-focus]')?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancelRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog.current) return
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [open])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        ref={dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6"
      >
        <h2 id={titleId} className="text-xl font-semibold text-ink">{title}</h2>
        <p id={descriptionId} className="mt-2 text-base leading-relaxed text-muted">
          {description}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button data-initial-focus variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
