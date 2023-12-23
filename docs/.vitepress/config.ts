import { defineConfig } from "vitepress"
import namedCodeBlocks from "markdown-it-named-code-blocks"
import footnote from "markdown-it-footnote"
import { getSidebar } from "./getSidebar.js"

// https://vitepress.dev/reference/site-config
export default defineConfig({
	markdown: {
		config: (md) => {
			md.use(footnote)
			md.use(namedCodeBlocks)
		},
	},
	vite: {
		resolve: {
			preserveSymlinks: true,
		},
	},
	ignoreDeadLinks: [(url) => /^\.\/[0-9]+$/.test(url)], // ignore footnote links
	title: "Canvas",
	description: "A peer-to-peer runtime for decentralized applications",
	themeConfig: {
		logo: {
			light: "/icon_logo.png",
			dark: "/icon_logo_dark.png",
		},
		outlineTitle: "Contents",
		nav: [
			{ text: "Home", link: "/" },
			{ text: "API", link: "/readme-core" },
			{ text: "Blog", link: "/blog" },
		],
		sidebar: {
			"/blog": getSidebar({
				contentRoot: "/docs",
				contentDirs: ["blog"],
			}),
			"/": [
				{
					text: "Tutorial",
					items: [
						{ text: "Introduction", link: "/1-introduction" },
						{ text: "Contracts", link: "/2-contracts" },
						{ text: "Actions", link: "/3-actions" },
						{ text: "Authentication", link: "/4-authentication" },
						{ text: "Querying", link: "/5-querying" },
						{ text: "Connectivity", link: "/6-connectivity" },
						{ text: "Advanced Features", link: "/7-advanced" },
					],
				},
				{
					text: "Reference",
					items: [
						{ text: "CLI", link: "/readme-cli.md" },
						{ text: "Core", link: "/readme-core.md" },
						{ text: "Hooks", link: "/readme-hooks.md" },
						{
							text: "Components",
							collapsed: true,
							items: [
								{ text: "GossipLog", link: "/readme-gossiplog.md" },
								{ text: "ModelDB", link: "/readme-modeldb.md" },
								{ text: "Signed CID", link: "/readme-signed-cid.md" },
								{ text: "Interfaces", link: "/readme-interfaces.md" },
								{ text: "Discovery Service", link: "/readme-discovery.md" },
							],
						},
						{
							text: "Signers",
							collapsed: true,
							items: [
								{ text: "Ethereum", link: "/readme-chain-ethereum.md" },
								{ text: "Ethereum (Viem)", link: "/readme-chain-ethereum-viem.md" },
								{ text: "Bluesky/ATP", link: "/readme-chain-atp.md" },
								{ text: "Substrate", link: "/readme-chain-substrate.md" },
								{ text: "Solana", link: "/readme-chain-solana.md" },
								{ text: "Cosmos", link: "/readme-chain-cosmos.md" },
							],
						},
					],
				},
				{
					text: "Examples",
					items: [
						{ text: "Chat", link: "/examples-chat.md" },
						{ text: "Encrypted Chat", link: "/examples-encrypted-chat.md" },
						{ text: "Snake", link: "/examples-snake.md" },
						{ text: "Forum", link: "/examples-forum.md" },
						// { text: "Notes", link: "/examples-notes.md" }
					],
				},
			],
		},
		socialLinks: [
			{ icon: "github", link: "https://github.com/canvasxyz/canvas" },
			{ icon: "discord", link: "https://discord.gg/EjczssxKpR" },
			{ icon: "twitter", link: "https://twitter.com/canvas_xyz" },
		],
		search: {
			provider: "local",
		},
	},
})
