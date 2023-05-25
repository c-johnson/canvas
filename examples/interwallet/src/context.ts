import { createContext } from "react"

import { PeerId } from "@libp2p/interface-peer-id"

import { PrivateUserRegistration } from "./interfaces"
import { RoomManager } from "./manager"
import { Room } from "./db"

export interface AppContext {
	peerId: PeerId | null
	manager: RoomManager | null

	user: PrivateUserRegistration | null
	setUser: (user: PrivateUserRegistration | null) => void

	pageTitle: string | null
	setPageTitle: (title: string | null) => void

	room: Room | null
	setRoom: (room: Room | null) => void
}

export const AppContext = createContext<AppContext>({
	peerId: null,
	manager: null,

	user: null,
	setUser() {
		throw new Error("Missing AppContext provider")
	},

	room: null,
	setRoom() {
		throw new Error("Missing AppContext provider")
	},

	pageTitle: null,
	setPageTitle() {
		throw new Error("Missing AppContext provider")
	},
})
