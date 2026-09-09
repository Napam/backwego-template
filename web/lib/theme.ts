export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'backwegotemplate-theme'
const darkMedia = window.matchMedia('(prefers-color-scheme: dark)')

// localStorage throws when storage is blocked (disabled cookies, private mode).
// A saved theme is a nice-to-have, so never let it break the rest of the bundle.
function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'dark' || stored === 'light' ? stored : null
  } catch {
    return null
  }
}

function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Ignore: the choice still applies to this page load.
  }
}

function getInitialTheme(): Theme {
  return readStoredTheme() ?? (darkMedia.matches ? 'dark' : 'light')
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  window.dispatchEvent(new CustomEvent('theme-change', { detail: theme }))
}

// Apply immediately on load (this script runs synchronously in <head>).
applyTheme(getInitialTheme())

// Respond to system preference changes when no explicit choice is stored.
darkMedia.addEventListener('change', () => {
  if (!readStoredTheme()) {
    applyTheme(darkMedia.matches ? 'dark' : 'light')
  }
})

// Toggle from the theme button.
window.addEventListener('request-theme-change', ((e: CustomEvent<Theme>) => {
  storeTheme(e.detail)
  applyTheme(e.detail)
}) as EventListener)
