CREATE TABLE "alexa_links" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"alexa_user_id" text NOT NULL,
	"notifications" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alexa_links" ADD CONSTRAINT "alexa_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alexa_links_alexa_user_id_key" ON "alexa_links" USING btree ("alexa_user_id");