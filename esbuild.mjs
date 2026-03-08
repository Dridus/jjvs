/**
 * Unified esbuild build script for jjvs.
 *
 * Produces two kinds of bundles:
 *   1. Extension host bundle  – Node.js/CJS target, entry: src/vscode/extension.ts
 *   2. Webview bundles        – Browser/ESM target with Svelte 5, one per webview app
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

/** @type {Partial<esbuild.BuildOptions>} */
const commonOptions = {
  bundle: true,
  sourcemap: !isProduction,
  minify: isProduction,
  metafile: isProduction,
};

/** @type {esbuild.Plugin} */
const watchLogPlugin = {
  name: 'watch-log-plugin',
  setup: isWatch
    ? (build) => {
        const prefix = `[watch ${build.initialOptions.outfile ?? build.initialOptions.outdir}]`;
        build.onStart(() => {
          console.log(`${prefix} Build started`);
        });
        build.onEnd((result) => {
          result.errors.forEach(({ text, location }) => {
            console.error(`${location.file}:${location.line}:${location.column} - ${text}`);
          });
          console.log(`${prefix} Waiting for changes...`);
        });
      }
    : () => {},
};

/** @type {esbuild.BuildOptions} */
const extensionBundleOptions = {
  ...commonOptions,
  entryPoints: ['src/vscode/extension.ts'],
  format: 'cjs',
  platform: 'node',
  outfile: 'dist/extension.js',
  // vscode is provided by the extension host at runtime; never bundle it
  external: ['vscode'],
  // Tree-shake aggressively in production
  treeShaking: true,
  plugins: [watchLogPlugin],
};

/**
 * Webview bundle options. Each webview app gets its own entry point and
 * is bundled separately for the browser environment. The Svelte plugin
 * compiles .svelte files to JS.
 *
 * @type {esbuild.BuildOptions[]}
 */
const webviewBundleOptions = [
  // Preview webview
  {
    entryPoints: ['webview-ui/preview/main.ts'],
    format: 'esm',
    platform: 'browser',
    outdir: 'dist/webviews/preview',
    plugins: [esbuildSvelte({ compilerOptions: { css: 'injected' } }), watchLogPlugin],
  },
  // Graph webview
  {
    entryPoints: ['webview-ui/graph/main.ts'],
    format: 'esm',
    platform: 'browser',
    outdir: 'dist/webviews/graph',
    plugins: [esbuildSvelte({ compilerOptions: { css: 'injected' } }), watchLogPlugin],
  },
];

async function build() {
  const allBundleOptions = [extensionBundleOptions, ...webviewBundleOptions];

  if (isWatch) {
    const contexts = await Promise.all(allBundleOptions.map((opts) => esbuild.context(opts)));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
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
