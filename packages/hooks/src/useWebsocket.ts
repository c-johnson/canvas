import { useState, useEffect } from "react"

import { ApplicationData } from "./CanvasContext.js"

const WS_KEEPALIVE = 3000

type WebSocketExt = {
	waitingForHeartbeat?: boolean
	timer?: ReturnType<typeof setTimeout>
}

type SetupParams = {
	setIsLoading: Function
	setData: Function
	setError: Function
	reconnect: Function
}

const setupWebsocket = (host: string, { setIsLoading, setData, setError, reconnect }: SetupParams, delay: number) => {
	const wsHost = host.startsWith("/")
		? `ws${document.location.protocol === "https:" ? "s" : ""}://${document.location.host}${host}`
		: host.startsWith("http://")
		? host.replace("http://", "ws://")
		: host.startsWith("https://")
		? host.replace("https://", "wss://")
		: host
	const ws: WebSocket & WebSocketExt = new WebSocket(wsHost)

	// Set up application data and keep-alive
	ws.addEventListener("message", (event) => {
		if (event.data === "pong") {
			ws.waitingForHeartbeat = false
			return
		}
		try {
			const message = JSON.parse(event.data)
			if (message.action === "application") {
				setData(message.data)
				setIsLoading(false)
			}
		} catch (err) {
			console.log(err)
		}
	})
	ws.addEventListener("open", (event) => {
		ws.timer = setInterval(() => {
			if (ws.readyState !== ws.OPEN) return
			if (ws.waitingForHeartbeat === true) {
				console.log("ws: closing connection, server did not respond to keep-alive")
				ws.close()
				clearInterval(ws.timer)
				reconnect(delay)
			} else {
				ws.waitingForHeartbeat = true
				ws.send("ping")
			}
		}, WS_KEEPALIVE)
	})

	ws.addEventListener("close", () => {
		console.log("ws: connection closed")
		clearInterval(ws.timer)
		reconnect(delay)
	})

	return ws
}

export function useWebsocket({
	setIsLoading,
	setData,
	setError,
	host,
}: {
	setIsLoading: Function
	setData: Function
	setError: Function
	host: string
}): WebSocket | null {
	const [ws, setWS] = useState<WebSocket | null>(null)

	useEffect(() => {
		// Set up a websocket, and re-connect whenever connection fails
		const reconnect = (delay: number) => {
			const newDelay = delay < 10000 ? delay + 1000 : delay
			setTimeout(() => setWS(setupWebsocket(host, { setIsLoading, setData, setError, reconnect }, newDelay)), delay)
		}
		setWS(setupWebsocket(host, { setIsLoading, setData, setError, reconnect }, 0))
	}, [host])

	return ws
}