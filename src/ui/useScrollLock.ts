import { useEffect } from 'react'

type SavedBodyStyles = {
  overflow: string
  position: string
  top: string
  width: string
}

let lockCount = 0
let savedScrollY = 0
let savedBodyStyles: SavedBodyStyles | null = null

function lockBody(): void {
  if (lockCount === 0) {
    savedScrollY = window.scrollY
    savedBodyStyles = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    }

    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${savedScrollY}px`
    document.body.style.width = '100%'
  }

  lockCount += 1
}

function unlockBody(): void {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount !== 0 || !savedBodyStyles) return

  document.body.style.overflow = savedBodyStyles.overflow
  document.body.style.position = savedBodyStyles.position
  document.body.style.top = savedBodyStyles.top
  document.body.style.width = savedBodyStyles.width
  window.scrollTo(0, savedScrollY)
  savedBodyStyles = null
}

export function useScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return
    lockBody()
    return unlockBody
  }, [active])
}