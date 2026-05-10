CREATE TYPE "public"."card_type" AS ENUM('character', 'upgrade', 'support', 'event', 'plot', 'battlefield');--> statement-breakpoint
CREATE TYPE "public"."color" AS ENUM('red', 'blue', 'yellow', 'gray');--> statement-breakpoint
CREATE TYPE "public"."die_symbol" AS ENUM('melee', 'ranged', 'indirect', 'shield', 'resource', 'disrupt', 'discard', 'focus', 'special', 'blank');--> statement-breakpoint
CREATE TYPE "public"."faction" AS ENUM('light', 'shadow', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."rarity" AS ENUM('fixed', 'common', 'uncommon', 'rare', 'legendary');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "card_abilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" text NOT NULL,
	"ordinal" smallint NOT NULL,
	"ast" jsonb NOT NULL,
	"display_text" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_dice" (
	"card_id" text NOT NULL,
	"face_index" smallint NOT NULL,
	"symbol" "die_symbol" NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"modifier" boolean DEFAULT false NOT NULL,
	CONSTRAINT "card_dice_card_id_face_index_pk" PRIMARY KEY("card_id","face_index"),
	CONSTRAINT "card_dice_face_index_range" CHECK ("card_dice"."face_index" BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" text PRIMARY KEY NOT NULL,
	"set_code" text NOT NULL,
	"type" "card_type" NOT NULL,
	"subtypes" text[] DEFAULT '{}'::text[] NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"faction" "faction" NOT NULL,
	"color" "color" NOT NULL,
	"rarity" "rarity" NOT NULL,
	"cost" integer,
	"health" integer,
	"point_value" integer,
	"elite_point_value" integer,
	"is_unique" boolean DEFAULT false NOT NULL,
	"display_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deck_cards" (
	"deck_id" uuid NOT NULL,
	"card_id" text NOT NULL,
	"count" smallint NOT NULL,
	CONSTRAINT "deck_cards_deck_id_card_id_pk" PRIMARY KEY("deck_id","card_id"),
	CONSTRAINT "deck_cards_count_range" CHECK ("deck_cards"."count" BETWEEN 1 AND 2)
);
--> statement-breakpoint
CREATE TABLE "deck_characters" (
	"deck_id" uuid NOT NULL,
	"slot_index" smallint NOT NULL,
	"card_id" text NOT NULL,
	"elite" boolean DEFAULT false NOT NULL,
	CONSTRAINT "deck_characters_deck_id_slot_index_pk" PRIMARY KEY("deck_id","slot_index"),
	CONSTRAINT "deck_characters_slot_range" CHECK ("deck_characters"."slot_index" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"faction" "faction" NOT NULL,
	"battlefield_id" text,
	"plot_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_abilities" ADD CONSTRAINT "card_abilities_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_dice" ADD CONSTRAINT "card_dice_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_characters" ADD CONSTRAINT "deck_characters_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_characters" ADD CONSTRAINT "deck_characters_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_battlefield_id_cards_id_fk" FOREIGN KEY ("battlefield_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_plot_id_cards_id_fk" FOREIGN KEY ("plot_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_abilities_card_ordinal_idx" ON "card_abilities" USING btree ("card_id","ordinal");--> statement-breakpoint
CREATE INDEX "card_abilities_card_idx" ON "card_abilities" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "cards_set_idx" ON "cards" USING btree ("set_code");--> statement-breakpoint
CREATE INDEX "cards_type_idx" ON "cards" USING btree ("type");--> statement-breakpoint
CREATE INDEX "cards_faction_color_idx" ON "cards" USING btree ("faction","color");--> statement-breakpoint
CREATE INDEX "decks_user_idx" ON "decks" USING btree ("user_id");