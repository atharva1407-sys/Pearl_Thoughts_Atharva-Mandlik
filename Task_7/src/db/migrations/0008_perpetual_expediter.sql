ALTER TABLE "appointments" ADD COLUMN "checked_in_at" timestamp;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "checked_in_by" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "consultation_started_at" timestamp;--> statement-breakpoint
CREATE INDEX "appointment_checkin_idx" ON "appointments" USING btree ("doctor_id","appointment_date","checked_in_at");