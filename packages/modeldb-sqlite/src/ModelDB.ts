import assert from "node:assert"

import Database, * as sqlite from "better-sqlite3"

import {
	Config,
	ImmutableModelAPI,
	IModelDB,
	ModelsInit,
	ModelValue,
	MutableModelAPI,
	parseConfig,
} from "@canvas-js/modeldb-interface"
import { initializeModel, initializeRelation } from "./initialize.js"
import { signalInvalidType } from "./utils.js"
import { createSqliteImmutableModelAPI, createSqliteMutableModelAPI } from "./api.js"

export interface ModelDBOptions {
	dkLen?: number
	resolve?: (versionA: string, versionB: string) => string
}

export class ModelDB implements IModelDB {
	public readonly db: sqlite.Database
	public readonly config: Config

	private apis: Record<string, MutableModelAPI | ImmutableModelAPI> = {}

	constructor(public readonly path: string, public readonly models: ModelsInit, options: ModelDBOptions = {}) {
		this.config = parseConfig(models)
		this.db = new Database(path)

		for (const model of this.config.models) {
			initializeModel(model, (sql) => this.db.exec(sql))
		}

		for (const relation of this.config.relations) {
			initializeRelation(relation, (sql) => this.db.exec(sql))
		}

		for (const model of this.config.models) {
			if (model.kind === "immutable") {
				this.apis[model.name] = createSqliteImmutableModelAPI(this.db, model, options)
			} else if (model.kind === "mutable") {
				this.apis[model.name] = createSqliteMutableModelAPI(this.db, model, options)
			} else {
				signalInvalidType(model.kind)
			}
		}
	}

	public async close() {
		this.db.close()
	}

	public async get(modelName: string, key: string) {
		const api = this.apis[modelName]
		assert(api !== undefined, "model not found")
		if (api instanceof MutableModelAPI) {
			return null
		} else if (api instanceof ImmutableModelAPI) {
			return api.get(key)
		} else {
			signalInvalidType(api)
		}
	}

	public async *iterate(modelName: string): AsyncIterable<ModelValue> {
		const api = this.apis[modelName]
		assert(api !== undefined, "model not found")
		if (api instanceof MutableModelAPI || api instanceof ImmutableModelAPI) {
			yield* api.iterate()
		}
	}

	public query(modelName: string, query: {}): AsyncIterable<ModelValue> {
		throw new Error("not implemented")
	}

	// Mutable model methods

	public async set(
		modelName: string,
		key: string,
		value: ModelValue,
		options: { metadata?: string; version?: string } = {}
	) {
		const api = this.apis[modelName]
		assert(api !== undefined, `model ${modelName} not found`)
		assert(api instanceof MutableModelAPI, "cannot call .set on an immutable model")
		api.set(key, value, options)
	}

	public async delete(modelName: string, key: string, options: { metadata?: string; version?: string } = {}) {
		const api = this.apis[modelName]
		assert(api !== undefined, `model ${modelName} not found`)
		assert(api instanceof MutableModelAPI, "cannot call .delete on an immutable model")
		api.delete(key, options)
	}

	// Immutable model methods

	public async add(modelName: string, value: ModelValue, options: { metadata?: string; namespace?: string } = {}) {
		const api = this.apis[modelName]
		assert(api !== undefined, `model ${modelName} not found`)
		assert(api instanceof ImmutableModelAPI, "cannot call .add on a mutable model")
		return api.add(value, options)
	}

	public async remove(modelName: string, key: string) {
		const api = this.apis[modelName]
		assert(api !== undefined, `model ${modelName} not found`)
		assert(api instanceof ImmutableModelAPI, "cannot call .remove on a mutable model")
		api.remove(key)
	}
}