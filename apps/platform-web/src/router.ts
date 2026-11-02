import { useEffect, useState } from 'react'

/** Push a path onto history and notify listeners. */
export function navigate(to: string, options: { replace?: boolean } = {}): void {
  window.history[options.replace === true ? 'replaceState' : 'pushState']({}, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** @returns the current pathname, re-rendering on history changes. */
export function usePathname(): string {
  const [pathname, setPathname] = useState(() => window.location.pathname)
  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return pathname
}
