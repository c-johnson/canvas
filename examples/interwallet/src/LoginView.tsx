import React from "react"

export const LoginView = () => {
	return (
		<div className="flex flex-row items-center justify-center h-screen overflow-hidden bg-white">
			<div className="container max-w-lg m-auto p-4 bg-gray-100 flex flex-col gap-4">
				<div className="text-2xl font-bold">Log in</div>
				<div
					className={`border rounded p-2 bg-gray-50 border-gray-400 drop-shadow-md hover:drop-shadow active:drop-shadow-sm hover:cursor-pointer hover:border-gray-300 hover:bg-gray-100`}
				>
					MetaMask
				</div>

				<div
					className={`border rounded p-2 bg-gray-50 border-gray-400 drop-shadow-md hover:drop-shadow active:drop-shadow-sm hover:cursor-pointer hover:border-gray-300 hover:bg-gray-100`}
				>
					WalletConnect
				</div>
			</div>
		</div>
	)
}
