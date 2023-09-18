import { PeerId } from "@libp2p/interface-peer-id"
import { EventEmitter, CustomEvent } from "@libp2p/interfaces/events"
import { createLibp2p, Libp2p } from "libp2p"
import { logger } from "@libp2p/logger"
import { base32hex } from "multiformats/bases/base32"
import { QuickJSHandle } from "quickjs-emscripten"

import { Action, ActionArguments, Message, Signer } from "@canvas-js/interfaces"
import { JSValue, VM } from "@canvas-js/vm"
import {
	AbstractModelDB,
	Effect,
	getImmutableRecordKey,
	Model,
	ModelsInit,
	ModelValue,
	Property,
	PropertyValue,
	Resolver,
} from "@canvas-js/modeldb"
import { SIWESigner } from "@canvas-js/chain-ethereum"
import { getCID, Signature } from "@canvas-js/signed-cid"

import getTarget from "#target"

import { getLibp2pOptions, P2PConfig, ServiceMap } from "./libp2p.js"
import { assert, mapEntries, mapValues, signalInvalidType } from "./utils.js"
import { lessThan } from "@canvas-js/okra"

export interface CanvasConfig extends P2PConfig {
	contract: string
	contractLog?: (...args: JSValue[]) => void

	/** NodeJS: data directory path; browser: IndexedDB database namespace */
	location?: string | null
	topic?: string
	uri?: string

	signers?: Signer[]
	offline?: boolean
	replay?: boolean

	runtimeMemoryLimit?: number
}

export type ActionAPI = (
	args: ActionArguments,
	options?: { chain?: string }
) => Promise<{ id: string; result: void | JSValue; recipients: Promise<PeerId[]> }>

export interface CoreEvents {
	close: Event
	// TODO: should this be {signature: Signature, Message: Message} ?
	message: CustomEvent<{}>
	// TODO: what should this be
	update: CustomEvent<{}>
	// TODO: what should this be
	sync: CustomEvent<{}>
	connect: CustomEvent<{ peer: string }>
	disconnect: CustomEvent<{ peer: string }>
}

export type ApplicationData = {
	uri: string
	peerId: string
	models: Record<string, Model>
	topics: Record<string, { actions: string[] | null }>
}

