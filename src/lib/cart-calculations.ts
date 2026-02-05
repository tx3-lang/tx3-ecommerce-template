import type { CartItem, CartItemWithCurrency } from './cart-storage';
import {
	createCurrencyKey,
	createCurrencyKeyById,
	getCurrencySymbol,
	getCurrencyTypeById,
	groupItemsByCurrencyById,
} from './unified-formatter';

export interface CartTotals {
	totalItems: number;
	subtotal: number;
	currencyBreakdown: Record<
		string,
		{
			subtotal: number;
			itemCount: number;
			currencyType: 'ADA' | 'TOKEN';
			currencySymbol: string;
			currencyDecimals: number;
			policyId: string | null;
			assetName: string | null;
		}
	>;
	currencies: string[];
}

export function calculateCartTotals(items: CartItem[]): CartTotals {
	const itemsWithCurrency: CartItemWithCurrency[] = items.map(item => {
		const policyId = item.product.supported_tokens?.policy_id ?? null;
		const assetName = item.product.supported_tokens?.asset_name ?? null;

		return {
			...item,
			currencyKey: createCurrencyKey(policyId, assetName),
			currencyType: getCurrencyTypeById(item.product.token_id),
			currencySymbol: getCurrencySymbol(policyId, assetName, item.product.supported_tokens),
			currencyDecimals: item.product.supported_tokens?.decimals ?? 6,
		};
	});

	const groupedItems = groupItemsByCurrencyById(
		itemsWithCurrency.map(item => ({
			token_id: item.product.token_id,
		})),
	);
	const currencies = Object.keys(groupedItems);

	const currencyBreakdown: CartTotals['currencyBreakdown'] = {};

	let totalItems = 0;
	let subtotal = 0;

	currencies.forEach(currencyKey => {
		const itemsInCurrency = itemsWithCurrency.filter(
			item => createCurrencyKeyById(item.product.token_id) === currencyKey,
		);
		const currencySubtotal = itemsInCurrency.reduce((sum, item) => sum + item.subtotal, 0);
		const currencyItemCount = itemsInCurrency.reduce((sum, item) => sum + item.quantity, 0);

		if (itemsInCurrency.length > 0) {
			const { currencyType, currencySymbol, currencyDecimals, product } = itemsInCurrency[0];

			currencyBreakdown[currencyKey] = {
				subtotal: currencySubtotal,
				itemCount: currencyItemCount,
				currencyType,
				currencySymbol,
				currencyDecimals,
				policyId: product.supported_tokens?.policy_id ?? null,
				assetName: product.supported_tokens?.asset_name ?? null,
			};

			totalItems += currencyItemCount;
		}
	});

	// Calculate total in base currency (lovelace equivalent for display)
	// For now, we sum all amounts - in production, you might need conversion rates
	subtotal = itemsWithCurrency.reduce((sum, item) => sum + item.subtotal, 0);

	return {
		totalItems,
		subtotal,
		currencyBreakdown,
		currencies,
	};
}

export function getOrdersDataFromCart(
	cartItems: CartItem[],
	walletAddress: string,
): Database.CreateMultiCurrencyOrdersData {
	const itemsForOrder = cartItems.map(item => ({
		product_id: item.productId,
		quantity: item.quantity,
		price: item.product.price,
		token_id: item.product.token_id,
		policy_id: item.product.supported_tokens?.policy_id ?? null,
		asset_name: item.product.supported_tokens?.asset_name ?? null,
		decimals: item.product.supported_tokens?.decimals ?? null,
	}));

	const groupedItems = groupItemsByCurrencyById(itemsForOrder);
	const currencies: Database.CreateMultiCurrencyOrdersData['currencies'] = {};
	const orders = Object.entries(groupedItems).map(([currencyKey, items]) => {
		// Parse the currency key to get token_id
		const tokenId = currencyKey === 'ADA' ? null : items[0].token_id;
		const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

		if (tokenId) {
			currencies[tokenId] = {
				policy_id: items[0].policy_id,
				asset_name: items[0].asset_name,
				decimals: items[0].decimals,
			};
		}

		return {
			items,
			total_amount: totalAmount,
			token_id: tokenId,
		};
	});

	return {
		wallet_address: walletAddress,
		orders,
		currencies,
	};
}
