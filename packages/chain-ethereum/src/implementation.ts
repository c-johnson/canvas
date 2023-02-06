import { ethers, Signer } from "ethers"
import { verifyTypedData } from "@ethersproject/wallet"

import type {
	Action,
	ActionPayload,
	Chain,
	ChainId,
	ChainImplementation,
	Session,
	SessionPayload,
} from "@canvas-js/interfaces"

import { getActionSignatureData, getSessionSignatureData } from "./signatureData.js"

/**
 * Sign an action. Supports both directly signing from your wallet,
 * and signing via a delegated session key.
 */
export async function signAction(
	signer: ethers.Signer,
	payload: ActionPayload,
	sessionAddress: string | null
): Promise<Action> {
	const address = await signer.getAddress()
	if (sessionAddress === null) {
		if (address !== payload.from) {
			throw new Error("Signer address did not match payload.from")
		}
	} else {
		if (address !== sessionAddress) {
			throw new Error("Signer address did not match session.payload.sessionAddress")
		}
	}

	const signatureData = getActionSignatureData(payload)
	const signature = await signer.signTypedData(...signatureData)

	return { type: "action", session: sessionAddress, signature, payload }
}

/**
 * Ethereum chain export.
 */
export class EthereumChainImplementation implements ChainImplementation<ethers.Signer, ethers.BaseWallet> {
	public readonly chain: Chain = "ethereum"

	constructor(public readonly chainId: ChainId = "1", public readonly provider?: ethers.JsonRpcProvider) {}

	async verifyAction(action: Action): Promise<void> {
		const expectedAddress = action.session ?? action.payload.from
		const [domain, types, value] = getActionSignatureData(action.payload)
		const recoveredAddress = verifyTypedData(domain, types, value, action.signature)
		if (recoveredAddress !== expectedAddress) {
			throw new Error(`Invalid action signature: expected ${expectedAddress}, recovered ${recoveredAddress}`)
		}
	}

	async verifySession(session: Session): Promise<void> {
		const [domain, types, value] = getSessionSignatureData(session.payload)
		const recoveredAddress = verifyTypedData(domain, types, value, session.signature)
		if (recoveredAddress !== session.payload.from) {
			throw new Error(`Invalid session signature: expected ${session.payload.from}, recovered ${recoveredAddress}`)
		}
	}

	async signSession(signer: ethers.Signer, payload: SessionPayload): Promise<Session> {
		const address = await signer.getAddress()
		if (payload.from !== address) {
			throw new Error("Signer address did not match payload.from")
		}

		const signatureData = getSessionSignatureData(payload)
		const signature = await signer.signTypedData(...signatureData)
		return { type: "session", signature, payload }
	}

	getSignerAddress = async (signer: ethers.Signer) => signer.getAddress()

	getDelegatedSignerAddress = async (wallet: ethers.BaseWallet) => wallet.address

	isSigner(signer: unknown): signer is ethers.Signer {
		return signer instanceof ethers.BaseWallet || signer instanceof ethers.JsonRpcSigner
	}

	isDelegatedSigner(delegatedSigner: unknown): delegatedSigner is ethers.BaseWallet {
		return delegatedSigner instanceof ethers.BaseWallet
	}

	signAction = (signer: ethers.Signer, payload: ActionPayload) => signAction(signer, payload, null)

	signDelegatedAction = (wallet: ethers.BaseWallet, payload: ActionPayload) =>
		signAction(wallet, payload, wallet.address)

	importDelegatedSigner = (privateKey: string) => new ethers.Wallet(privateKey)

	exportDelegatedSigner = (wallet: ethers.BaseWallet) => wallet.privateKey

	async generateDelegatedSigner(): Promise<ethers.BaseWallet> {
		return ethers.Wallet.createRandom()
	}

	async getLatestBlock(): Promise<string> {
		if (this.provider !== undefined) {
			const block = await this.provider.getBlock("latest")
			if (block === null || block.hash === null) {
				throw new Error("Cannot get latest block")
			} else {
				return block.hash
			}
		} else {
			throw new Error("Cannot get latest block: no JsonRpcProvider provided")
		}
	}
}