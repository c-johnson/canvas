import { AbstractModelDB, Config, ModelsInit, parseConfig } from "@canvas-js/modeldb-interface"
import { IDBPDatabase, openDB } from "idb"
import { signalInvalidType } from "./utils.js"
import {
	createIdbImmutableModelAPI,
	createIdbMutableModelAPI,
	getRecordTableName,
	getRelationTableName,
	getTombstoneTableName,
} from "./api.js"

export interface ModelDBOptions {
	dkLen?: number
	resolve?: (versionA: string, versionB: string) => string
}

export class ModelDB extends AbstractModelDB {
	public static async initialize(models: ModelsInit, options?: ModelDBOptions) {
		const config = parseConfig(models)

		console.log(config)

		for (const model of config.models) {
			const columnNames: string[] = []
			for (const [i, property] of model.properties.entries()) {
				if (property.kind === "primitive" || property.kind === "reference") {
					columnNames.push(`"${property.name}"`)
				} else if (property.kind === "relation") {
					continue
				} else {
					signalInvalidType(property)
				}
			}
			if (columnNames.length == 0) {
				throw new Error(`Model "${model.name}" has no columns`)
			}
		}

		const db = await openDB("modeldb", 1, {
			upgrade(db: any) {
				// create model stores
				for (const model of config.models) {
					db.createObjectStore(getRecordTableName(model.name))
					if (model.kind == "mutable") {
						db.createObjectStore(getTombstoneTableName(model.name))
					}
				}

				for (const relation of config.relations) {
					db.createObjectStore(getRelationTableName(relation.source, relation.property))
				}
			},
		})

		return new ModelDB(db, config, options)
	}

	constructor(public readonly db: IDBPDatabase, config: Config, options?: ModelDBOptions) {
		super()

		for (const model of config.models) {
			if (model.kind === "immutable") {
				this.apis[model.name] = createIdbImmutableModelAPI(this.db, model, options)
			} else if (model.kind === "mutable") {
				this.apis[model.name] = createIdbMutableModelAPI(this.db, model, options)
			} else {
				signalInvalidType(model.kind)
			}
		}
	}

	close() {
		this.db.close()
	}
}
