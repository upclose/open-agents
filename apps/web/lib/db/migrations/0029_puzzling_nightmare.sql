CREATE TABLE "automation_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"automation_id" text NOT NULL,
	"provider" text NOT NULL,
	"connection_ref" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"automation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text,
	"chat_id" text,
	"workflow_run_id" text,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"triggered_at" timestamp NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"result_summary" text,
	"pr_number" integer,
	"pr_url" text,
	"compare_url" text,
	"error" text,
	"needs_attention_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_tools" (
	"id" text PRIMARY KEY NOT NULL,
	"automation_id" text NOT NULL,
	"tool_type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_triggers" (
	"id" text PRIMARY KEY NOT NULL,
	"automation_id" text NOT NULL,
	"type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"instructions" text NOT NULL,
	"repo_owner" text NOT NULL,
	"repo_name" text NOT NULL,
	"clone_url" text,
	"base_branch" text NOT NULL,
	"model_id" text DEFAULT 'anthropic/claude-haiku-4.5' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"execution_environment" text DEFAULT 'vercel' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"global_skill_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"scheduler_run_id" text,
	"scheduler_state" text DEFAULT 'idle' NOT NULL,
	"last_run_status" text,
	"last_run_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "automation_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "run_source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_connections" ADD CONSTRAINT "automation_connections_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_tools" ADD CONSTRAINT "automation_tools_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_triggers" ADD CONSTRAINT "automation_triggers_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_connections_automation_id_idx" ON "automation_connections" USING btree ("automation_id");--> statement-breakpoint
CREATE INDEX "automation_runs_automation_id_idx" ON "automation_runs" USING btree ("automation_id");--> statement-breakpoint
CREATE INDEX "automation_runs_user_id_idx" ON "automation_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "automation_runs_session_id_idx" ON "automation_runs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "automation_tools_automation_id_idx" ON "automation_tools" USING btree ("automation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_tools_automation_tool_type_idx" ON "automation_tools" USING btree ("automation_id","tool_type");--> statement-breakpoint
CREATE INDEX "automation_triggers_automation_id_idx" ON "automation_triggers" USING btree ("automation_id");--> statement-breakpoint
CREATE INDEX "automations_user_id_idx" ON "automations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "automations_next_run_at_idx" ON "automations" USING btree ("next_run_at");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_automation_id_idx" ON "sessions" USING btree ("automation_id");