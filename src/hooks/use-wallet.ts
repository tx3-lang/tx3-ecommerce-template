import { useEffect, useState } from 'react';

// Lib
import { getAvailableWallets } from '@/lib/cardano';
import { supabase } from '@/lib/supabase';

const LAST_WALLET_STORAGE_KEY = 'ecommerce-last-wallet';

export function useWallet() {
	const [wallet, setWallet] = useState<CardanoWalletAPI | null>(null);
	const [connecting, setConnecting] = useState(false);
	const [balance, setBalance] = useState<WalletBalance | null>(null);
	const [walletAddress, setWalletAddress] = useState<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Execute only on mount.
	useEffect(() => {
		// Check if wallet is already connected
		checkConnectedWallet();
	}, []);

	const checkConnectedWallet = async () => {
		if (typeof window === 'undefined') return;

		const lastWallet = window.localStorage.getItem(LAST_WALLET_STORAGE_KEY);
		if (!lastWallet) return;

		const wallets = getAvailableWallets();
		const isAvailable = wallets.some(walletItem => walletItem === lastWallet);
		if (!isAvailable) {
			window.localStorage.removeItem(LAST_WALLET_STORAGE_KEY);
			return;
		}

		const connectedWallet = await connect(lastWallet);
		if (!connectedWallet) {
			window.localStorage.removeItem(LAST_WALLET_STORAGE_KEY);
		}
	};

	const connect = async (walletName: string) => {
		setConnecting(true);
		try {
			const { connectWallet } = await import('../lib/cardano');
			const connectedWallet = await connectWallet(walletName);

			if (connectedWallet) {
				if (typeof window !== 'undefined') {
					window.localStorage.setItem(LAST_WALLET_STORAGE_KEY, walletName);
				}
				setWallet(connectedWallet);
				const changeAddress = await connectedWallet.getChangeAddress();
				setWalletAddress(changeAddress);
				await setWalletContext(changeAddress);
				const { getWalletBalance } = await import('../lib/cardano');
				const walletBalance = await getWalletBalance(connectedWallet);
				setBalance(walletBalance);
			}

			return connectedWallet ?? null;
		} catch (error) {
			console.error('Wallet connection failed:', error);
			return null;
		} finally {
			setConnecting(false);
		}
	};

	const disconnect = () => {
		setWallet(null);
		setBalance(null);
		setWalletAddress(null);
		if (typeof window !== 'undefined') {
			window.localStorage.removeItem(LAST_WALLET_STORAGE_KEY);
		}
		void setWalletContext(null);
	};

	const setWalletContext = async (address: string | null) => {
		try {
			const { error } = await supabase.rpc('set_current_wallet', {
				wallet_address: address ?? '',
			});

			if (error) {
				console.error('Failed to set wallet context:', error);
			}
		} catch (error) {
			console.error('Unexpected error while setting wallet context:', error);
		}
	};

	const availableWallets = () => {
		if (typeof window === 'undefined') return [];

		return getAvailableWallets();
	};

	return {
		wallet,
		balance,
		connecting,
		connect,
		disconnect,
		availableWallets: availableWallets(),
		isConnected: !!wallet,
		walletAddress,
	};
}
