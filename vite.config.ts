import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import viteTsConfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const config = defineConfig({
	plugins: [
		devtools({
			removeDevtoolsOnBuild: true,
		}),
		nitro(),
		// this is the plugin that enables path aliases
		viteTsConfigPaths({
			projects: ['./tsconfig.json'],
		}),
		tailwindcss(),
		tanstackStart(),
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

export default config;
