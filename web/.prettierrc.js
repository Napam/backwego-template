/**
 * For people using prettierd, when prettierrc is js file, remember to actually restart prettierd-daemon
 * for changes to take effect.
 *
 * @type {import("prettier").Config | import("prettier-plugin-tailwindcss").PluginOptions}
 */
const config = {
  printWidth: 110,
  plugins: ['prettier-plugin-tailwindcss'],
  semi: false,
  singleQuote: true,
  tabWidth: 2,
  tailwindStylesheet: './tailwind.css',
  trailingComma: 'es5',
}

export default config
