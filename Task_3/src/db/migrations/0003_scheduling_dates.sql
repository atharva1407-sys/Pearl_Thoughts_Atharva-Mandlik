ALTER TABLE "availabilities" ALTER COLUMN "day_of_week" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "availabilities" ADD COLUMN "recurrence" text DEFAULT 'WEEKLY' NOT NULL;--> statement-breakpoint
ALTER TABLE "availabilities" ADD COLUMN "day_of_month" integer;--> statement-breakpoint
ALTER TABLE "availabilities" ADD COLUMN "specific_date" text;--> statement-breakpoint
ALTER TABLE "availabilities" ADD COLUMN "valid_from" text;--> statement-breakpoint
ALTER TABLE "availabilities" ADD COLUMN "valid_until" text;