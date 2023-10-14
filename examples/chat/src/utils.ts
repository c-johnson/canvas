import { SessionStore } from "@canvas-js/interfaces"

export const location = "chat"

export const sessionStore: SessionStore = {
	get: (key) => window.localStorage.getItem(key),
	set: (key, value) => window.localStorage.setItem(key, value),
	delete: (key) => window.localStorage.removeItem(key),
}