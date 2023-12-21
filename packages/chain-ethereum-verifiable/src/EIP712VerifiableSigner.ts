import { AbstractSigner, Wallet, hexlify, getBytes, verifyTypedData } from "ethers"
import { logger } from "@libp2p/logger"

import type { Signature, SessionSigner, Action, Message, Session } from "@canvas-js/interfaces"
import { Secp256k1Signer, didKeyPattern } from "@canvas-js/signed-cid"

import target from "#target"

import {
	eip712TypeDefinitionsForSession,
	type EIP712VerifiableSessionData,
	type EIP712VerifiableSessionMessage,
} from "./types.js"
import { assert, signalInvalidType, validateSessionData, parseAddress, addressPattern, generateSalt } from "./utils.js"

export interface EIP712VerifiableSignerInit {
	signer?: AbstractSigner
	sessionDuration?: number
	chainId?: number // used in the eip712 domain, but optional; no chainid if none is specified (don't default to mainnet)
	verifyingContract?: string // used in the eip712 domain
	salt?: string // used in the eip712 domain separator
	version?: string // version in the eip712 domain. by default 1, but later versions of this signer could increment it
}

export class EIP712VerifiableSigner implements SessionSigner<EIP712VerifiableSessionData> {
	public readonly sessionDuration: number | null
	public readonly chainId: number
	public readonly verifyingContract: string
	public readonly salt: string
	public readonly version: string

	private readonly log = logger("canvas:chain-ethereum-verifiable")

	#store = target.getSessionStore()
	#ethersSigner: AbstractSigner

	public constructor(init: EIP712VerifiableSignerInit = {}) {
		this.#ethersSigner = init.signer ?? Wallet.createRandom()
		this.sessionDuration = init.sessionDuration ?? null
		this.chainId = init.chainId ?? 1
		this.verifyingContract = init.verifyingContract ?? "0x1c56346cd2a2bf3202f771f50d3d14a367b48070"
		this.salt = init.salt ?? generateSalt()
		this.version = init.version ?? "1"
	}

	public readonly match = (address: string) => addressPattern.test(address)

	public verifySession(topic: string, session: Session<EIP712VerifiableSessionData>) {
		const { publicKey, address, authorizationData, timestamp, blockhash, duration } = session

		assert(didKeyPattern.test(publicKey), "invalid signing key")
		assert(validateSessionData(authorizationData), "invalid session")
		const [chainId, walletAddress] = parseAddress(address)

		const message: EIP712VerifiableSessionMessage = {
			address: walletAddress,
			publicKey,
			blockhash,
			timestamp,
			duration,
		}

		const { domain, signature } = authorizationData

		const recoveredAddress = verifyTypedData(domain, eip712TypeDefinitionsForSession, message, hexlify(signature))

		assert(recoveredAddress === walletAddress, "invalid SIWE signature")
	}

	public async getSession(
		topic: string,
		options: { timestamp?: number; fromCache?: boolean } = {},
	): Promise<Session<EIP712VerifiableSessionData>> {
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

		const message: EIP712VerifiableSessionMessage = {
			address: walletAddress,
			publicKey: signer.uri,
			blockhash: "",
			timestamp,
			duration: this.sessionDuration ?? 0,
		}

		const domain = {
			name: topic,
			version: this.version,
			chainId: this.chainId,
			verifyingContract: this.verifyingContract,
			salt: this.salt,
		}

		const signature = await this.#ethersSigner.signTypedData(domain, eip712TypeDefinitionsForSession, message)

		const session: Session<EIP712VerifiableSessionData> = {
			type: "session",
			address: address,
			publicKey: signer.uri,
			authorizationData: { signature: getBytes(signature), domain },
			duration: this.sessionDuration || 0,
			timestamp: timestamp,
			blockhash: "",
		}

		this.#store.set(topic, address, session, signer)

		this.log("created new session for %s: %o", address, session)
		return session
	}

	public sign(message: Message<Action | Session>): Signature {
		const domain = {
			name: message.topic,
			version: this.version,
			chainId: this.chainId,
			verifyingContract: this.verifyingContract,
			salt: this.salt,
		}
		console.log(domain)
		if (message.payload.type === "action") {
			const { address, timestamp } = message.payload
			const { signer, session } = this.#store.get(message.topic, address) ?? {}
			assert(signer !== undefined && session !== undefined)

			assert(address === session.address)
			assert(timestamp >= session.timestamp)
			assert(timestamp <= session.timestamp + (session.duration ?? Infinity))

			return signer.sign(message, { codec: "eip712", digest: "none" })
		} else if (message.payload.type === "session") {
			const { signer, session } = this.#store.get(message.topic, message.payload.address) ?? {}
			assert(signer !== undefined && session !== undefined)

			// only sign our own current sessions
			assert(message.payload === session)
			return signer.sign(message, { codec: "eip712", digest: "none" })
		} else {
			signalInvalidType(message.payload)
		}
	}

	public async clear(topic: string) {
		this.#store.clear(topic)
	}
}
