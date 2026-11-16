/**
 * Lightweight shell routing (no react-router): `/` = Wizard, `/studio` = Studio SQL.
 * Keeps header nav and deep links in sync via History API.
 */

export type ShellMode = 'wizard' | 'studio'

/** Normalize pathname → shell mode. */
export function shellModeFromPath(pathname: string): ShellMode {
  const path = (pathname || '/').split('?')[0]?.split('#')[0] ?? '/'
  const trimmed = path.replace(/\/+$/, '') || '/'
  return trimmed === '/studio' ? 'studio' : 'wizard'
}

export function pathForShellMode(mode: ShellMode): string {
  return mode === 'studio' ? '/studio' : '/'
}

/** Push or replace URL for the given mode (no-op if already there). */
export function navigateShellMode(
  mode: ShellMode,
  opts?: { replace?: boolean },
): void {
  if (typeof window === 'undefined') return
  const next = pathForShellMode(mode)
  const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (shellModeFromPath(window.location.pathname) === mode && !opts?.replace) {
    return
  }
  const url = next + window.location.search + window.location.hash
  if (url === cur) return
  if (opts?.replace) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)
}
