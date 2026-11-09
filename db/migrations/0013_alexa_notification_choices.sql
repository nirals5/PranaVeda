CREATE TABLE "alexa_notification_choices" (
	"alexa_user_id" text PRIMARY KEY NOT NULL,
	"notifications" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
