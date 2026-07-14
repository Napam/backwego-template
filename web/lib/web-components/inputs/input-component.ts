import { StyledLitElement } from '../styled-lit-element'
import { html, type PropertyValues } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { twJoin, twMerge } from 'tailwind-merge'
import { focusWithinClass } from '../common'

const disabledClass = twJoin(
  'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 placeholder:text-gray-300',
  'dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-500 dark:placeholder:text-neutral-600'
)

const defaultInputClass = twJoin(
  'flex w-full items-center rounded-xs border p-2.5 placeholder:font-extralight',
  'border-gray-300 bg-gray-50 text-gray-600 placeholder:text-gray-400',
  'dark:border-neutral-500 dark:bg-neutral-700 dark:text-neutral-200 dark:placeholder:text-neutral-400',
  focusWithinClass
)

/**
 * A text input that submits inside native HTML <form>s, like <input name="...">.
 */
@customElement('input-component')
export class InputComponent extends StyledLitElement {
  // Form-associated custom element: `formAssociated` + `attachInternals()` let a
  // shadow-DOM element take part in forms. `setFormValue()` (below) then submits
  // the value under the host's `name` attribute.
  static formAssociated = true
  private internals = this.attachInternals()

  @property({ type: String }) divClass = ''
  @property({ type: String }) inputClass = ''
  @property({ type: String }) id = ''
  @property({ type: String }) name = ''
  @property({ type: String }) placeholder = ''
  @property({ type: String }) type = 'text'
  @property({ type: String }) value = ''
  @property({ type: Boolean }) disabled = false

  // Keep the form value in sync whenever `value` changes, this covers both the
  // initial render (so unedited inputs still submit their value) and any
  // programmatic updates.
  protected override updated(changed: PropertyValues) {
    if (changed.has('value')) {
      this.internals.setFormValue(this.value)
    }
  }

  private handleInput(event: Event) {
    const input = event.target as HTMLInputElement
    this.value = input.value

    // Re-dispatch so parent elements/JS can still listen if they want to.
    this.dispatchEvent(
      new CustomEvent(event.type, {
        detail: this.value,
        bubbles: true,
        composed: true,
      })
    )
  }

  render() {
    return html`
      <div class=${twMerge(this.divClass)}>
        <slot name="title"></slot>
        <input
          class=${twMerge(defaultInputClass, this.inputClass, this.disabled && disabledClass)}
          .id=${this.id}
          .type=${this.type}
          .value=${this.value}
          .disabled=${this.disabled}
          .placeholder=${this.placeholder}
          @input=${this.handleInput}
          @change=${this.handleInput}
        />
        <slot name="footer"></slot>
      </div>
    `
  }
}
