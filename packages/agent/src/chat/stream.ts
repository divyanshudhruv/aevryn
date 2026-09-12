import type { UIMessage } from "ai";
import type { ChatMessage } from "@aevryn/db";

export function isCompletedMessage(row: ChatMessage): boolean {
	return row.status === "completed" && row.content !== null;
}

export function chatRowToUIMessage(row: ChatMessage): UIMessage | null {
	if (!isCompletedMessage(row) || row.role === "tool") {
		return null;
	}
	const parts = row.content as UIMessage["parts"];
	if (!Array.isArray(parts) || parts.length === 0) {
		return null;
	}
	return {
		id: row.id,
		role: row.role,
		parts,
	};
}

export function buildUIMessages(rows: ChatMessage[]): UIMessage[] {
	return rows
		.map(chatRowToUIMessage)
		.filter((m): m is UIMessage => m !== null);
}

export function textUIMessage(text: string): UIMessage["parts"] {
	return [{ type: "text", text }];
}