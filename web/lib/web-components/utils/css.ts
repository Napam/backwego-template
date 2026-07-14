export function getTailwindCSSHREF() {
  const link = document.querySelector('#tailwindcss')
  if (link) {
    return link.getAttribute('href') as string
  }
  return ''
}
