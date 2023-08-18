import Database, * as sqlite from "better-sqlite3"

import {
	AbstractModelDB,
	Effect,
	ImmutableModelAPI,
	ImmutableModelDBContext,
	ModelValue,
	ModelsInit,
	MutableModelAPI,
	MutableModelDBContext,
	Resolve,
	parseConfig,
} from "@canvas-js/modeldb-interface"
import { initializeModel, initializeRelation } from "./initialize.js"
import { assert, signalInvalidType } from "./utils.js"
import { createIdbImmutableModelDBContext, createIdbMutableModelDBContext } from "./api.js"

export interface ModelDBOptions {
	resolve?: Resolve
	dkLen?: number
}

export class ModelDB extends AbstractModelDB {
	public readonly db: sqlite.Database

	public readonly immutableDbContexts: Record<string, ImmutableModelDBContext> = {}
	public readonly mutableDbContexts: Record<string, MutableModelDBContext> = {}

	readonly #transaction: sqlite.Transaction<
		(effects: Effect[], options: { namespace?: string; version?: string; metadata?: string }) => Promise<void>
	>

	constructor(public readonly path: string | null, models: ModelsInit, options: ModelDBOptions = {}) {
		super(parseConfig(models))

		this.db = new Database(path ?? ":memory:")

		for (const model of this.config.models) {
			initializeModel(model, (sql) => this.db.exec(sql))
		}

		for (const relation of this.config.relations) {
			initializeRelation(relation, (sql) => this.db.exec(sql))
		}

		for (const model of Object.values(this.models)) {
			if (model.kind == "immutable") {
				this.immutableDbContexts[model.name] = createIdbImmutableModelDBContext(this.db, model)
			} else if (model.kind == "mutable") {
				this.mutableDbContexts[model.name] = createIdbMutableModelDBContext(this.db, model, options.resolve)
			} else {
				signalInvalidType(model.kind)
			}
		}

		this.#transaction = this.db.transaction(async (effects, { version, namespace, metadata }) => {
			for (const effect of effects) {
				const model = this.models[effect.model]
				assert(model !== undefined, `model ${effect.model} not found`)

				if (effect.operation === "add") {
					assert(model.kind == "immutable", "cannot call .add on a mutable model")
					await ImmutableModelAPI.add(effect.value, { namespace }, this.immutableDbContexts[model.name])
				} else if (effect.operation === "remove") {
					assert(model.kind == "immutable", "cannot call .remove on a mutable model")
					await ImmutableModelAPI.remove(effect.key, this.immutableDbContexts[model.name])
				} else if (effect.operation === "set") {
					assert(model.kind == "mutable", "cannot call .set on an immutable model")
					await MutableModelAPI.set(effect.key, effect.value, { version }, this.mutableDbContexts[model.name])
				} else if (effect.operation === "delete") {
					assert(model.kind == "mutable", "cannot call .delete on an immutable model")
					await MutableModelAPI.delete(effect.key, { version }, this.mutableDbContexts[model.name])
				} else {
					signalInvalidType(effect)
				}
			}
		})
	}

	public async get(modelName: string, key: string) {
		const model = this.models[modelName]
		assert(model !== undefined, `model ${modelName} not found`)

		if (model.kind == "mutable") {
			return null
		} else if (model.kind == "immutable") {
			return ImmutableModelAPI.get(key, this.immutableDbContexts[modelName])
		} else {
			signalInvalidType(model.kind)
		}
	}

	public async selectAll(modelName: string): Promise<ModelValue[]> {
		const model = this.models[modelName]
		assert(model !== undefined, `model ${modelName} not found`)

		if (model.kind == "mutable") {
			return MutableModelAPI.selectAll(this.mutableDbContexts[modelName])
		} else if (model.kind == "immutable") {
			return ImmutableModelAPI.selectAll(this.immutableDbContexts[modelName])
		} else {
			signalInvalidType(model.kind)
		}
	}

	public iterate(modelName: string): AsyncIterable<ModelValue> {
		const model = this.models[modelName]
		assert(model !== undefined, `model ${modelName} not found`)

		if (model.kind == "mutable") {
			return MutableModelAPI.iterate(this.mutableDbContexts[modelName])
		} else if (model.kind == "immutable") {
			return ImmutableModelAPI.iterate(this.immutableDbContexts[modelName])
		} else {
			signalInvalidType(model.kind)
		}
	}

	public async query(modelName: string, query: {}): Promise<ModelValue[]> {
		const model = this.models[modelName]
		assert(model !== undefined, `model ${modelName} not found`)

		if (model.kind == "mutable") {
			return MutableModelAPI.query(query, this.mutableDbContexts[modelName])
		} else if (model.kind == "immutable") {
			return ImmutableModelAPI.query(query, this.immutableDbContexts[modelName])
		} else {
			signalInvalidType(model.kind)
		}
	}

	public async apply(
		effects: Effect[],
		options: { namespace?: string | undefined; version?: string | undefined; metadata?: string | undefined }
	): Promise<void> {
		await this.#transaction(effects, options)
	}

	public async close() {
		this.db.close()
	}
}
