import test from "ava"

import type { Message } from "@canvas-js/interfaces"

import { MessageLog } from "@canvas-js/gossiplog/memory"

import { collect } from "./utils.js"

const validate = (payload: unknown): payload is string => typeof payload === "string"

test("append three messages", async (t) => {
	const topic = "com.example.test"
	const log = await MessageLog.open({ topic, apply: () => {}, validate, signatures: false })

	const { id: foo } = await log.append("foo")
	const { id: bar } = await log.append("bar")
	const { id: baz } = await log.append("baz")

	t.deepEqual(await collect(log.iterate()), [
		[foo, null, { topic, clock: 1, parents: [], payload: "foo" }],
		[bar, null, { topic, clock: 2, parents: [foo], payload: "bar" }],
		[baz, null, { topic, clock: 3, parents: [bar], payload: "baz" }],
	])
})

test("insert three concurrent messages and append a fourth", async (t) => {
	const topic = "com.example.test"
	const log = await MessageLog.open({ topic, apply: () => {}, validate, signatures: false })

	const { id: foo } = await log.insert(null, { topic, clock: 1, parents: [], payload: "foo" })
	const { id: bar } = await log.insert(null, { topic, clock: 1, parents: [], payload: "bar" })
	const { id: baz } = await log.insert(null, { topic, clock: 1, parents: [], payload: "baz" })

	const entries: [string, null, Message<string>][] = [
		[foo, null, { topic, clock: 1, parents: [], payload: "foo" }],
		[bar, null, { topic, clock: 1, parents: [], payload: "bar" }],
		[baz, null, { topic, clock: 1, parents: [], payload: "baz" }],
	]

	entries.sort(([a], [b]) => (a < b ? -1 : b < a ? 1 : 0))

	t.deepEqual(await collect(log.iterate()), entries)

	const { id: qux } = await log.append("qux")
	t.deepEqual(await collect(log.iterate()), [
		...entries,
		[qux, null, { topic, clock: 2, parents: entries.map(([id]) => id), payload: "qux" }],
	])
})
