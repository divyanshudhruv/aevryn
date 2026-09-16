DROP INDEX "messages_client_message_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "messages_client_message_id_idx" ON "messages" USING btree ("thread_id","user_id","client_message_id");