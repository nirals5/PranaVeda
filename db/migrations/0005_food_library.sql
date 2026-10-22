CREATE TABLE "exclusion_terms" (
	"exclusion_id" text NOT NULL,
	"term" text NOT NULL,
	CONSTRAINT "exclusion_terms_exclusion_id_term_pk" PRIMARY KEY("exclusion_id","term")
);
--> statement-breakpoint
CREATE TABLE "exclusions" (
	"id" text PRIMARY KEY NOT NULL,
	"item" text NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	"applies_to" text
);
--> statement-breakpoint
CREATE TABLE "food_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"counts" jsonb NOT NULL,
	"warnings" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_ingredient_names" (
	"ingredient" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "food_ingredient_names_ingredient_name_pk" PRIMARY KEY("ingredient","name")
);
--> statement-breakpoint
CREATE TABLE "food_ingredients" (
	"name" text PRIMARY KEY NOT NULL,
	"botanical_name" text,
	"food_group" text NOT NULL,
	"kitchen" text NOT NULL,
	"sattvik" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "food_recipe_ingredients" (
	"recipe_code" text NOT NULL,
	"position" integer NOT NULL,
	"ingredient" text NOT NULL,
	"honey_swapped" boolean DEFAULT false NOT NULL,
	CONSTRAINT "food_recipe_ingredients_recipe_code_position_pk" PRIMARY KEY("recipe_code","position")
);
--> statement-breakpoint
CREATE TABLE "food_recipes" (
	"code" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"status_reason" text,
	"english_name" text NOT NULL,
	"english_name_drafted" boolean DEFAULT true NOT NULL,
	"sanskrit_name" text NOT NULL,
	"dish_type" text,
	"how_taken" text,
	"kitchen_ready" boolean,
	"potency" text,
	"ingredients_sanskrit" text,
	"classical_properties" text,
	"classical_indications" text,
	"contraindications" text,
	"classical_reference" text,
	"source_id" text,
	"source_page" integer,
	"preparation_note" text,
	"dvidal" text,
	"fermented_batter" boolean DEFAULT false NOT NULL,
	"app_candidate" boolean DEFAULT false NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "food_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"edition" text,
	"rights" text,
	"role" text
);
--> statement-breakpoint
CREATE TABLE "food_substitutions" (
	"position" integer PRIMARY KEY NOT NULL,
	"replaces" text NOT NULL,
	"exclusion_id" text,
	"swap" text NOT NULL,
	"basis" text,
	"ayurvedic_quality" text,
	"how_to_use" text,
	"role" text
);
--> statement-breakpoint
ALTER TABLE "exclusion_terms" ADD CONSTRAINT "exclusion_terms_exclusion_id_exclusions_id_fk" FOREIGN KEY ("exclusion_id") REFERENCES "public"."exclusions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_ingredient_names" ADD CONSTRAINT "food_ingredient_names_ingredient_food_ingredients_name_fk" FOREIGN KEY ("ingredient") REFERENCES "public"."food_ingredients"("name") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "food_recipe_ingredients" ADD CONSTRAINT "food_recipe_ingredients_recipe_code_food_recipes_code_fk" FOREIGN KEY ("recipe_code") REFERENCES "public"."food_recipes"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_recipe_ingredients" ADD CONSTRAINT "food_recipe_ingredients_ingredient_food_ingredients_name_fk" FOREIGN KEY ("ingredient") REFERENCES "public"."food_ingredients"("name") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "food_recipes" ADD CONSTRAINT "food_recipes_source_id_food_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."food_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_substitutions" ADD CONSTRAINT "food_substitutions_exclusion_id_exclusions_id_fk" FOREIGN KEY ("exclusion_id") REFERENCES "public"."exclusions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_ingredient_names_lower_idx" ON "food_ingredient_names" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "food_ingredients_name_lower_key" ON "food_ingredients" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "food_recipe_ingredients_ingredient_idx" ON "food_recipe_ingredients" USING btree ("ingredient");--> statement-breakpoint
CREATE INDEX "food_recipes_app_idx" ON "food_recipes" USING btree ("code") WHERE "food_recipes"."app_candidate" and "food_recipes"."retired_at" is null;