export class Canvas extends EventEmitter<CoreEvents> {
	public static async initialize(config: CanvasConfig): Promise<Canvas> {
		const { contract, signers = [], replay = false, offline = false, contractLog, runtimeMemoryLimit } = config

		const location = config.location ?? null
		const target = getTarget(location)

		// TODO: rethink "default topics" because they're kinda suss
		const cid = getCID(contract, { codec: "raw", digest: "blake3-128" })
		const uri = config.uri ?? `canvas:${cid.toString()}`
		const topic = config.topic ?? cid.toString()

		if (signers.length === 0) {
			const signer = await SIWESigner.init({})
			signers.push(signer)
		}

		// Create a libp2p node (even in offline mode)
		const peerId = await target.getPeerId()
		const libp2p = await createLibp2p(getLibp2pOptions(location, peerId, config))
		const { gossiplog } = libp2p.services

		// Create a QuickJS VM
		const vm = await VM.initialize({ runtimeMemoryLimit, log: contractLog })

		// We only have two exports: `models` and `actions`.
		const {
			models: modelsHandle,
			actions: actionsHandle,
			...rest
		} = await vm.import(contract, { uri }).then((handle) => handle.consume(vm.unwrapObject))

		for (const [name, handle] of Object.entries(rest)) {
			console.warn(`extraneous export ${JSON.stringify(name)}`)
			handle.dispose()
		}

		// TODO: validate that models satisfies ModelsInit
		const models = modelsHandle.consume(vm.context.dump) as ModelsInit

		// our version strings always sort lexicographically
		const resolver: Resolver = { lessThan: (a, b) => lessThan(a.version, b.version) }
		const db = await target.openDB(models, { resolver })

		// { [name]: ActionAPI }
		const actionHandles: Record<string, QuickJSHandle> = {}
		const actions: Record<string, ActionAPI> = {}
		for (const [name, handle] of Object.entries(actionsHandle.consume(vm.unwrapObject))) {
			assert(vm.context.typeof(handle) === "function", "expected action[name] to be a function")
			actionHandles[name] = handle.consume(vm.cache)
			actions[name] = async (args, options = {}) => {
				const signer = signers.find((signer) => options.chain === undefined || signer.match(options.chain))
				assert(signer !== undefined, "signer not found")
				const { chain, address } = signer
				const session = await signer.getSession()
				const timestamp = Date.now()
				const action: Action = { chain, address, session, name, args, topic, timestamp, blockhash: null }
				const { id, result, recipients } = await gossiplog.append<Action, void | JSValue>(topic, action, { signer })
				return { id, result, recipients }
			}
		}

		// const actions: Record<string, ActionAPI> = mapEntries(actionHandles, ([name, handle]) => {

		// })

		const databaseAPI = new DatabaseAPI(vm, db)

		const apply = async (id: string, signature: Signature | null, message: Message<Action>) => {
			assert(signature !== null, "missing message signature")

			const { chain, address, session, name, args, ...context } = message.payload

			const signer = signers.find((signer) => signer.match(chain))
			assert(signer !== undefined, `no signer provided for chain ${chain}`)
			await signer.verifySession(signature, chain, address, session)

			assert(actions[name] !== undefined, `invalid action name: ${name}`)

			const { result, effects } = await databaseAPI.collect(async () => {
				const argsHandle = vm.wrapValue(args)
				const ctxHandle = vm.wrapValue({ id, chain, address, ...context })
				try {
					const handle = actionHandles[name]
					const result = await vm.callAsync(handle, handle, [databaseAPI.handle, argsHandle, ctxHandle])
					return result.consume((handle) => {
						if (vm.context.typeof(handle) === "undefined") {
							return undefined
						} else {
							return vm.unwrapValue(result)
						}
					})
				} finally {
					argsHandle.dispose()
					ctxHandle.dispose()
				}
			})

			await db.apply(effects, { version: base32hex.baseDecode(id) })

			return result
		}

		const validate = (payload: unknown): payload is Action => true // TODO
		await gossiplog.subscribe(topic, { apply, validate, signatures: true, sequencing: true })

		return new Canvas(uri, topic, signers, libp2p, vm, db, actions)
	}

	private readonly controller = new AbortController()
	private readonly log = logger("canvas:core")

	private constructor(
		public readonly uri: string,
		public readonly topic: string,
		public readonly signers: Signer[],
		public readonly libp2p: Libp2p<ServiceMap>,
		public readonly vm: VM,
		public readonly db: AbstractModelDB,
		public readonly actions: Record<string, ActionAPI>
	) {
		super()

		libp2p?.addEventListener("peer:connect", ({ detail: peerId }) => {
			this.log("opened connection to %p", peerId)
			this.dispatchEvent(new CustomEvent("connect", { detail: { peer: peerId.toString() } }))
		})

		libp2p?.addEventListener("peer:disconnect", ({ detail: peerId }) => {
			this.log("closed connection to %p", peerId)
			this.dispatchEvent(new CustomEvent("disconnect", { detail: { peer: peerId.toString() } }))
		})
	}

	public get peerId() {
		return this.libp2p.peerId
	}

	public async start() {
		await this.libp2p.start()
	}

	public getApplicationData(): ApplicationData {
		return {
			uri: this.uri,
			peerId: this.peerId.toString(),
			models: this.db.models,
			topics: { [this.topic]: { actions: Object.keys(this.actions) } },
		}
	}

	public async close() {
		this.controller.abort()
		await this.libp2p.stop()

		// TODO: make AbstractModelDB.close async
		this.db.close()
		this.vm.dispose()
		this.dispatchEvent(new Event("close"))
	}

