declare interface ImportMetaEnv {
	// Supabase
	readonly VITE_SUPABASE_URL?: string;
	readonly VITE_SUPABASE_ANON_KEY?: string;

	// API URL
	readonly VITE_API_URL?: string;

	// Cardano / tx3
	readonly VITE_TX3_PROFILE?: string;
	// more env variables...
}

declare interface ImportMeta {
	readonly env: ImportMetaEnv;
}
