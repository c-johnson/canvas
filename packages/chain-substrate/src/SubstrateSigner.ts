import * as json from "@ipld/dag-json"
import { logger } from "@libp2p/logger"
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils"
import { Keyring } from "@polkadot/keyring"
import type { Signature, SessionSigner, Action, Message, Session } from "@canvas-js/interfaces"
import { InjectedExtension } from "@polkadot/extension-inject/types"

import { Ed25519Signer, didKeyPattern } from "@canvas-js/signed-cid"

import { cryptoWaitReady, decodeAddress } from "@polkadot/util-crypto"
import { KeypairType } from "@polkadot/util-crypto/types"

import target from "#target"

import type { SubstrateMessage, SubstrateSessionData } from "./types.js"
import { assert, signalInvalidType, validateSessionData, randomKeypair, parseAddress, addressPattern } from "./utils.js"

type SubstrateSignerInit = {
	sessionDuration?: number
	extension?: InjectedExtension
	substrateKeyType?: KeypairType
}

type AbstractSigner = {
	// substrate wallets support a variety of key pair types, such as sr25519, ed25519, and ecdsa
	getSubstrateKeyType: () => Promise<KeypairType>
	getAddress: () => Promise<string>
	getChainId: () => Promise<string>
	signMessage(message: Uint8Array): Promise<{
		signature: Uint8Array
		nonce: Uint8Array
	}>
}

export class SubstrateSigner implements SessionSigner {
	public readonly key: string
	public readonly sessionDuration: number | null
	private readonly log = logger("canvas:chain-substrate")

	// some type that overlaps with the injected extension and
	// a generated wallet
	#signer: AbstractSigner
	#store = target.getSessionStore()

