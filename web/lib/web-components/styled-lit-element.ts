import { LitElement, ReactiveElement } from "lit";
import { getTailwindCSSHREF } from "./utils/css";

type Theme = "dark" | "light";

// Fetches the CSS text synchronously (hits the HTTP cache since the page
// <link> tag already loaded the file), constructs a CSSStyleSheet object
// once, and shares it across all shadow roots — no re-parsing, no FOUC.
let sharedTailwindSheet: CSSStyleSheet | null = null;

function getSharedTailwindSheet(): CSSStyleSheet {
  if (sharedTailwindSheet) return sharedTailwindSheet;

  const xhr = new XMLHttpRequest();
  xhr.open("GET", getTailwindCSSHREF(), false); // synchronous
  xhr.send();

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(xhr.responseText);

  sharedTailwindSheet = sheet;
  return sharedTailwindSheet;
}

// Custom elements default to display:inline which breaks positioning
// and sizing in standards mode. This shared sheet forces block display.
const hostSheet = new CSSStyleSheet();
hostSheet.replaceSync(":host { display: block; }");

export class StyledLitElement extends LitElement {
  currentTheme: Theme = "light";

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    const shadowRoot = this.attachShadow(
      (this.constructor as typeof ReactiveElement).shadowRootOptions,
    );

    shadowRoot.adoptedStyleSheets = [getSharedTailwindSheet(), hostSheet];

    // Lit renders into this div so we can toggle the "dark" class on it to
    // scope Tailwind dark: variants without touching the host element.
    const div = document.createElement("div");
    shadowRoot.appendChild(div);

    subscribeDarkMode({
      runOnInit: true,
      onChange: (theme) => {
        this.currentTheme = theme;
        div.classList.toggle("dark", this.currentTheme === "dark");
        this.themeChanged(theme);
      },
    });

    return div;
  }

  themeChanged(_: Theme) {
    // Do nothing by default
  }
}

export function subscribeDarkMode(args: {
  runOnInit?: boolean;
  onChange?: (t: Theme) => void;
}) {
  const { runOnInit, onChange } = args;

  if (runOnInit) {
    onChange?.(checkDarkMode());
  }

  checkDarkMode();
  new MutationObserver((mutations) =>
    onChange?.(checkDarkMode(mutations)),
  ).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

export function checkDarkMode(mutations?: MutationRecord[]): Theme {
  const globalRoot = document.documentElement;
  if (!mutations) {
    if (globalRoot.classList.contains("dark")) {
      return "dark";
    } else {
      return "light";
    }
  }

  for (const mutation of mutations) {
    if (mutation.attributeName === "class") {
      if (globalRoot.classList.contains("dark")) {
        return "dark";
      } else {
        return "light";
      }
    }
  }

  return "light";
}

