import { Glob } from 'bun'
import fs from 'fs'
import path from 'path'

const isProdBuild = process.env.ENV === 'prod'
// Overridable so `task check.web` can build to a scratch dir instead of
// clobbering static/ while a dev session or production build is running.
const outdir = process.env.OUTDIR ?? 'static'

/**
 * All lib/ components → single bundle.js, loaded sync in <head>.
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
const nonPageDirs = new Set(['assets', 'lib', 'node_modules', 'static', 'tmp'])

/**
 * One bundle per page dir into page-files/ (root/root.ts → page-files/root/root.js).
 * Must NOT import from lib/: iife has no code splitting, so lib code would
 * duplicate per page and re-running customElements.define throws. bundle.js
 * loads first, so page scripts can assume components are registered.
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

// ── Static asset exposure ──

/**
 * Hardlink not copy — repo keeps one on-disk copy. Same volume always:
 * assets/ and output dir are both in the repo, or both in the Docker overlay.
 */
// Returns false when the dest already pointed at src and nothing was done.
function ensureHardlink(src: string, dest: string): boolean {
  if (!fs.existsSync(src)) {
    throw new Error(
      `Source file to hardlink does not exist: ${src}. Expected the file to be at ${path.resolve(src)}`
    )
  }

  // Already linked to src? Skip — touching fs fires a watch event on the
  // source (macOS kqueue reports link() as CREATE) and loops `task dev`.
  if (fs.existsSync(dest) && fs.statSync(dest).ino === fs.statSync(src).ino) {
    return false
  }

  fs.rmSync(dest, { force: true })

  const destDir = path.dirname(dest)
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }

  fs.linkSync(src, dest)
  return true
}

/**
 * Hardlink every asset into <outdir>/assets/, mirroring subdirs. Runs after
 * bundle steps so link/prune can't interfere with fresh output.
 */
function exposeFiles() {
  const start = Date.now()

  const assetOutdir = `${outdir}/assets`
  const glob = new Glob('assets/**/*')
  const hardlinks = Array.from(glob.scanSync('.'))
    .filter((f) => fs.statSync(f).isFile())
    .map((src) => ({
      src,
      dest: `${assetOutdir}/${src.replace('assets/', '')}`,
    }))

  let linked = 0
  for (const { src, dest } of hardlinks) {
    if (ensureHardlink(src, dest)) linked++
  }

  // Prune stale hardlinks: any file in assets/ whose path is not a current
  // source → renamed/deleted asset. Scan only assets/ — ours exclusively;
  // never touch the rest of outdir.
  if (fs.existsSync(assetOutdir)) {
    const sourceDests = new Set(hardlinks.map((h) => h.dest))
    for (const entry of new Glob('**/*').scanSync(assetOutdir)) {
      const dest = `${assetOutdir}/${entry}`
      const stat = fs.statSync(dest)
      if (stat.isFile() && !sourceDests.has(dest)) {
        fs.rmSync(dest)
      }
    }
  }

  return {
    spent: Date.now() - start,
    hardlinkedFiles: hardlinks,
    linked,
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
const exposeRes = exposeFiles()

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

console.log(`${cyan('build')} Hardlinked ${exposeRes.linked} files ${dim(`${exposeRes.spent}ms`)}`)
for (const { src, dest } of exposeRes.hardlinkedFiles) {
  console.log(`${dim('│')} ${src} ${dim('→')} ${dest} ${dim(fileSize(dest))}`)
}

console.log(`${cyan('build')} Done in ${green(`${Date.now() - start}ms`)}`)
