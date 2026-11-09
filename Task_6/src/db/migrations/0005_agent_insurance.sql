CREATE TABLE "agent_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"tool" text,
	"detail" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"appointment_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"preauth_id" text,
	"amount_paise" integer NOT NULL,
	"settled_amount_paise" integer,
	"status" text DEFAULT 'SUBMITTED' NOT NULL,
	"provider_reference" text,
	"status_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurance_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"insurer_name" text NOT NULL,
	"policy_number" text NOT NULL,
	"sum_insured_paise" integer DEFAULT 0 NOT NULL,
	"copay_percent" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	"verified_at" timestamp,
	"provider_reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preauth_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"appointment_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"estimated_amount_paise" integer NOT NULL,
	"approved_amount_paise" integer,
	"status" text DEFAULT 'REQUESTED' NOT NULL,
	"provider_reference" text,
	"status_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_policy_id_insurance_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."insurance_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_preauth_id_preauth_requests_id_fk" FOREIGN KEY ("preauth_id") REFERENCES "public"."preauth_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preauth_requests" ADD CONSTRAINT "preauth_requests_policy_id_insurance_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."insurance_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preauth_requests" ADD CONSTRAINT "preauth_requests_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preauth_requests" ADD CONSTRAINT "preauth_requests_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_events_user_idx" ON "agent_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "claims_appointment_idx" ON "claims" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "claims_patient_idx" ON "claims" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "insurance_policies_patient_policy_idx" ON "insurance_policies" USING btree ("patient_id","policy_number");--> statement-breakpoint
CREATE INDEX "insurance_policies_patient_idx" ON "insurance_policies" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "preauth_requests_appointment_idx" ON "preauth_requests" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "preauth_requests_patient_idx" ON "preauth_requests" USING btree ("patient_id");