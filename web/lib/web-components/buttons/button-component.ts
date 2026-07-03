import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { twJoin, twMerge } from "tailwind-merge";
import { StyledLitElement } from "../styled-lit-element";
import { focusClass } from "../common";

const purposeClasses = {
  primary: twJoin(
    "bg-primary-400 hover:bg-primary-500 text-white",
    "dark:bg-primary-600 dark:hover:bg-primary-700 dark:text-neutral-200",
    focusClass,
    "focus:border-primary-700 focus:ring-primary-700",
    "dark:focus:border-white dark:focus:ring-white",
  ),
  secondary: twJoin(
    "border-primary-400 text-primary-500 hover:bg-primary-50 focus:ring-primary-600 border bg-white",
    "dark:border-primary-600 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600",
    focusClass,
  ),
  lowRisk: twJoin(
    "border border-red-500 bg-white text-red-500 hover:bg-red-50 focus:ring-red-500",
    "dark:border-red-600 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600",
    focusClass,
    "focus:border-red-500 focus:ring-red-500",
  ),
};

/**
 * A button. Use `type="submit"` to submit the surrounding native HTML <form>;
 * the default `type="button"` does nothing on its own (add your own @click).
 */
@customElement("button-component")
export class ButtonComponent extends StyledLitElement {
  // Form-associated custom element: a shadow-DOM <button> can't reach a form in
  // the light DOM, so we associate with it and call requestSubmit() (see below).
  static formAssociated = true;
  private internals = this.attachInternals();

  @property({ type: String }) buttonClass = "";
  @property({ type: Boolean }) disabled = false;
  @property({ type: String }) type: "submit" | "button" = "button";
  @property({ type: String }) purpose: keyof typeof purposeClasses = "primary";

  private handleClick() {
    if (this.disabled) return;
    if (this.type === "submit") {
      this.internals.form?.requestSubmit();
    }
  }

  render() {
    const classes = twMerge(
      "flex w-fit cursor-pointer justify-center gap-2 rounded-xs px-5 py-2.5 font-semibold text-nowrap disabled:cursor-not-allowed disabled:opacity-50",
      purposeClasses[this.purpose],
      this.buttonClass,
    );

    return html`
      <button
        type="button"
        .disabled=${this.disabled}
        class=${classes}
        @click=${this.handleClick}
      >
        <slot></slot>
      </button>
    `;
  }
}
