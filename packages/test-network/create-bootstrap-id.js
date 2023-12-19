#!/usr/bin/env node

import fs from "node:fs"
import { createEd25519PeerId, exportToProtobuf } from "@libp2p/peer-id-factory"

const id = await createEd25519PeerId()

const bootstrapPeerPort = 4444
const bootstrapPeerEnvironment = {
	PEER_ID: Buffer.from(exportToProtobuf(id)).toString("base64"),
	LISTEN: `/ip4/127.0.0.1/tcp/${bootstrapPeerPort}/ws`,
}

fs.writeFileSync(
	".env",
	Object.entries(bootstrapPeerEnvironment)
		.map(([key, value]) => `${key}=${value}\n`)
		.join(""),
)

const replicationServerEnvironment = {
	BOOTSTRAP_LIST: [`/dns4/bootstrap-peer/tcp/4444/ws/p2p/${id}`].join(" "),
}

fs.writeFileSync(
	".env.server",
	Object.entries(replicationServerEnvironment)
		.map(([key, value]) => `${key}=${value}\n`)
		.join(""),
)
