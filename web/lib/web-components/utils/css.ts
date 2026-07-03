export function getTailwindCSSHREF() {
  const link = document.querySelector("#tailwindcss");
  if (link) {
    return link.getAttribute("href") as string;
  }
  return "";
}

/**
 * Convenience template literal tag to hint tailwind to sort
 */
export function tw(strings: TemplateStringsArray, ...values: unknown[]) {
  return String.raw({ raw: strings }, ...values);
}