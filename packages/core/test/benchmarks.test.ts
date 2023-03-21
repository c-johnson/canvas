import os from "node:os"
import fs from "node:fs"
import path from "node:path"

import test from "ava"

import { sha256 } from "@noble/hashes/sha256"

import { createEd25519PeerId, exportToProtobuf } from "@libp2p/peer-id-factory"

import { nanoid } from "nanoid"

import { Core } from "@canvas-js/core"
import { PEER_ID_FILENAME } from "@canvas-js/core/constants"
import { toHex } from "@canvas-js/core/utils"

import { compileSpec, TestSigner } from "./utils.js"
import { Message, serializeAction } from "@canvas-js/interfaces"
import chalk from "chalk"
import { Ed25519PeerId } from "@libp2p/interface-peer-id"

const waitForMessageWithHash = (core: Core, expectedHash: string) => {
	return new Promise<void>((resolve, reject) => {
		const cb = ({ detail: message }: { detail: Message }) => {
			testLog(`received: ${message}`)
			if (message.type == "action") {
				const messageHash = toHex(sha256(serializeAction(message)))

				if (messageHash == expectedHash) {
					core.removeEventListener("message", cb)
					resolve()
				}
			}
		}
		core.addEventListener("message", cb)
	})
}

class Timer {
	startTime: Date
	endTime: Date | null

	constructor() {
		this.startTime = new Date()
		this.endTime = null
	}

	done() {
		this.endTime = new Date()
	}

	seconds() {
		// @ts-ignore
		const timeDiffMs = this.endTime - this.startTime
		return timeDiffMs / 1000
	}
}

const { app, appName, spec } = await compileSpec({
	name: "Test App",
	models: {},
	actions: { log: ({ message }, {}) => console.log(message) },
})

const signer = new TestSigner(app, appName)

const testLog = (message: string) => {
	console.log(chalk.blueBright(`[test] ${message}`))
}

const setupTestPeer = async (host: string, port: number) => {
	const directory = path.resolve(os.tmpdir(), nanoid())
	fs.mkdirSync(directory)
	const peerId = await createEd25519PeerId()
	fs.writeFileSync(path.resolve(directory, PEER_ID_FILENAME), exportToProtobuf(peerId))

	return {
		peerId,
		port,
		directory,
		multiaddr: `/ip4/${host}/tcp/${port}/ws/p2p/${peerId}`,
		destroy: () => {
			fs.rmSync(directory, { recursive: true })
		},
	}
}

const initializeTestCores = async (
	configs: { peerId: Ed25519PeerId; port: number; directory: string; multiaddr: string }[]
) => {
	const configsByMultiaddr = Object.fromEntries(configs.map((config) => [config.multiaddr, config]))

	const promises = []

	for (const multiaddr of Object.keys(configsByMultiaddr)) {
		const config = configsByMultiaddr[multiaddr]
		const bootstrapList = Object.keys(configsByMultiaddr).filter((otherMultiaddr) => otherMultiaddr !== multiaddr)
		promises.push(
			Core.initialize({
				directory: config.directory,
				spec,
				listen: config.port,
				bootstrapList,
				announce: [multiaddr],
				// verbose: true,
			})
		)
	}

	return Promise.all(promises)
}

test("time sending two messages both ways", async (t) => {
	t.timeout(50000)

	const host = "127.0.0.1"
	const configs = await Promise.all([setupTestPeer(host, 8001), setupTestPeer(host, 8002)])

	try {
		const [source, target] = await initializeTestCores(configs)

		const actionTimer = new Timer()
		const a = await signer.sign("log", { message: "a" })
		const { hash: sourceHash } = await source.apply(a)
		testLog(`sourceHash: ${sourceHash}`)

		const b = await signer.sign("log", { message: "b" })
		const { hash: targetHash } = await target.apply(b)
		testLog(`targetHash: ${targetHash}`)

		await Promise.all([waitForMessageWithHash(target, sourceHash), waitForMessageWithHash(source, targetHash)])
		actionTimer.done()
		testLog(`initial sync and message send took ${actionTimer.seconds()} seconds`)

		const timings: number[] = []

		for (let i = 0; i < 20; i++) {
			testLog(`test run: ${i}`)
			const actionTimer2 = new Timer()
			const a2 = await signer.sign("log", { message: "a2" })
			const { hash: sourceHash2 } = await source.apply(a2)
			testLog(`sourceHash: ${sourceHash2}`)

			const b2 = await signer.sign("log", { message: "b2" })
			const { hash: targetHash2 } = await target.apply(b2)
			testLog(`targetHash: ${targetHash2}`)

			await Promise.all([waitForMessageWithHash(target, sourceHash2), waitForMessageWithHash(source, targetHash2)])
			actionTimer2.done()
			testLog(`sync and message send took ${actionTimer2.seconds()} seconds`)
			timings.push(actionTimer2.seconds())
		}

		testLog("timings for sending messages both ways:")
		testLog(`${timings}`)
		const mean = timings.reduce((x, y) => x + y, 0) / timings.length
		testLog(`average: ${mean.toFixed(3)}`)
		t.pass()

		await source.close()
		await target.close()
	} finally {
		for (const config of configs) {
			config.destroy()
		}
	}
})
