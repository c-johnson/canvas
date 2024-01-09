import { AbstractSigner, Wallet, hexlify, getBytes, verifyTypedData, zeroPadValue, getAddress } from "ethers"
import { logger } from "@libp2p/logger"

import type { Signature, SessionSigner, Action, Message, Session } from "@canvas-js/interfaces"
import { Secp256k1Signer, didKeyPattern } from "@canvas-js/signed-cid"

import target from "#target"

import { eip712TypeDefinitions, type EIP712SessionData, type EIP712SessionMessage } from "./types.js"
import { assert, signalInvalidType, validateSessionData, parseAddress, addressPattern } from "./utils.js"

export interface EIP712VerifiableSignerInit {
	signer?: AbstractSigner
	sessionDuration?: number
	chainId?: number // used in the eip712 domain, but optional; no chainid if none is specified (don't default to mainnet)
	verifyingContract?: string // used in the eip712 domain
	version?: string // version in the eip712 domain. by default 1, but later versions of this signer could increment it
}

export class EIP712Signer implements SessionSigner<EIP712SessionData> {
	public readonly key: string
	public readonly sessionDuration: number | null
	public readonly chainId: number
	public readonly verifyingContract: string | null
	public readonly version: string | null

	private readonly log = logger("canvas:chain-ethereum-eip712")

	#store = target.getSessionStore()
	#ethersSigner: AbstractSigner

	public constructor(init: EIP712VerifiableSignerInit = {}) {
		this.#ethersSigner = init.signer ?? Wallet.createRandom()
		this.sessionDuration = init.sessionDuration ?? null
		this.chainId = init.chainId ?? 1
		this.verifyingContract = init.verifyingContract ?? null
		this.version = init.version ?? null
		this.key = `EIP712Signer-${init.signer ? "signer" : "burner"}`
	}

	public readonly match = (address: string) => addressPattern.test(address)

	public verifySession(topic: string, session: Session<EIP712SessionData>) {
		const { publicKey, address, authorizationData, timestamp, blockhash, duration } = session

		assert(didKeyPattern.test(publicKey), "invalid signing key")
		assert(validateSessionData(authorizationData), "invalid session")
		const [chainId, walletAddress] = parseAddress(address)

		const message: EIP712SessionMessage = {
			address: walletAddress,
			blockhash,
			duration,
			publicKey,
			timestamp,
		}

		const { signature } = authorizationData

		const recoveredAddress = verifyTypedData({}, eip712TypeDefinitions, message, hexlify(signature))
		assert(recoveredAddress === walletAddress, "invalid SIWE signature")
	}

	public async getSession(
		topic: string,
		options: { timestamp?: number; fromCache?: boolean } = {},
	): Promise<Session<EIP712SessionData>> {
		const walletAddress = await this.#ethersSigner.getAddress()
		const address = `eip155:${this.chainId}:${walletAddress}`

		this.log("getting session for %s", address)

		{
			const { session, signer } = this.#store.get(topic, address) ?? {}
			if (session !== undefined && signer !== undefined) {
				const { timestamp, duration } = session
				const t = options.timestamp ?? timestamp
				if (timestamp <= t && t <= timestamp + (duration ?? Infinity)) {
					this.log("found session for %s in store: %o", address, session)
					return session
				} else {
					this.log("stored session for %s has expired", address)
				}
			}
		}

		if (options.fromCache) return Promise.reject()

		this.log("creating new session for %s", address)

		const signer = new Secp256k1Signer()

		const timestamp = options.timestamp ?? Date.now()

		const message = {
			address: walletAddress,
			publicKey: signer.uri,
			blockhash: "",
			timestamp,
			duration: this.sessionDuration ?? 0,
		}

		const signature = await this.#ethersSigner.signTypedData({}, eip712TypeDefinitions, message)

		const session: Session<EIP712SessionData> = {
			type: "session",
			address: address,
			publicKey: signer.uri,
			authorizationData: { signature: getBytes(signature) },
			duration: this.sessionDuration || 0,
			timestamp: timestamp,
			blockhash: "",
		}

		this.#store.set(topic, address, session, signer)

		this.log("created new session for %s: %o", address, session)
		return session
	}

	public sign(message: Message<Action | Session>): Signature {
		// TODO: how do we pass this into `sign`?
		// const domain = {
		// 	name: message.topic,
		// 	version: this.version,
		// 	chainId: this.chainId,
		// 	verifyingContract: this.verifyingContract,
		// }

		if (message.payload.type === "action") {
			const { address, timestamp } = message.payload
			const { signer, session } = this.#store.get(message.topic, address) ?? {}
			assert(signer !== undefined && session !== undefined)

			assert(address === session.address)
			assert(timestamp >= session.timestamp)
			assert(timestamp <= session.timestamp + (session.duration ?? Infinity))

			return signer.sign(message, { codec: "eip712", digest: "sha2-256" })
		} else if (message.payload.type === "session") {
			const { signer, session } = this.#store.get(message.topic, message.payload.address) ?? {}
			assert(signer !== undefined && session !== undefined)

			// only sign our own current sessions
			assert(message.payload === session)
			console.log(signer.uri)
			return signer.sign(message, { codec: "eip712", digest: "sha2-256" })
		} else {
			signalInvalidType(message.payload)
		}
	}

	public async clear(topic: string) {
		this.#store.clear(topic)
	}
}