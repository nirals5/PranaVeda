CREATE TABLE "push_nudge_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"busy" jsonb,
	"trusted" boolean DEFAULT false NOT NULL,
	"google" boolean DEFAULT false NOT NULL,
	"uploaded_at" timestamp with time zone,
	"covered_until" timestamp with time zone,
	"seen_at" timestamp with time zone,
	"last_slot_key" text,
	"last_notified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_nudge_state" ADD CONSTRAINT "push_nudge_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");