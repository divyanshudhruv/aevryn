CREATE TABLE "tool_call_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"step_id" text,
	"user_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"tool_call_id" text NOT NULL,
	"direction" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" jsonb,
	"status" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"duration_ms" integer,
	"tokens" jsonb,
	"chain_stack" jsonb
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tool_call_logs_message_tool_call_id_unique" ON "tool_call_logs" USING btree ("message_id","tool_call_id");--> statement-breakpoint
CREATE INDEX "tool_call_logs_thread_started_at_index" ON "tool_call_logs" USING btree ("thread_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "steps_message_position_unique" ON "steps" USING btree ("message_id","position");