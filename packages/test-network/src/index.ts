import { spawn } from "node:child_process"
import process from "node:process"
import path from "node:path"
import fs from "node:fs"

import * as esbuild from "esbuild"
import puppeteer from "puppeteer"
import express from "express"

import { createEd25519PeerId, exportToProtobuf } from "@libp2p/peer-id-factory"

const { SERVER_COUNT, CLIENT_COUNT } = process.env

const discoveryTopic = "canvas-discovery"
const serverCount = parseInt(SERVER_COUNT ?? "1")
const clientCount = parseInt(CLIENT_COUNT ?? "3")

const cacheDirectory = path.resolve(".cache")

{
	if (fs.existsSync(cacheDirectory)) {
		console.log(`Removing old cache directory at ${cacheDirectory}`)
		fs.rmSync(cacheDirectory, { recursive: true })
	}

	console.log(`Creating cache directory at ${cacheDirectory}`)
	fs.mkdirSync(cacheDirectory)
}

const controller = new AbortController()

const bootstrapListenAddress = `/ip4/127.0.0.1/tcp/9000/ws`
const bootstrapAPIPort = 8000
const bootstrapPeerId = await createEd25519PeerId()

{
	const { pathname: bootstrapPeerPath } = new URL(import.meta.resolve("@canvas-js/bootstrap-peer"))

	const bootstrapPeer = spawn("node", [bootstrapPeerPath], {
		env: {
			...process.env,
			PEER_ID: Buffer.from(exportToProtobuf(bootstrapPeerId)).toString("base64"),
			LISTEN: bootstrapListenAddress,
			PORT: bootstrapAPIPort.toString(),
			DISCOVERY_TOPIC: discoveryTopic,
		},
		signal: controller.signal,
		killSignal: "SIGINT",
	})

	bootstrapPeer.on("error", (err) => console.error(err))
	bootstrapPeer.stdout.pipe(process.stdout)
}

const bootstrapList = [`${bootstrapListenAddress}/p2p/${bootstrapPeerId.toString()}`]

const prometheusTargets: string[] = []

// Start CLI servers
const { pathname: cliPath } = new URL(import.meta.resolve("@canvas-js/cli"))
for (let i = 0; i < serverCount; i++) {
	const port = 8000 + 1 + i
	prometheusTargets.push(`host.docker.internal:${port}`)

	const nodeArgs = [
		cliPath,
		"run",
		path.resolve(cacheDirectory, `server-${i}`),
		"--init",
		path.resolve("assets/contract.canvas.js"),
		"--listen",
		`/ip4/127.0.0.1/tcp/${9000 + 1 + i}/ws`,
		...bootstrapList.flatMap((address) => ["--bootstrap", address]),
		"--discovery-topic",
		discoveryTopic,
		"--port",
		port.toString(),
		"--metrics",
	]

	const server = spawn("node", nodeArgs, { signal: controller.signal, killSignal: "SIGINT" })

	server.on("error", (err) => console.error(`[server-${i}]`, err))

	server.stdout.on("data", (chunk: Buffer) => {
		const [first, ...rest] = chunk.toString("utf-8").split("\n")
		process.stdout.write(`[server-${i}] ${first}\n`)
		for (const line of rest) {
			if (line.length > 0) {
				process.stdout.write(`[server-${i}] ${line}\n`)
			}
		}
	})
}

{
	const result = await esbuild.build({
		format: "esm",
		entryPoints: ["src/client/index.ts"],
		bundle: true,
		outdir: "dist",
		platform: "browser",
		external: ["fs", "path"],
	})

	for (const error of result.errors) {
		console.error("[esbuild] [error]", error)
	}

	for (const warning of result.warnings) {
		console.warn("[esbuild] [warning]", warning)
	}

	if (result.errors.length > 0) {
		throw new Error("compilation failed")
	}

	console.log("Compiled client bundle")
}

// Start HTTP server
const port = 8888

const app = express()
app.use(express.text())
app.use(express.json())
app.use("/", express.static("assets"))
app.use("/dist", express.static("dist"))
await new Promise<void>((resolve) => {
	const server = app.listen(port, () => {
		console.log(`HTTP server listening on http://localhost:${port}`)
		resolve()
	})

	controller.signal.addEventListener("abort", () => server.close())
})

// https://prometheus.io/docs/prometheus/latest/configuration/configuration/#http_sd_config
app.use("/api/services", (req, res) =>
	res.json([
		{
			targets: [`host.docker.internal:${bootstrapAPIPort}`],
			labels: { service: "bootstrap" },
		},
		{
			targets: prometheusTargets,
			labels: { service: "server" },
		},
	]),
)

// Start puppeteer clients
await Promise.all(
	Array.from({ length: clientCount }, async (_, i) => {
		const browser = await puppeteer.launch({
			headless: "new",
			args: ["--enable-automation"],
			userDataDir: path.resolve(cacheDirectory, `client-${i}`),
			handleSIGINT: false,
		})

		const page = await browser.newPage()

		page.on("console", (msg) => {
			const type = msg.type()
			Promise.all(msg.args().map((arg) => arg.jsonValue())).then(([format, ...args]) =>
				console.log(`[client-${i}] [${type}] ${format}`, ...args),
			)
		})

		await page.evaluateOnNewDocument(`
            localStorage.setItem("bootstrapList", JSON.stringify(${JSON.stringify(bootstrapList)}));
            localStorage.setItem("discoveryTopic", "${discoveryTopic}");
        `)

		await page.goto(`http://localhost:${port}/`)

		controller.signal.addEventListener("abort", () => browser.close())
	}),
)

process.on("SIGINT", () => controller.abort())
