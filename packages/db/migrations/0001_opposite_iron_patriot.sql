ALTER TYPE "public"."die_symbol" ADD VALUE 'draw' BEFORE 'focus';--> statement-breakpoint
ALTER TYPE "public"."die_symbol" ADD VALUE 'modifier' BEFORE 'blank';--> statement-breakpoint
CREATE TABLE "game_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"sequence_number" integer NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_ids" text[] NOT NULL,
	"winner_id" text,
	"duration_ms" integer,
	"seed" text NOT NULL,
	"summary" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_events_session_seq_idx" ON "game_events" USING btree ("session_id","sequence_number");