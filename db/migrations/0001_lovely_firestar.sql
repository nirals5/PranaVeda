CREATE TABLE "sessions" (
	"family_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"client" text NOT NULL,
	"device_class" text,
	"os" text,
	"os_version" text,
	"browser" text,
	"device_model" text,
	"app_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");