import { protectedProcedure, publicProcedure, router } from "../index";
import { agentRouter } from "./agent";

export const appRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	privateData: protectedProcedure.query(({ ctx }) => {
		return {
			message: "This is private",
			user: ctx.session.user,
		};
	}),
	agent: agentRouter,
});
export type AppRouter = typeof appRouter;
