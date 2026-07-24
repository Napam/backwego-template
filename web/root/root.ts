// Page-specific JS for the root page. build.ts bundles this to
// static/page-files/root/root.js, loaded per-page with <script defer>.
//
// Page files enhance server-rendered HTML and must NOT import from lib/:
// the iife bundle has no code splitting, so lib code would be duplicated and
// re-registering custom elements throws. bundle.js loads first (in <head>),
// so components are already registere.

// Progressive enhancement: confirm before submitting any form marked with
// data-confirm (e.g. the delete buttons). Without JS the form still submits.
document.querySelectorAll<HTMLFormElement>('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    if (!window.confirm(form.dataset.confirm)) {
      event.preventDefault()
    }
  })
})
