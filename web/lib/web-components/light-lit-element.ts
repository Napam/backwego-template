import { LitElement } from 'lit'

/**
 * Like LitElement, but renders into the element itself instead of a shadow
 * root. Use it for components that don't need slots (slots require shadow DOM),
 * such as icons. Rendering in the light DOM also lets Tailwind's `group`
 * variants work.
 */
export class LightLitElement extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this
  }
}
