CREATE TABLE "conditions" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"user_words" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_phrases" text
);
--> statement-breakpoint
CREATE TABLE "needs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"typical_signals" text,
	"effects_that_serve" text[] DEFAULT '{}'::text[] NOT NULL,
	"dosha_focus" text,
	"avoid_effects" text,
	"why_template" text
);
--> statement-breakpoint
CREATE TABLE "practice_conditions" (
	"practice_id" text NOT NULL,
	"condition_code" text NOT NULL,
	"level" text NOT NULL,
	CONSTRAINT "practice_conditions_practice_id_condition_code_pk" PRIMARY KEY("practice_id","condition_code")
);
--> statement-breakpoint
CREATE TABLE "practice_flow_members" (
	"flow_id" text NOT NULL,
	"practice_id" text NOT NULL,
	CONSTRAINT "practice_flow_members_flow_id_practice_id_pk" PRIMARY KEY("flow_id","practice_id")
);
--> statement-breakpoint
CREATE TABLE "practice_flows" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"counts" jsonb NOT NULL,
	"warnings" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_needs" (
	"practice_id" text NOT NULL,
	"need_id" text NOT NULL,
	CONSTRAINT "practice_needs_practice_id_need_id_pk" PRIMARY KEY("practice_id","need_id")
);
--> statement-breakpoint
CREATE TABLE "practice_principle_sources" (
	"principle_id" text NOT NULL,
	"source_id" text NOT NULL,
	CONSTRAINT "practice_principle_sources_principle_id_source_id_pk" PRIMARY KEY("principle_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "practice_principles" (
	"id" text PRIMARY KEY NOT NULL,
	"statement" text NOT NULL,
	"concept" text,
	"reference" text,
	"basis" text,
	"status" text NOT NULL,
	"reviewed_by" text,
	"reviewed_on" date
);
--> statement-breakpoint
CREATE TABLE "practice_rule_principles" (
	"rule_id" text NOT NULL,
	"principle_id" text NOT NULL,
	CONSTRAINT "practice_rule_principles_rule_id_principle_id_pk" PRIMARY KEY("rule_id","principle_id")
);
--> statement-breakpoint
CREATE TABLE "practice_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"when_text" text NOT NULL,
	"then_text" text NOT NULL,
	"why" text,
	"enforced_by" text,
	"basis" text,
	"status" text NOT NULL,
	"reviewed_by" text,
	"reviewed_on" date
);
--> statement-breakpoint
CREATE TABLE "practice_source_text" (
	"practice_id" text PRIMARY KEY NOT NULL,
	"level" text,
	"body_area" text,
	"time" text,
	"benefits" text,
	"target" text,
	"variations" text,
	"caution_notes" text,
	"steps" text
);
--> statement-breakpoint
CREATE TABLE "practice_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"role" text,
	"edition" text,
	"rights" text,
	"status" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "practices" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text,
	"type" text NOT NULL,
	"name_sanskrit" text NOT NULL,
	"name_english" text NOT NULL,
	"source_level" text,
	"source_body_area" text,
	"where_shown" text,
	"merged_into" text,
	"min_experience" text,
	"intensity" text,
	"settings" text[] DEFAULT '{}'::text[] NOT NULL,
	"setting_note" text,
	"duration_min" real,
	"effects" text[] DEFAULT '{}'::text[] NOT NULL,
	"vata" text,
	"pitta" text,
	"kapha" text,
	"best_times" text[] DEFAULT '{}'::text[] NOT NULL,
	"timing_note" text,
	"best_weather" text[] DEFAULT '{}'::text[] NOT NULL,
	"counter_pose_id" text,
	"avoid_notes" text,
	"avoid_weather" text[] DEFAULT '{}'::text[] NOT NULL,
	"avoid_after_meal" boolean DEFAULT false NOT NULL,
	"plain_benefit" text,
	"image" text,
	"cues" text[] DEFAULT '{}'::text[] NOT NULL,
	"common_mistakes" text[] DEFAULT '{}'::text[] NOT NULL,
	"modifications" text,
	"breath_description" text,
	"inhale_sec" integer,
	"hold_in_sec" integer,
	"exhale_sec" integer,
	"hold_out_sec" integer,
	"cycles" integer,
	"ayurvedic_note" text,
	"source_caution" text,
	"data_flag" text,
	"basis" text,
	"status" text,
	"reviewed_by" text,
	"reviewed_on" date,
	"iyengar_ref" text,
	"classical_ref" text,
	"classical_source_id" text,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "practice_conditions" ADD CONSTRAINT "practice_conditions_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_conditions" ADD CONSTRAINT "practice_conditions_condition_code_conditions_code_fk" FOREIGN KEY ("condition_code") REFERENCES "public"."conditions"("code") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "practice_flow_members" ADD CONSTRAINT "practice_flow_members_flow_id_practice_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."practice_flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_flow_members" ADD CONSTRAINT "practice_flow_members_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_needs" ADD CONSTRAINT "practice_needs_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_needs" ADD CONSTRAINT "practice_needs_need_id_needs_id_fk" FOREIGN KEY ("need_id") REFERENCES "public"."needs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_principle_sources" ADD CONSTRAINT "practice_principle_sources_principle_id_practice_principles_id_fk" FOREIGN KEY ("principle_id") REFERENCES "public"."practice_principles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_principle_sources" ADD CONSTRAINT "practice_principle_sources_source_id_practice_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."practice_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_rule_principles" ADD CONSTRAINT "practice_rule_principles_rule_id_practice_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."practice_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_rule_principles" ADD CONSTRAINT "practice_rule_principles_principle_id_practice_principles_id_fk" FOREIGN KEY ("principle_id") REFERENCES "public"."practice_principles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_source_text" ADD CONSTRAINT "practice_source_text_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practices" ADD CONSTRAINT "practices_classical_source_id_practice_sources_id_fk" FOREIGN KEY ("classical_source_id") REFERENCES "public"."practice_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "practice_conditions_condition_idx" ON "practice_conditions" USING btree ("condition_code");--> statement-breakpoint
CREATE INDEX "practice_flow_members_practice_idx" ON "practice_flow_members" USING btree ("practice_id");--> statement-breakpoint
CREATE INDEX "practice_needs_need_idx" ON "practice_needs" USING btree ("need_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practices_app_id_key" ON "practices" USING btree ("app_id");