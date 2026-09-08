import { createDefaultRegistry, runAgent } from "@aevryn/agent";
import { env } from "@aevryn/env/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";

const runObjectiveSchema = z.object({
	objective: z.string().min(1).max(2000),
});

export const agentRouter = router({
	runObjective: protectedProcedure
		.input(runObjectiveSchema)
		.mutation(async ({ input }) => {
			if (!env.GROQ_API_KEY) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "GROQ_API_KEY is not configured",
				});
			}
			if (!env.ANAKIN_API_KEY) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "ANAKIN_API_KEY is not configured",
				});
			}
			return runAgent({
				registry: createDefaultRegistry(),
				objective: input.objective,
			});
		}),
});
