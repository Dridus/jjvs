/**
 * Unified esbuild build script for jjvs.
 *
 * Produces two kinds of bundles:
 *   1. Extension host bundle  – Node.js/CJS target, entry: src/vscode/extension.ts
 *   2. Webview bundles        – Browser/ESM target with Svelte 5, one per webview app
 *      (added incrementally as webview phases are implemented)
 *
 * Usage:
 *   node esbuild.mjs              # development build (with source maps)
 *   node esbuild.mjs --production # production build (minified, no source maps)
 *   node esbuild.mjs --watch      # watch mode (development)
 */

import * as esbuild from 'esbuild';
import esbuildSvelte from 'esbuild-svelte';

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');

/** @type {esbuild.BuildOptions} */
const extensionBundleOptions = {
  entryPoints: ['src/vscode/extension.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: 'dist/extension.js',
  // vscode is provided by the extension host at runtime; never bundle it
  external: ['vscode'],
  sourcemap: !isProduction,
  minify: isProduction,
  // Tree-shake aggressively in production
  treeShaking: true,
  metafile: isProduction,
};

/**
 * Webview bundle options. Each webview app gets its own entry point and
 * is bundled separately for the browser environment. The Svelte plugin
 * compiles .svelte files to JS.
 *
 * Phase 13+ will populate this array with graph and preview webview entries.
 *
 * @type {esbuild.BuildOptions[]}
 */
const webviewBundleOptions = [
  // Phase 13: preview webview
  {
    entryPoints: ['webview-ui/preview/main.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outdir: 'dist/webviews/preview',
    sourcemap: !isProduction,
    minify: isProduction,
    plugins: [esbuildSvelte({ compilerOptions: { css: 'injected' } })],
  },
  // Phase 14: graph webview
  {
    entryPoints: ['webview-ui/graph/main.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outdir: 'dist/webviews/graph',
    sourcemap: !isProduction,
    minify: isProduction,
    plugins: [esbuildSvelte({ compilerOptions: { css: 'injected' } })],
  },
];

async function build() {
  const allBundleOptions = [extensionBundleOptions, ...webviewBundleOptions];

  if (isWatch) {
    const contexts = await Promise.all(allBundleOptions.map((opts) => esbuild.context(opts)));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log('[jjvs] Watching for changes...');
  } else {
    const results = await Promise.all(allBundleOptions.map((opts) => esbuild.build(opts)));

    if (isProduction) {
      for (const result of results) {
        if (result.metafile) {
          const text = await esbuild.analyzeMetafile(result.metafile, { verbose: false });
          console.log(text);
        }
      }
    }

    console.log(`[jjvs] Build complete (${isProduction ? 'production' : 'development'})`);
  }
}

build().catch((error) => {
  console.error('[jjvs] Build failed:', error);
  process.exit(1);
});
