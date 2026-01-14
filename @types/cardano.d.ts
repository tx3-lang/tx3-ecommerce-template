declare enum NetworkId {
	TESTNET = 0,
	MAINNET = 1,
}

declare interface Paginate {
	page: number;
	limit: number;
}

declare interface DataSignature {
	key: string;
	signature: string;
}

declare interface CardanoWalletAPI {
	getNetworkId(): Promise<NetworkId>;
	getUtxos(amount?: string, paginate?: Paginate): Promise<string[] | undefined>;
	getBalance(): Promise<string>;
	// Deprecated: CIP-0040
	getCollateral(params?: { amount?: string }): Promise<string[] | null>;
	getUsedAddresses(paginate?: Paginate): Promise<string[]>;
	getUnusedAddresses(): Promise<string>;
	getChangeAddress(): Promise<string>;
	getRewardAddresses(): Promise<string>;
	signTx(tx: string, partialSign?: boolean): Promise<string>;
	signData(address: string, payload: string): Promise<string>;
	submitTx(tx: string): Promise<string>;
}

declare interface CardanoWallet {
	readonly apiVersion: ApiVersion;
	readonly name: string;
	readonly icon: string;
	readonly supportedExtensions: { cip: int }[];
	isEnabled(): Promise<boolean>;
	enable(): Promise<CardanoWalletAPI>;
}

declare interface PaymentRequest {
	amount_lovelace: number;
	token_policy_id?: string;
	token_asset_name?: string;
	recipient_address: string;
}

declare interface TransactionResult {
	hash: string;
	success: boolean;
	error?: string;
}

declare interface WalletBalance {
	lovelace: number;
	tokens: TokenBalance[];
}

declare interface TokenBalance {
	policy_id: string;
	asset_name: string;
	quantity: number;
	decimals: number;
}
