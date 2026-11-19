CREATE TABLE "doctor_receptionists" (
	"id" text PRIMARY KEY NOT NULL,
	"doctor_id" text NOT NULL,
	"receptionist_id" text NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receptionists" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text NOT NULL,
	"created_by_doctor_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doctor_receptionists" ADD CONSTRAINT "doctor_receptionists_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_receptionists" ADD CONSTRAINT "doctor_receptionists_receptionist_id_receptionists_id_fk" FOREIGN KEY ("receptionist_id") REFERENCES "public"."receptionists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receptionists" ADD CONSTRAINT "receptionists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receptionists" ADD CONSTRAINT "receptionists_created_by_doctor_id_doctors_id_fk" FOREIGN KEY ("created_by_doctor_id") REFERENCES "public"."doctors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "doctor_receptionists_unique" ON "doctor_receptionists" USING btree ("doctor_id","receptionist_id");--> statement-breakpoint
CREATE INDEX "doctor_receptionists_receptionist_idx" ON "doctor_receptionists" USING btree ("receptionist_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receptionists_user_unique" ON "receptionists" USING btree ("user_id");