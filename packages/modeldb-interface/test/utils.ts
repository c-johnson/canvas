import { v4 as uuidv4 } from "uuid"
import "fake-indexeddb/auto"
import test, { ExecutionContext } from "ava"
import { AbstractModelDB, ModelsInit } from "@canvas-js/modeldb-interface"
import { ModelDB as ModelDBSqlite, ModelDBOptions } from "@canvas-js/modeldb-sqlite"
import { ModelDB as ModelDBIdb } from "@canvas-js/modeldb-idb"

export const testOnModelDB = (
	name: string,
	testFn: <M extends AbstractModelDB>(
		t: any,
		modelDBConstructor: (models: ModelsInit, options?: ModelDBOptions) => M | Promise<M>
	) => void
) => {
	const macro = test.macro(testFn)

	test(`Sqlite - ${name}`, macro, (models, options) => new ModelDBSqlite(":memory:", models, options))
	test(`IDB - ${name}`, macro, async (models, options) => {
		const databaseName = uuidv4()
		return ModelDBIdb.initialize(models, { databaseName, ...options })
	})
}

export const compareUnordered = (t: ExecutionContext, a: any[], b: any[]) => {
	t.is(a.length, b.length)

	const serializedA = a.map((x) => JSON.stringify(x)).sort()
	const serializedB = b.map((x) => JSON.stringify(x)).sort()
	t.deepEqual(serializedA, serializedB)
}
