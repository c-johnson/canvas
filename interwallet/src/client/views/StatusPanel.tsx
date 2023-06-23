import React, { useCallback, useContext, useState } from "react"

import { protocolPrefix } from "@canvas-js/store"

import { PeerIdToken } from "./PeerIdToken.js"
import { ConnectionList } from "./ConnectionList.js"
import { PubsubPeerList } from "./PubsubPeerList.js"
import { ChatContext } from "./ChatContext.js"

export const StatusPanel = () => {
	const { libp2p } = useContext(ChatContext)

	return (
		<div className="overflow-y-scroll flex flex-col items-stretch bg-gray-100 border-l border-gray-300">
			{/* <button
				className="py-1 px-2 text-left border-b border-gray-300 bg-gray-100 hover:cursor-pointer hover:bg-gray-200 active:bg-gray-300"
				disabled={starting || stopping}
				onClick={handleClick}
			>
				{started ? "stop libp2p" : "start libp2p"}
			</button> */}
			<div className="flex flex-row border-b border-gray-300 items-center">
				{libp2p && libp2p.peerId && <PeerIdToken peerId={libp2p.peerId} />}
			</div>
			{<ConnectionList libp2p={libp2p} />}
			{<PubsubPeerList libp2p={libp2p} protocolPrefix={protocolPrefix} />}
		</div>
	)
}
