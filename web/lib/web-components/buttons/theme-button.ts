import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { LightLitElement } from "../light-lit-element";
import { twJoin } from "tailwind-merge";
import type { Theme } from "../../theme";
import "../icons/sun-icon";
import "../icons/moon-icon";

const buttonClass = twJoin(
  "flex cursor-pointer items-center justify-center rounded-full border p-1.5",
  "border-gray-200 bg-gray-50 hover:bg-gray-100",
  "dark:border-neutral-700 dark:bg-neutral-700 dark:hover:bg-neutral-600",
);

/**
 * Dark/light mode toggle. Works with theme.ts which applies the .dark class.
 */
@customElement("theme-button")
export class ThemeButton extends LightLitElement {
  @property({ type: String }) override className = "";
  @state() private theme: Theme = "light";

  connectedCallback() {
    super.connectedCallback();
    // Check initial theme from <html> class (already set by theme.ts).
    this.theme = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
    window.addEventListener("theme-change", ((e: CustomEvent<Theme>) => {
      this.theme = e.detail;
    }) as EventListener);
  }

  private handleClick() {
    const next: Theme = this.theme === "light" ? "dark" : "light";
    window.dispatchEvent(
      new CustomEvent("request-theme-change", { detail: next }),
    );
  }

  render() {
    const label =
      this.theme === "light" ? "Switch to dark mode" : "Switch to light mode";
    return html`
      <button
        class=${buttonClass + (this.className ? " " + this.className : "")}
        aria-label=${label}
        title=${label}
        @click=${this.handleClick}
      >
        ${this.theme === "light" ? html`<sun-icon svgClass="size-4.5"></sun-icon>` : html`<moon-icon svgClass="size-4.5"></moon-icon>`}
      </button>
    `;
  }
}
