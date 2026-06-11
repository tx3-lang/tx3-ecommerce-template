import viteReact from '@vitejs/plugin-react';
import viteTsConfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// Slim config for the test runner. Vitest prefers this file over vite.config.ts,
// so unit tests load ONLY the plugins they need — path aliases (`@/`) and the
// React/JSX transform for component tests. The app's server/watcher plugins
// (nitro, tanstackStart, devtools, tailwind) are intentionally omitted: they
// hold ~238 open file handles that block the Vite server from exiting, causing
// the "close timed out after 10000ms" hang after the suite passes.
export default defineConfig({
	plugins: [
		viteTsConfigPaths({
			projects: ['./tsconfig.json'],
		}),
		viteReact(),
	],
	test: {
		environment: 'node',
		// Include both standard test files and e2e files.
		// The 'test' npm script excludes tests/e2e/** via --exclude.
		// The 'test:e2e' npm script filters to tests/e2e/**/*.e2e.ts.
		include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)', '**/*.e2e.ts'],
		deps: {
			optimizer: {
				web: {
					include: ['react', 'react-dom', '@testing-library/react'],
				},
			},
		},
	},
});
