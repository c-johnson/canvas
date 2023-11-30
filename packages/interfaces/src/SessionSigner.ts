import type { Signer } from "./Signer.js"
import type { Message } from "./Message.js"
import type { Session } from "./Session.js"
import type { Action } from "./Action.js"
import type { Awaitable } from "./Awaitable.js"
import { Heartbeat } from "./Heartbeat.js"

export interface SessionSigner<AuthorizationData = any>
	extends Signer<Message<Action | Session<AuthorizationData> | Heartbeat>> {
	match: (chain: string) => boolean

	/**
	 * `getSession` is called by the Canvas runtime for every new action appended
	 * to the log (ie for new actions taken by local users, not existing messages
	 * received from other peers via merkle sync or GossipSub).
	 *
	 * It's responsible for returning a `Session` that matches the given parameters,
	 * either by looking up a cached session, or by getting user authorization to create
	 * a new one (and then caching it).
	 *
	 * "Matching the given parameters" means that the caller passes a `topic: string`
	 * and an optional `chain?: string; timestamp?: number`, and `getSession` must return
	 * a `Session` authorized for that topic, that specific chain (if provided), and that
	 * is valid for the given timestamp (if provided).
	 */
	getSession: (
		topic: string,
		options?: { chain?: string; timestamp?: number; fromCache?: boolean },
	) => Awaitable<Session<AuthorizationData>>

	/**
	 * Verify that `session.data` authorizes `session.publicKey`
	 * to take actions on behalf of the user `${session.chain}:${session.address}`
	 */
	verifySession: (topic: string, session: Session<AuthorizationData>) => Awaitable<void>

	clear(topic: string): Awaitable<void>
}
