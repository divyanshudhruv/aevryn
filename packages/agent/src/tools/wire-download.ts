import { tool } from "ai";
import { z } from "zod";

import { toolContextSchema, type ToolContext } from "./context";
import type { WireFile } from "./wire-action";

const inputSchema = z.object({
	jobId: z
		.string()
		.min(1)
		.describe("The Wire job id whose result contains files (from wireAction's files manifest)."),
	file: z
		.string()
		.optional()
		.describe("For multi-file results, the file name from the manifest. Omit for the primary file."),
});

export const wireDownloadTool = tool({
	description:
		"Get download link for a Wire action file (PDF, CSV, …). Needs API key. Call after wireAction returns a files manifest. Returns proxy URL streaming the bytes.",
	inputSchema,
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<
		| {
				ok: true;
				downloadUrl: string;
				file?: string;
				hint: string;
		  }
		| {
				ok: false;
				error: { code: string; message: string };
		  }
	> => {
		if (!context.anakinKey) {
			return {
				ok: false,
				error: {
					code: "ANAKIN_KEY_REQUIRED",
					message:
						"Downloading Wire files needs your Anakin API key (Settings → BYOK).",
				},
			};
		}
		const params = new URLSearchParams();
		if (input.file) params.set("file", input.file);
		const query = params.toString();
		const downloadUrl = `/api/anakin/wire-download/${encodeURIComponent(input.jobId)}${query ? `?${query}` : ""}`;
		return {
			ok: true,
			downloadUrl,
			file: input.file,
			hint: `Fetch downloadUrl (or give it to the user) to download${input.file ? ` ${input.file}` : " the file"}. The route streams the bytes with the file's Content-Type.`,
		} satisfies {
			ok: true;
			downloadUrl: string;
			file?: string;
			hint: string;
		};
	},
});

export type { WireFile };
