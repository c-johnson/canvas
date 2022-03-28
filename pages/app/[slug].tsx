import React, { useCallback, useState } from "react"

import type { GetServerSideProps } from "next"

import { prisma } from "utils/server/services"
import { Editor } from "components/SpecEditor"
import { Viewer } from "components/SpecViewer"
import { Actions } from "components/SpecActions"
import { Sidebar } from "components/SpecSidebar"

interface AppPageProps {
	version_number: number | null
	app: {
		slug: string
		draft_spec: string
		versions: {
			multihash: string
			version_number: number
			spec: string
		}[]
	}
}

/**
 * This page /app/[slug], by default, renders the draft_spec of the app
 * in an editable CodeMirror editor. Putting a version number in the query
 * string e.g. /app/[slug]?version=v8 will render a the spec of that version
 * in a readonly CodeMirror editor.
 */

type AppPageParams = { slug: string; version?: string }

export const getServerSideProps: GetServerSideProps<AppPageProps, AppPageParams> = async (context) => {
	const { slug } = context.params!

	const app = await prisma.app.findUnique({
		select: {
			id: true,
			slug: true,
			draft_spec: true,
			versions: {
				select: { version_number: true, multihash: true, spec: true },
				orderBy: { version_number: "desc" },
			},
		},
		where: { slug },
	})

	if (app === null) {
		return { notFound: true }
	}

	const { version } = context.query
	if (version === undefined) {
		return { props: { version_number: null, app } }
	}

	if (typeof version !== "string") {
		return { notFound: true }
	}

	const match = version.match(/^v(\d+)$/)
	if (match === null) {
		return { notFound: true }
	}

	const [_, n] = match
	const version_number = parseInt(n)

	if (app.versions.some((version) => version.version_number === version_number)) {
		return { props: { version_number, app } }
	} else {
		return { notFound: true }
	}
}

export default function AppPage({ version_number, app }: AppPageProps) {
	const [edited, setEdited] = useState(false)
	const onEdited = useCallback(() => setEdited(true), [])

	// We have already checked that the version number exists in app.versions
	// on the server side so it's safe to use the assert here
	const version =
		version_number === null ? null : app.versions.find((version) => version.version_number === version_number)!

	return (
		<div className="flex">
			<div className="w-60 pr-6">
				<Sidebar version_number={version_number} app={app} edited={edited} />
			</div>
			{version === null ? <Editor key="editor" app={app} onEdited={onEdited} /> : <Viewer {...version} />}
			<div className="w-96 pl-6">
				<div className="font-semibold mb-3">Actions</div>
				<Actions app={app} />
			</div>
		</div>
	)
}
