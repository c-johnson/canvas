import type { Contract } from "@canvas-js/core"

export const maxX = 30
export const maxY = 30

export const contract = {
	topic: "canvas-example-chat-global",
	models: {
		state: {
			key: "primary", // "0" since this is a singleton
			direction: "string",
			tickCount: "integer",
			tiles: "string",
			gameOver: "string",
		},
	},
	actions: {
		newGame: (db) => {
			const centerX = Math.floor(maxX / 2)
			const centerY = Math.floor(maxY / 2)
			const tiles = JSON.stringify([
				[centerX, centerY - 1],
				[centerX, centerY],
				[centerX, centerY + 1],
			])
			db.set("state", {
				key: "0",
				direction: "n",
				tickCount: 0,
				tiles,
				gameOver: "",
			})
		},
		turn: async (db, { direction }) => {
			if (["n", "e", "w", "s"].indexOf(direction) === -1) {
				throw new Error()
			}
			const { direction: currentDirection, tickCount, tiles, gameOver } = await db.get("state", "0")
			if (
				(direction === "n" && currentDirection === "s") ||
				(direction === "s" && currentDirection === "n") ||
				(direction === "e" && currentDirection === "w") ||
				(direction === "w" && currentDirection === "e")
			) {
				throw new Error()
			}
			await db.set("state", { key: "0", direction, tickCount, tiles, gameOver })
		},
		tick: async (db) => {
			const { direction, tickCount, tiles, gameOver } = await db.get("state", "0")
			if (gameOver) throw new Error()

			const tilesList = JSON.parse(tiles)
			const [headX, headY] = tilesList[tilesList.length - 1]

			let next: [number, number]
			if (direction === "n") {
				next = [headX, headY + 1]
			} else if (direction === "e") {
				next = [headX + 1, headY]
			} else if (direction === "s") {
				next = [headX, headY - 1]
			} else if (direction === "w") {
				next = [headX - 1, headY]
			}

			if (
				next[0] < 0 ||
				next[0] > maxX ||
				next[1] < 0 ||
				next[1] > maxY ||
				tilesList.some(([tx, ty]) => tx === next[0] && ty === next[1])
			) {
				await db.set("state", { key: "0", gameOver: "true", direction, tickCount, tiles })
				return
			}

			tilesList.push(next)
			if (tickCount % 5 !== 0) {
				tilesList.shift()
			}

			await db.set("state", {
				key: "0",
				tickCount: tickCount + 1,
				tiles: JSON.stringify(tilesList),
				direction,
				gameOver,
			})
		},
	},
} satisfies Contract
