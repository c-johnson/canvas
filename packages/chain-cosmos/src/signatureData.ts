import { configure } from "safe-stable-stringify"
import type { AminoMsg, StdSignDoc, StdFee } from "@cosmjs/amino"
import { makeSignDoc } from "@cosmjs/amino"
import type { ActionPayload, SessionPayload } from "@canvas-js/interfaces"
import { toBase64 } from "@cosmjs/encoding"

const jsonStableStringify = configure({ circularValue: Error, bigint: false, deterministic: true, strict: true })

export const getActionSignatureData = async (actionPayload: ActionPayload, address: string): Promise<StdSignDoc> => {
	const accountNumber = 0
	const sequence = 0
	const chainId = ""
	const fee: StdFee = {
		gas: "0",
		amount: [],
	}
	const memo = ""

	const jsonTx: AminoMsg = {
		type: "sign/MsgSignData",
		value: {
			signer: address,
			data: jsonStableStringify(actionPayload),
		},
	}
	const signDoc = makeSignDoc([jsonTx], fee, chainId, memo, accountNumber, sequence)
	return signDoc
}

export const getSessionSignatureData = async (
	sessionPayload: SessionPayload,
	address: string,
	chain_id?: string
): Promise<StdSignDoc> => {
	const accountNumber = 0
	const sequence = 0
	const chainId = chain_id ?? ""
	const fee: StdFee = {
		gas: "0",
		amount: [],
	}
	const memo = ""

	const jsonTx: AminoMsg = {
		type: "sign/MsgSignData",
		value: {
			signer: address,
			data: toBase64(Buffer.from(jsonStableStringify(sessionPayload))),
		},
	}
	const signDoc = makeSignDoc([jsonTx], fee, chainId, memo, accountNumber, sequence)
	return signDoc
}
