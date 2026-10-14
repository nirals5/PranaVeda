CREATE TABLE "practice_log_entries" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_id" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"local_date" text NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practice_log_entries" ADD CONSTRAINT "practice_log_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "practice_log_entries_user_entry_key" ON "practice_log_entries" USING btree ("user_id","entry_id");--> statement-breakpoint
CREATE INDEX "practice_log_entries_user_seq_idx" ON "practice_log_entries" USING btree ("user_id","seq");