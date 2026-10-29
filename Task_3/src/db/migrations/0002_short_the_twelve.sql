CREATE TABLE "doctor_leaves" (
	"id" text PRIMARY KEY NOT NULL,
	"doctor_id" text NOT NULL,
	"leave_date" text NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doctors" DROP CONSTRAINT "doctors_user_id_unique";--> statement-breakpoint
ALTER TABLE "doctors" DROP CONSTRAINT "doctors_license_number_unique";--> statement-breakpoint
ALTER TABLE "patients" DROP CONSTRAINT "patients_user_id_unique";--> statement-breakpoint
DROP INDEX "doctor_slot_active_unique";--> statement-breakpoint
DROP INDEX "doctor_day_unique";--> statement-breakpoint
ALTER TABLE "doctors" ALTER COLUMN "license_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "doctors" ALTER COLUMN "experience_years" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "doctors" ALTER COLUMN "experience_years" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "doctors" ALTER COLUMN "consultation_fee" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "doctors" ALTER COLUMN "consultation_fee" SET DEFAULT 500;--> statement-breakpoint
ALTER TABLE "doctors" ALTER COLUMN "consultation_fee" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "token_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "rescheduled_at" timestamp;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "rescheduled_by" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "original_appointment_date" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "original_start_time" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "original_end_time" text;--> statement-breakpoint
ALTER TABLE "availabilities" ADD COLUMN "name" text DEFAULT 'OPD Session' NOT NULL;--> statement-breakpoint
ALTER TABLE "availabilities" ADD COLUMN "scheduling_type" text DEFAULT 'STREAM' NOT NULL;--> statement-breakpoint
ALTER TABLE "availabilities" ADD COLUMN "patients_per_wave" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "doctors" ADD COLUMN "profile_image" text;--> statement-breakpoint
ALTER TABLE "doctor_leaves" ADD CONSTRAINT "doctor_leaves_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "doctor_leave_unique" ON "doctor_leaves" USING btree ("doctor_id","leave_date");--> statement-breakpoint
CREATE INDEX "doctor_leave_doc_idx" ON "doctor_leaves" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "doctor_leave_date_idx" ON "doctor_leaves" USING btree ("leave_date");--> statement-breakpoint
CREATE INDEX "appointment_doctor_slot_idx" ON "appointments" USING btree ("doctor_id","appointment_date","start_time");--> statement-breakpoint
CREATE INDEX "availability_doctor_idx" ON "availabilities" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "availability_day_idx" ON "availabilities" USING btree ("day_of_week");