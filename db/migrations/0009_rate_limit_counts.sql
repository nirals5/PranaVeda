CREATE TABLE "rate_limit_counts" (
	"caller" text NOT NULL,
	"bucket" text NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_counts_caller_bucket_pk" PRIMARY KEY("caller","bucket")
);
--> statement-breakpoint
CREATE INDEX "rate_limit_counts_expires_idx" ON "rate_limit_counts" USING btree ("expires_at");