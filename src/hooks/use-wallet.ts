import { useEffect, useState } from 'react';

// Lib
import { getAvailableWallets } from '@/lib/cardano';

export function useWallet() {
	const [wallet, setWallet] = useState<CardanoWalletAPI | null>(null);
	const [connecting, setConnecting] = useState(false);
	const [balance, setBalance] = useState<WalletBalance | null>(null);

	useEffect(() => {
		// Check if wallet is already connected
		checkConnectedWallet();
	}, []);

	const checkConnectedWallet = async () => {
		// TODO: Check for persistent wallet connection
	};

	const connect = async (walletName: string) => {
		setConnecting(true);
		try {
			const { connectWallet } = await import('../lib/cardano');
			const connectedWallet = await connectWallet(walletName);

			if (connectedWallet) {
				setWallet(connectedWallet);
				const { getWalletBalance } = await import('../lib/cardano');
				const walletBalance = await getWalletBalance(connectedWallet);
				setBalance(walletBalance);
			}
		} catch (error) {
			console.error('Wallet connection failed:', error);
		} finally {
			setConnecting(false);
		}
	};

	const disconnect = () => {
		setWallet(null);
		setBalance(null);
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
	};
}
