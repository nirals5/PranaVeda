CREATE TABLE "usage_events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"install_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"app_version" text NOT NULL,
	"name" text NOT NULL,
	"signed_in" boolean NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "usage_events_occurred_at_idx" ON "usage_events" USING btree ("occurred_at");