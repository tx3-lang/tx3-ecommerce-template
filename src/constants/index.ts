export const constants = {
	API: {
		BASE_URL: import.meta.env.VITE_API_URL || '/api',
		TIMEOUT: 10000,
	},
	CARDANO: {
		MIN_ADA: 1000000, // 1 ADA in lovelace
		MAX_TX_ATTEMPTS: 3,
		NETWORK: 'mainnet',
	},
	PAGINATION: {
		DEFAULT_PAGE_SIZE: 12,
		MAX_PAGE_SIZE: 100,
	},
	VALIDATION: {
		EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
		WALLET_ADDRESS_REGEX: /^addr1[a-z0-9]{60,}$|^stake1[a-z0-9]{60,}$/,
	},
} as const;
