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
  const libFiles = Array.from(glob.scanSync('.'))
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

// ── Summary ──

const libSize = fileSize(libBundleRes.out)
console.log(
  `${cyan('build')} ${yellow(libBundleRes.out)} ${green(libSize)} ${bundleAttrs(libBundleRes)} ${dim(`${libBundleRes.spent}ms`)}`
)
for (const src of libBundleRes.included) {
  console.log(`${dim('│')} ${src}`)
}

console.log(`${cyan('build')} Done in ${green(`${Date.now() - start}ms`)}`)
