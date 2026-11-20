CREATE TABLE "patient_medical_history_log" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"version" integer NOT NULL,
	"changes" jsonb NOT NULL,
	"change_note" text,
	"changed_by_user_id" text NOT NULL,
	"changed_by_role" text NOT NULL,
	"changed_by_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_medical_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"blood_group" text,
	"height_cm" integer,
	"weight_kg" integer,
	"allergies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_medications" text,
	"past_surgeries" text,
	"family_history" text,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" text,
	"updated_by_role" text,
	"updated_by_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visit_records" (
	"id" text PRIMARY KEY NOT NULL,
	"appointment_id" text NOT NULL,
	"doctor_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"diagnosis" text NOT NULL,
	"symptoms" text,
	"notes" text,
	"follow_up" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_medical_history_log" ADD CONSTRAINT "patient_medical_history_log_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_medical_profiles" ADD CONSTRAINT "patient_medical_profiles_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_records" ADD CONSTRAINT "visit_records_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_records" ADD CONSTRAINT "visit_records_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_records" ADD CONSTRAINT "visit_records_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "patient_medical_history_log_version_unique" ON "patient_medical_history_log" USING btree ("patient_id","version");--> statement-breakpoint
CREATE INDEX "patient_medical_history_log_patient_idx" ON "patient_medical_history_log" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_medical_profiles_patient_unique" ON "patient_medical_profiles" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "visit_records_appointment_unique" ON "visit_records" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "visit_records_patient_idx" ON "visit_records" USING btree ("patient_id");