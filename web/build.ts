import { Glob } from 'bun'
import fs from 'fs'

const isProdBuild = process.env.ENV === 'prod'
// Overridable so `task check.web` can build to a scratch dir instead of
// clobbering static/ while a dev session or production build is running.
const outdir = process.env.OUTDIR ?? 'static'

/**
 * Finds all .ts files in lib/ and bundles them into a single file.
 * This is where web components (custom elements) get bundled so they
 * can be loaded synchronously in the HTML.
 */
async function bundleLib() {
  const glob = new Glob('lib/**/*.ts')
  const libFiles = Array.from(glob.scanSync('.')).filter((f) => !f.endsWith('.d.ts'))
  const outfile = `${outdir}/bundle.js`

  const start = Date.now()

  // Placed in tmp/ which is excluded from wgo watch (-xdir=tmp) and gitignored.
  // Kept after the build for sanity checking.
  fs.mkdirSync('tmp', { recursive: true })
  const tmpEntry = 'tmp/bundle-entry.ts'
  fs.writeFileSync(tmpEntry, libFiles.map((f) => `import "../${f}"`).join('\n'))

  const buildResult = await Bun.build({
    entrypoints: [tmpEntry],
    outdir,
    naming: 'bundle.[ext]',
    minify: isProdBuild,
    sourcemap: isProdBuild ? 'none' : 'linked',
    target: 'browser',
    format: 'iife',
    throw: false,
  })

  if (!buildResult.success) {
    console.error('Bundle lib failed:')
    for (const log of buildResult.logs) {
      console.error(log)
    }
    process.exit(1)
  }

  return {
    out: outfile,
    included: libFiles,
    spent: Date.now() - start,
    minify: isProdBuild,
    treeShaking: true,
  }
}

/**
 * Top-level directories that never contain page-specific code.
 */
const nonPageDirs = new Set(['lib', 'node_modules', 'static', 'tmp'])

/**
 * Bundles every .ts file outside lib/ (e.g. root/root.ts) as its own entry
 * point into page-files/, so each page can load only its own JS on top of
 * the shared bundle.js:
 *
 *   <script src=".../static/bundle.js"></script>
 *   <script defer src=".../static/page-files/root/root.js"></script>
 *
 * Page files must not import from lib/: iife has no code splitting, so lib
 * code would be duplicated into every page bundle — and re-running component
 * registration (customElements.define) throws. bundle.js loads first, so
 * page scripts can assume all components are already registered.
 */
async function bundlePageFiles() {
  const glob = new Glob('*/**/*.ts')
  const pageFiles = Array.from(glob.scanSync('.')).filter(
    (f) => !f.endsWith('.d.ts') && !nonPageDirs.has(f.split('/')[0])
  )
  const pageOutdir = `${outdir}/page-files`

  // Wipe first so renamed/deleted page files don't leave stale bundles behind.
  fs.rmSync(pageOutdir, { recursive: true, force: true })

  if (pageFiles.length === 0) return null

  const start = Date.now()

  const buildResult = await Bun.build({
    entrypoints: pageFiles,
    outdir: pageOutdir,
    minify: isProdBuild,
    sourcemap: isProdBuild ? 'none' : 'linked',
    target: 'browser',
    format: 'iife',
    root: '.',
    throw: false,
  })

  if (!buildResult.success) {
    console.error('Bundle page files failed:')
    for (const log of buildResult.logs) {
      console.error(log)
    }
    process.exit(1)
  }

  return {
    out: pageOutdir,
    included: pageFiles,
    spent: Date.now() - start,
    minify: isProdBuild,
    treeShaking: true,
  }
}

// ── ANSI helpers ──

const dim = (s: string) => `\x1b[2m${s}\x1b[22m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[m`
const green = (s: string) => `\x1b[32m${s}\x1b[m`
const cyan = (s: string) => `\x1b[36m${s}\x1b[m`

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

function fileSize(filePath: string): string {
  try {
    return formatBytes(fs.statSync(filePath).size)
  } catch {
    return '?'
  }
}

function dirSize(dirPath: string): { total: number; count: number } {
  let total = 0
  let count = 0
  for (const entry of new Glob('**/*').scanSync(dirPath)) {
    const stat = fs.statSync(`${dirPath}/${entry}`)
    if (stat.isFile()) {
      total += stat.size
      count++
    }
  }
  return { total, count }
}

function bundleAttrs(res: { minify: boolean; treeShaking: boolean }): string {
  const parts: string[] = []
  if (res.minify) parts.push('minified')
  if (res.treeShaking) parts.push('tree-shaken')
  return parts.length ? dim(`(${parts.join(', ')})`) : ''
}

// ── Build ──

const start = Date.now()

console.log(`${cyan('build')} Starting JS build${isProdBuild ? green(' [production]') : ''}`)
const libBundleRes = await bundleLib()
const pageBundleRes = await bundlePageFiles()

// ── Summary ──

const libSize = fileSize(libBundleRes.out)
console.log(
  `${cyan('build')} ${yellow(libBundleRes.out)} ${green(libSize)} ${bundleAttrs(libBundleRes)} ${dim(`${libBundleRes.spent}ms`)}`
)
for (const src of libBundleRes.included) {
  console.log(`${dim('│')} ${src}`)
}

if (pageBundleRes) {
  const pageDir = dirSize(pageBundleRes.out)
  console.log(
    `${cyan('build')} ${yellow(`${pageBundleRes.out}/`)} ${green(formatBytes(pageDir.total))} ${dim(`${pageDir.count} files`)} ${bundleAttrs(pageBundleRes)} ${dim(`${pageBundleRes.spent}ms`)}`
  )
  for (const src of pageBundleRes.included) {
    console.log(`${dim('│')} ${src}`)
  }
}

console.log(`${cyan('build')} Done in ${green(`${Date.now() - start}ms`)}`)
