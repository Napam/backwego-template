import { html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { twMerge } from 'tailwind-merge'
import { LightLitElement } from '../light-lit-element'

@customElement('moon-icon')
export class MoonIcon extends LightLitElement {
  @property({ type: String }) svgClass = ''

  render() {
    return html`
      <svg
        class=${twMerge('size-6 text-gray-600 dark:text-gray-200', this.svgClass)}
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    `
  }
}
