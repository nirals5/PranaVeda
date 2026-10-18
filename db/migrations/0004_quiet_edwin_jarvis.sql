CREATE TABLE "saved_rituals" (
	"user_id" uuid NOT NULL,
	"ritual_id" text NOT NULL,
	"data" jsonb,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "saved_rituals" ADD CONSTRAINT "saved_rituals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_rituals_user_ritual_key" ON "saved_rituals" USING btree ("user_id","ritual_id");