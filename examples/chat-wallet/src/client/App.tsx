import React, { useCallback, useEffect, useState } from "react"

import { useAccount, useConnect } from "wagmi"

import { PrivateUserRegistration, Room, RoomRegistration } from "../shared/index.js"

import { ChatView } from "./views/ChatView.js"
import { RegistrationView } from "./views/RegistrationView.js"
import { SelectWalletView } from "./views/SelectWalletView.js"
import { AppContext } from "./AppContext.js"
import { db } from "./db.js"
import { addRoomEventStore, roomRegistry } from "./stores.js"

export const App: React.FC<{}> = ({}) => {
	const { connect, connectors } = useConnect()
	const { address: userAddress, isConnected } = useAccount()

	const [user, setUser] = useState<PrivateUserRegistration | null>(null)
	const [room, setRoom] = useState<Room | null>(null)

	useEffect(() => {
		if (user !== null) {
			db.rooms.toArray().then((rooms) => Promise.all(rooms.map((room) => addRoomEventStore(user, room))))

			const handleEvent = (id: string, room: RoomRegistration) => {
				if (room.members.some((member) => member.address === user.address)) {
					console.log(`adding room ${id} to Dexie`)
					db.rooms.add({ id, ...room }).catch((err) => {
						console.error(err)
					})

					addRoomEventStore(user, { id, ...room })
				}
			}

			roomRegistry.addListener(handleEvent)
			return () => roomRegistry.removeListener(handleEvent)
		}
	}, [user])

	const setCurrentRoom = useCallback((room: Room | null) => {
		if (room === null) {
			location.hash = ""
		} else {
			location.hash = room.id
		}

		setRoom(room)
	}, [])

	useEffect(() => {
		const { hash } = window.location
		if (hash.startsWith("#")) {
			const roomId = hash.slice(1)

			db.rooms.get(roomId).then((room) => {
				if (room) {
					setRoom(room)
				} else {
					window.location.hash = ""
				}
			})
		}
	}, [])

	if (!isConnected || userAddress === undefined) {
		return (
			<SelectWalletView
				selectWallet={async (wallet) => {
					if (wallet == "metamask") {
						connect({ connector: connectors[0] })
					} else if (wallet == "walletconnect") {
						connect({ connector: connectors[1] })
					}
				}}
			/>
		)
	} else if (user === null) {
		return <RegistrationView setUser={setUser} />
	} else {
		return (
			<AppContext.Provider value={{ currentRoom: room, setCurrentRoom, user, setUser }}>
				<ChatView />
			</AppContext.Provider>
		)
	}
}