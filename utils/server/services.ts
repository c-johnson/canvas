// import path from "node:path"

import { PrismaClient } from "@prisma/client"
// import Database, * as sqlite3 from "better-sqlite3"
import { Loader } from "utils/server/loader"
import * as IpfsHttpClient from "ipfs-http-client"

/**
 * This is a next.js hack to prevent new services from accumulating during hot reloading.
 * See https://github.com/vercel/next.js/issues/7811 for details.
 *
 * This does mean that code loaded here (ie Loader class methods) won't get hot-reloading treatment.
 */

declare global {
	var loader: Loader
	// var db: sqlite3.Database
	var prisma: PrismaClient
	var ipfs: IpfsHttpClient.IPFSHTTPClient
}

// function getDB(): sqlite3.Database {
// 	if (process.env.NODE_ENV === "production") {
// 		return new Database(dataPath)
// 	} else if (global.db !== undefined) {
// 		return global.db
// 	} else {
// 		global.db = new Database(dataPath)
// 		return global.db
// 	}
// }

// export const db = getDB()

function getPrismaClient() {
	if (process.env.NODE_ENV === "production") {
		return new PrismaClient()
	} else if (global.prisma !== undefined) {
		return global.prisma
	} else {
		global.prisma = new PrismaClient()
		return global.prisma
	}
}

export const prisma = getPrismaClient()

function getIpfsClient() {
	if (process.env.NODE_ENV === "production") {
		return IpfsHttpClient.create()
	} else if (global.ipfs !== undefined) {
		return global.ipfs
	} else {
		global.ipfs = IpfsHttpClient.create()
		return global.ipfs
	}
}

export const ipfs = getIpfsClient()

function getLoader(): Loader {
	if (process.env.NODE_ENV === "production") {
		return new Loader()
	} else if (global.loader !== undefined) {
		return global.loader
	} else {
		global.loader = new Loader()
		return global.loader
	}
}

export const loader = getLoader()
