import path from "node:path"
import assert from "node:assert"
import { MessagePort, parentPort } from "node:worker_threads"

import dotenv from "dotenv"
dotenv.config({ path: ".env" })

const appDirectory = process.env.APP_DIRECTORY
if (appDirectory === undefined) {
	throw new Error("Missing APP_DIRECTORY environment variable from .env")
}

/**
 * https://nodejs.org/dist/latest-v16.x/docs/api/worker_threads.html#class-worker
 * The nodejs docs recommend instantiating multiple MessagePorts for "separation
 * of concerns", and only using the main "global" port for setting them up in the
 * beginning.
 *
 * When we create a worker, the main thread sends the worker the multihash of the
 * spec along with two ports actionPort and modelPort. The worker sends back (on the
 * global port) a message { models, routes, actionParameters } that the main thread
 * uses to initialize the database, prepare route query statements, and so on.
 *
 * To apply an action, the main thread sends an { id, action } message on the actionPort
 * and expects a { id: "success" } | { id: "failure"; message: string } message in response.
 *
 * When an action handler wants to emit a model record, it calls this.db[name].create(params),
 * which gets forwarded on modelPort as a { id, name, params } message.
 */

parentPort.once("message", async ({ multihash, actionPort, modelPort }) => {
	assert(typeof multihash === "string")
	assert(actionPort instanceof MessagePort)
	assert(modelPort instanceof MessagePort)

	const appPath = path.resolve(appDirectory, multihash)
	const specPath = path.resolve(appPath, "spec.js")
	const { actions, models, routes } = await import(specPath)

	// This is a little extra factory step so that the
	// db.[name].create(...) methods that the handler calls
	// have access to the id of the action. Also this isolates
	// the action handlers from each other. There's probably
	// a better way to do this.
	function makeDB(id) {
		const db = {}
		for (const name of Object.keys(models)) {
			db[name] = {
				create(args) {
					modelPort.postMessage({ id, name, args })
				},
			}
		}
		return db
	}

	actionPort.on("message", ({ id, action: { name, args, ...context } }) => {
		console.log("got action!", id, name, args, context)
		const db = makeDB(id)
		actions[name]
			.apply({ db, ...context })
			.then(() => actionPort.postMessage({ id, status: "success" }))
			.catch((err) =>
				actionPort.postMessage({
					id,
					status: "failure",
					message: err.toString(),
				})
			)
	})

	const actionParameters = {}
	for (const [name, handler] of Object.entries(actions)) {
		assert(typeof handler === "function")
		actionParameters[name] = parseHandlerParameters(handler)
	}

	parentPort.postMessage({ models, routes, actionParameters })
})

// https://stackoverflow.com/questions/1007981/how-to-get-function-parameter-names-values-dynamically
function parseHandlerParameters(handler) {
	return handler
		.toString()
		.replace(/[/][/].*$/gm, "") // strip single-line comments
		.replace(/\s+/g, "") // strip white space
		.replace(/[/][*][^/*]*[*][/]/g, "") // strip multi-line comments
		.split("){", 1)[0]
		.replace(/^[^(]*[(]/, "") // extract the parameters
		.replace(/=[^,]+/g, "") // strip any ES6 defaults
		.split(",")
		.filter(Boolean) // split & filter [""]
}
