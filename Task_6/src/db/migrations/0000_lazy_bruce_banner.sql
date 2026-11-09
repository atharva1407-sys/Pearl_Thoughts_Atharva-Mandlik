CREATE TABLE "appointments" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"doctor_id" text NOT NULL,
	"appointment_date" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"status" text DEFAULT 'BOOKED' NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availabilities" (
	"id" text PRIMARY KEY NOT NULL,
	"doctor_id" text NOT NULL,
	"day_of_week" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"slot_duration_minutes" integer DEFAULT 30 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctors" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"specialization" text NOT NULL,
	"phone" text NOT NULL,
	"license_number" text NOT NULL,
	"experience_years" integer NOT NULL,
	"consultation_fee" numeric NOT NULL,
	"bio" text,
	CONSTRAINT "doctors_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "doctors_license_number_unique" UNIQUE("license_number")
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text NOT NULL,
	"date_of_birth" text,
	"gender" text,
	"address" text,
	CONSTRAINT "patients_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "doctor_slot_active_unique" ON "appointments" USING btree ("doctor_id","appointment_date","start_time") WHERE "appointments"."status" != 'CANCELLED';--> statement-breakpoint
CREATE INDEX "appointment_patient_idx" ON "appointments" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "appointment_doctor_idx" ON "appointments" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "appointment_date_idx" ON "appointments" USING btree ("appointment_date");--> statement-breakpoint
CREATE UNIQUE INDEX "doctor_day_unique" ON "availabilities" USING btree ("doctor_id","day_of_week");