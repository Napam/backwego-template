import { LitElement } from 'lit'

/**
 * Like LitElement, but without shadow dom. Useful for basic things that
 * DOES NOT USE SLOTS. Slots needs shadow dom in order to work. Examples
 * of things that are using this class are icons. Then tailwind's group css
 * functionality works out of the box.
 */
export class LightLitElement extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this
  }
}
