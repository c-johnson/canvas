import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const middleware = (request: NextRequest) => {
	console.log(request.method, request.url)
	return NextResponse.redirect(new URL("/", request.url))
}

const config = {
	matcher: "/api/canvas/:path*",
}

export { middleware, config }
