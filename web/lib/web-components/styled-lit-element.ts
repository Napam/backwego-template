import { LitElement, ReactiveElement } from 'lit'
import { getTailwindCSSHREF } from './utils/css'

// Fetches the CSS text synchronously (hits the HTTP cache since the page
// <link> tag already loaded the file), constructs a CSSStyleSheet object
// once, and shares it across all shadow roots — no re-parsing, no FOUC.
let sharedTailwindSheet: CSSStyleSheet | null = null

function getSharedTailwindSheet(): CSSStyleSheet {
  if (sharedTailwindSheet) return sharedTailwindSheet

  const xhr = new XMLHttpRequest()
  xhr.open('GET', getTailwindCSSHREF(), false) // synchronous
  xhr.send()

  const sheet = new CSSStyleSheet()
  sheet.replaceSync(xhr.responseText)

  sharedTailwindSheet = sheet
  return sharedTailwindSheet
}

// Custom elements default to display:inline which breaks positioning
// and sizing in standards mode. This shared sheet forces block display.
const hostSheet = new CSSStyleSheet()
hostSheet.replaceSync(':host { display: block; }')

/**
 * LitElement with shadow DOM that shares the page's Tailwind stylesheet and
 * follows the global dark/light theme. Use this when a component needs slots
 * (which require shadow DOM); otherwise prefer LightLitElement.
 */
export class StyledLitElement extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    const shadowRoot = this.attachShadow((this.constructor as typeof ReactiveElement).shadowRootOptions)

    shadowRoot.adoptedStyleSheets = [getSharedTailwindSheet(), hostSheet]

    // Lit renders into this div so we can toggle the "dark" class on it to
    // scope Tailwind dark: variants without touching the host element.
    const div = document.createElement('div')
    shadowRoot.appendChild(div)

    return div
  }

  // Shadow DOM can't see the "dark" class on <html>, so mirror it onto the
  // render root. theme.ts dispatches "theme-change" on every theme change.
  private syncTheme = () => {
    const dark = document.documentElement.classList.contains('dark')
    ;(this.renderRoot as HTMLElement).classList.toggle('dark', dark)
  }

  connectedCallback() {
    super.connectedCallback()
    this.syncTheme()
    window.addEventListener('theme-change', this.syncTheme)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('theme-change', this.syncTheme)
  }
}
