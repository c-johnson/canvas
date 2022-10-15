import fs from "node:fs"
import path from "node:path"

import yargs from "yargs"
import chalk from "chalk"
import Database from "better-sqlite3"

import { constants } from "@canvas-js/core"
import { CANVAS_HOME, cidPattern } from "../utils.js"

export const command = "list"
export const desc = "List all specs in the data directory"

export const builder = (yargs: yargs.Argv) => yargs

export async function handler({}) {
	console.log(`Showing local specs in ${path.resolve(CANVAS_HOME)}\n`)
	for (const cid of fs.readdirSync(CANVAS_HOME)) {
		if (!cidPattern.test(cid)) {
			console.warn(chalk.yellow(`[canvas-cli] Unknown spec or invalid CIDv0, skipping: ${cid}`))
			continue
		}

		console.log(cid)

		const specPath = path.resolve(CANVAS_HOME, cid, constants.SPEC_FILENAME)
		if (fs.existsSync(specPath)) {
			const specStat = fs.statSync(specPath)
			console.log(`Spec:     ${specStat.size} bytes`)
		}

		const messagesPath = path.resolve(CANVAS_HOME, cid, constants.MESSAGE_DATABASE_FILENAME)
		if (fs.existsSync(messagesPath)) {
			const messagesStat = fs.statSync(messagesPath)
			const messagesDB = new Database(messagesPath)
			const { count: actionCount } = messagesDB.prepare("SELECT COUNT(*) AS count FROM actions").get()
			const { count: sessionCount } = messagesDB.prepare("SELECT COUNT(*) AS count FROM sessions").get()
			console.log(`Messages: ${messagesStat.size} bytes (${actionCount} actions, ${sessionCount} sessions)`)
		}

		const modelsPath = path.resolve(CANVAS_HOME, cid, constants.MODEL_DATABASE_FILENAME)
		if (fs.existsSync(modelsPath)) {
			const modelsStat = fs.statSync(modelsPath)
			console.log(`Models:   ${modelsStat.size} bytes`)
		}

		console.log("")
	}
}
