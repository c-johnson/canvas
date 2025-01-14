import { TypeTransformerFunction, create } from "@ipld/schema/typed.js"
import { fromDSL } from "@ipld/schema/from-dsl.js"

import type { SessionSigner, SignerCache } from "@canvas-js/interfaces"
import { AbstractModelDB, ModelValue, validateModelValue } from "@canvas-js/modeldb"

import target from "#target"

import { assert, mapEntries } from "../utils.js"

import { ActionImplementationFunction, Contract, ModelAPI } from "../types.js"
import { AbstractRuntime, ExecutionContext } from "./AbstractRuntime.js"

const identity = (x: any) => x

export class FunctionRuntime extends AbstractRuntime {
	public static async init(
		path: string | null,
		signers: SignerCache,
		contract: Contract,
		options: { indexHistory?: boolean; ignoreMissingActions?: boolean } = {},
	): Promise<FunctionRuntime> {
		assert(contract.actions !== undefined, "contract initialized without actions")
		assert(contract.models !== undefined, "contract initialized without models")
		assert(contract.topic !== undefined, "contract initialized without topic")

		const { indexHistory = true, ignoreMissingActions = false } = options
		const models = AbstractRuntime.getModelSchema(contract.models, { indexHistory })
		const db = await target.openDB({ path, topic: contract.topic }, models)

		const argsTransformers: Record<
			string,
			{ toTyped: TypeTransformerFunction; toRepresentation: TypeTransformerFunction }
		> = {}

		const actions = mapEntries(contract.actions, ([actionName, action]) => {
			if (typeof action === "function") {
				argsTransformers[actionName] = { toTyped: identity, toRepresentation: identity }
				return action as ActionImplementationFunction
			}

			if (action.argsType !== undefined) {
				const { schema, name } = action.argsType
				argsTransformers[actionName] = create(fromDSL(schema), name)
			} else {
				argsTransformers[actionName] = { toTyped: identity, toRepresentation: identity }
			}

			return action.apply
		})

		return new FunctionRuntime(
			contract.topic,
			signers,
			db,
			actions,
			argsTransformers,
			indexHistory,
			ignoreMissingActions,
		)
	}

	#context: ExecutionContext | null = null
	readonly #db: ModelAPI

	constructor(
		public readonly topic: string,
		public readonly signers: SignerCache,
		public readonly db: AbstractModelDB,
		public readonly actions: Record<string, ActionImplementationFunction>,
		public readonly argsTransformers: Record<
			string,
			{ toTyped: TypeTransformerFunction; toRepresentation: TypeTransformerFunction }
		>,
		indexHistory: boolean,
		ignoreMissingActions: boolean,
	) {
		super(indexHistory, ignoreMissingActions)

		this.#db = {
			get: async <T extends ModelValue = ModelValue>(model: string, key: string) => {
				assert(this.#context !== null, "expected this.#context !== null")
				return await this.getModelValue<T>(this.#context, model, key)
			},
			set: async (model: string, value: ModelValue) => {
				assert(this.#context !== null, "expected this.#context !== null")
				validateModelValue(this.db.models[model], value)
				const { primaryKey } = this.db.models[model]
				const key = value[primaryKey] as string
				this.#context.modelEntries[model][key] = value
			},
			delete: async (model: string, key: string) => {
				assert(this.#context !== null, "expected this.#context !== null")
				this.#context.modelEntries[model][key] = null
			},
		}
	}

	public get actionNames() {
		return Object.keys(this.actions)
	}

	protected async execute(context: ExecutionContext): Promise<void | any> {
		const { publicKey } = context.signature
		const { address, name, args, blockhash, timestamp } = context.message.payload

		const argsTransformer = this.argsTransformers[name]
		const action = this.actions[name]
		if (action === undefined || argsTransformer === undefined) {
			if (this.ignoreMissingActions) {
				return
			} else {
				throw new Error(`invalid action name: ${name}`)
			}
		}

		const typedArgs = argsTransformer.toTyped(args)
		assert(typedArgs !== undefined, "action args did not validate the provided schema type")

		this.#context = context

		try {
			return await action(this.#db, typedArgs, { id: context.id, publicKey, address, blockhash, timestamp })
		} finally {
			this.#context = null
		}
	}
}