	/**
	 * Low-level apply function for internal/debugging use.
	 * The normal way to apply actions is to use the `Canvas.actions[name](...)` functions.
	 */
	public async apply(signature: Signature | null, message: Message): Promise<{ id: string }> {
		return await this.libp2p.services.gossiplog.insert(this.topic, signature, message)
	}

	public async *getMessageStream<Payload = Action>(
		lowerBound: { id: string; inclusive: boolean } | null = null,
		upperBound: { id: string; inclusive: boolean } | null = null,
		options: { reverse?: boolean } = {}
	): AsyncIterable<[id: string, signature: Signature | null, message: Message<Payload>]> {
		yield* this.libp2p.services.gossiplog.iterate(this.topic, lowerBound, upperBound, options)
	}
}

class DatabaseAPI {
	public readonly handle: QuickJSHandle

	#effects: Effect[] | null = null

	constructor(readonly vm: VM, readonly db: AbstractModelDB) {
		this.handle = vm
			.wrapObject(Object.fromEntries(db.config.models.map((model) => [model.name, this.createAPI(model)])))
			.consume(vm.cache)
	}

	public async collect<T>(callback: () => Promise<T>): Promise<{ result: T; effects: Effect[] }> {
		this.#effects = []
		try {
			const result = await callback()
			return { result, effects: this.#effects }
		} finally {
			this.#effects = null
		}
	}

	public createAPI(model: Model): QuickJSHandle {
		return this.vm.wrapObject({
			get: this.vm.context.newFunction(`db.${model.name}.get`, (keyHandle) => {
				assert(this.#effects !== null, "internal error")
				throw new Error("not implemented")
			}),
			add: this.vm.context.newFunction(`db.${model.name}.add`, (valueHandle) => {
				assert(this.#effects !== null, "internal error")
				const value = this.unwrapModelValue(model, valueHandle)
				const key = getImmutableRecordKey(value)
				this.#effects.push({ model: model.name, operation: "set", key, value })
				return this.vm.context.newString(key)
			}),
			set: this.vm.context.newFunction(`db.${model.name}.set`, (keyHandle, valueHandle) => {
				assert(this.#effects !== null, "internal error")
				const key = this.vm.context.getString(keyHandle)
				const value = this.unwrapModelValue(model, valueHandle)
				this.#effects.push({ model: model.name, operation: "set", key, value })
			}),
			delete: this.vm.context.newFunction(`db.${model.name}.delete`, (keyHandle) => {
				assert(this.#effects !== null, "internal error")
				const key = this.vm.context.getString(keyHandle)
				this.#effects.push({ model: model.name, operation: "delete", key })
			}),
		})
	}

	private unwrapModelValue(model: Model, handle: QuickJSHandle): ModelValue {
		const values = model.properties.map<[string, PropertyValue]>((property) => {
			const propertyHandle = this.vm.context.getProp(handle, property.name)
			const propertyValue = propertyHandle.consume((handle) => this.unwrapPropertyValue(property, handle))
			return [property.name, propertyValue]
		})

		return Object.fromEntries(values)
	}

	private unwrapPropertyValue(property: Property, handle: QuickJSHandle): PropertyValue {
		if (property.kind === "primitive") {
			if (property.type === "integer") {
				const value = this.vm.context.getNumber(handle)
				assert(Number.isSafeInteger(value), "property value must be a safe integer")
				return value
			} else if (property.type === "float") {
				return this.vm.context.getNumber(handle)
			} else if (property.type === "string") {
				return this.vm.context.getString(handle)
			} else if (property.type === "bytes") {
				return this.vm.getUint8Array(handle)
			} else {
				signalInvalidType(property.type)
			}
		} else if (property.kind === "reference") {
			if (this.vm.is(handle, this.vm.context.null)) {
				return null
			} else {
				const value = this.vm.context.getString(handle)
				// TODO: assert that value matches ID format
				return value
			}
		} else if (property.kind === "relation") {
			const values = this.vm.unwrapArray(handle, (elementHandle) => this.vm.context.getString(elementHandle))
			// TODO: assert that values match ID format
			return values
		} else {
			signalInvalidType(property)
		}
	}
}
