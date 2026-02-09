import '@fontsource-variable/inter';
import { TanStackDevtools } from '@tanstack/react-devtools';
import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, HeadContent, Scripts } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';

// Components
import Footer from '@/components/Footer';
import Header from '@/components/Header';
import { CartProvider } from '@/contexts/CartContext';

// Helpers
import { generateMetaTags } from '@/lib/seo';

// Styles
import appCss from '@/styles.css?url';

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	head: () => {
		const metaTags = generateMetaTags();

		return {
			meta: [
				{
					charSet: 'utf-8',
				},
				{
					name: 'viewport',
					content: 'width=device-width, initial-scale=1',
				},
				...metaTags,
			],
			links: [
				{
					rel: 'stylesheet',
					href: appCss,
				},
			],
		};
	},

	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body className="flex flex-col min-h-screen">
				<CartProvider>
					<Header />
					<main className="flex-1">{children}</main>
					<Footer />
					<TanStackDevtools
						config={{
							position: 'bottom-right',
						}}
						plugins={[
							{
								name: 'Tanstack Router',
								render: <TanStackRouterDevtoolsPanel />,
							},
							{
								name: 'React Query',
								render: <ReactQueryDevtoolsPanel />,
							},
						]}
					/>
					<Scripts />
				</CartProvider>
			</body>
		</html>
	);
}
