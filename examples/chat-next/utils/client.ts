import { createClient, defaultChains, configureChains } from "wagmi"

import { publicProvider } from "wagmi/providers/public"

import { MetaMaskConnector } from "wagmi/connectors/metaMask"
import { WalletConnectConnector } from "wagmi/connectors/walletConnect"

// Configure chains & providers with the Alchemy provider.
// Two popular providers are Alchemy (alchemy.com) and Infura (infura.io)
const { chains, provider, webSocketProvider } = configureChains(defaultChains, [publicProvider()])

// Set up client
export const client = createClient({
	autoConnect: true,
	connectors: [
		new MetaMaskConnector({ chains }),
		new WalletConnectConnector({
			chains,
			options: {
				qrcode: true,
			},
		}),
	],
	provider,
	webSocketProvider,
})