	public constructor(init: SubstrateSignerInit = {}) {
		if (init.extension) {
			const { extension } = init

			const signRaw = extension.signer.signRaw
			if (signRaw === undefined) {
				throw new Error("Invalid signer - no signRaw method exists")
			}
			this.#signer = {
				getSubstrateKeyType: async () => {
					const account = await extension.accounts.get()
					return account[0].type || "sr25519"
				},
				getAddress: async () => {
					const account = await extension.accounts.get()
					return account[0].address
				},
				getChainId: async () => {
					let genesisHash = "0x91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3"
					const account = await extension.accounts.get()
					if (account[0].genesisHash) genesisHash = account[0].genesisHash
					return genesisHash.slice(2, 34)
				},
				signMessage: async (message: Uint8Array) => {
					const account = await extension.accounts.get()
					const address = account[0].address

					const nonce = randomBytes(16)
					const data = bytesToHex(nonce) + bytesToHex(message)

					const signerResult = await signRaw({ address, data, type: "bytes" })
					const signature = signerResult.signature
					// signerResult.signature is encoded as 0x{hex}, just get the hex part
					return {
						signature: hexToBytes(signature.slice(2)),
						nonce,
					}
				},
			}
		} else {
			const keyType: KeypairType = init.substrateKeyType ?? "sr25519"

			// some of the cryptography methods used by polkadot require a wasm environment which is initialised
			// asynchronously so we have to lazily create the keypair when it is needed
			let keyring: ReturnType<Keyring["addFromMnemonic"]> | undefined
			this.#signer = {
				getSubstrateKeyType: async () => {
					return keyType
				},
				getAddress: async () => {
					await cryptoWaitReady()
					if (!keyring) {
						keyring = randomKeypair(keyType)
					}
					return keyring.address
				},
				getChainId: async () => {
					const genesisHash = "0x91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3"
					return genesisHash.slice(2, 34)
				},
				signMessage: async (message: Uint8Array) => {
					await cryptoWaitReady()
					if (!keyring) {
						keyring = randomKeypair(keyType)
					}
					const decodedAddress = decodeAddress(keyring.address)

					// there is a bug in polkadot's ECDSA implementation which means that sometimes
					// it produces a signature that is not valid, this happens in about 1 in 200 times
					// since sign and verify are deterministic, we can check that the signature is valid
					// before returning it. If it is not valid, we try again with a new nonce
					let attemptsRemaining = 3
					while (attemptsRemaining > 0) {
						const nonce = randomBytes(16)
						const data = bytesToHex(nonce) + bytesToHex(message)
						const signature = keyring.sign(data)

						// check the signature is valid before returning it
						if (keyring.verify(data, signature, decodedAddress)) {
							return {
								signature,
								nonce,
							}
						} else {
							attemptsRemaining--
						}
					}
					throw new Error("Failed to generate a valid signature")
				},
			}
		}

		this.key = `SubstrateSigner-${init.extension ? "extension" : "burner"}`
		this.sessionDuration = init.sessionDuration ?? null
	}

	public readonly match = (address: string) => addressPattern.test(address)

	public async verifySession(topic: string, session: Session) {
		const { publicKey, address, authorizationData, timestamp, duration } = session

		assert(didKeyPattern.test(publicKey), "invalid signing key")
		assert(validateSessionData(authorizationData), "invalid session")
		const [chainId, walletAddress] = parseAddress(address)

		const issuedAt = new Date(timestamp).toISOString()
		const message: SubstrateMessage = {
			topic: topic,
			address,
			chainId,
			uri: publicKey,
			issuedAt,
			expirationTime: null,
		}

		const decodedAddress = decodeAddress(walletAddress)

		const substrateKeyType = authorizationData.substrateKeyType
		// some cryptography code used by polkadot requires a wasm environment which is initialised
		// asynchronously so we have to wait for it to be ready
		await cryptoWaitReady()
		const signerKeyring = new Keyring({
			type: substrateKeyType,
			ss58Format: 42,
		}).addFromAddress(decodedAddress)

		const { nonce, signature } = authorizationData.signatureResult
		const signedData = bytesToHex(nonce) + bytesToHex(json.encode(message))

		const valid = signerKeyring.verify(signedData, signature, decodedAddress)

		assert(valid, "invalid signature")
	}

	public async getSession(
		topic: string,
		options: { chain?: string; timestamp?: number; fromCache?: boolean } = {},
	): Promise<Session<SubstrateSessionData>> {
		const chainId = await this.#signer.getChainId()
		const walletAddress = await this.#signer.getAddress()
		const address = `polkadot:${chainId}:${walletAddress}`

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

		// create a keypair
		const signer = new Ed25519Signer()

		const timestamp = options.timestamp ?? Date.now()
		const issuedAt = new Date(timestamp).toISOString()

		const message: SubstrateMessage = {
			topic,
			address,
			chainId,
			uri: signer.uri,
			issuedAt,
			expirationTime: null,
		}

		const signatureResult = await this.#signer.signMessage(json.encode(message))
		const substrateKeyType = await this.#signer.getSubstrateKeyType()

		const session: Session<SubstrateSessionData> = {
			type: "session",
			address,
			publicKey: signer.uri,
			authorizationData: { signatureResult, data: message, substrateKeyType },
			blockhash: null,
			timestamp,
			duration: this.sessionDuration,
		}

		// save the session and private key in the cache and the store
		this.#store.set(topic, address, session, signer)

		this.log("created new session for %s: %o", address, session)
		return session
	}

	public sign(message: Message<Action | Session>): Signature {
		if (message.payload.type === "action") {
			const { address, timestamp } = message.payload
			const { signer, session } = this.#store.get(message.topic, address) ?? {}
			assert(signer !== undefined && session !== undefined)

			assert(address === session.address)
			assert(timestamp >= session.timestamp)
			assert(timestamp <= session.timestamp + (session.duration ?? Infinity))

			return signer.sign(message)
		} else if (message.payload.type === "session") {
			const { signer, session } = this.#store.get(message.topic, message.payload.address) ?? {}
			assert(signer !== undefined && session !== undefined)

			// only sign our own current sessions
			assert(message.payload === session)
			return signer.sign(message)
		} else {
			signalInvalidType(message.payload)
		}
	}

	public async clear(topic: string) {
		this.#store.clear(topic)
	}
}
