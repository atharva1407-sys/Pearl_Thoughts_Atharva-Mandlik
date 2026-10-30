# Task 3: Application Demo, Feedback & Improvements

Task 3 builds on the Medrella app from [`Task_2`](../Task_2). This folder is the **complete, runnable app** with all Task 3 work included: Task 2's code plus the changes listed below. [Files](#files) shows exactly which files Task 3 added, changed or removed compared with `Task_2`.

## Assignment
- Act on the review feedback: stream & wave scheduling, appointment rescheduling for doctors and patients, and doctor sessions shown in the patient portal.
- Explore Medrella and similar platforms and implement useful improvements.
- Keep existing features working and the app accessible through the deployed URL.

## What changed

### Security fixes from the Task 2 deployment review
- Doctors see only their own patients and appointments in the queue and reports; prototype pages (reception, encounters, schedule) removed.
- Sessions are checked against the database on every request; deleted or inactive accounts are signed out.
- Account deletion requires the password, runs in one transaction, and is blocked for doctors with upcoming bookings.
- Login rate limiting (5 failed attempts per 15 minutes), one generic error message, open-redirect guard, 8+ character passwords.
- HTTP security headers, `robots.txt`, favicon, branded 404, Terms and Privacy pages.

### Doctor sessions, stream & wave scheduling
- Doctors manage several named sessions per day (e.g. Morning OPD, Evening OPD) on **Weekly Shifts** (`/doctor/availability`); overlapping sessions are rejected.
- Each session is **Stream** (one patient per slot) or **Wave** (N patients per wave).
- Patients see the doctor's sessions grouped on the booking page, with seats left for wave slots.
- Every booking gets a token number per session and date (never reused after a cancellation).
- Bookings and reschedules take a per-doctor, per-date database lock, so concurrent requests can't overfill a slot.

### Rescheduling, leave and no-shows
- Patients and doctors can reschedule a booked appointment; the server applies the same rules as a new booking (date window, leave, session, alignment, notice) and keeps the original time.
- Doctors can block leave dates (future dates only, and only when no patients are booked that day); doctors can mark no-shows.
- Booking rules: up to 30 days ahead, at least 15 minutes' notice, and one active booking per patient per doctor per day.
- Appointments can be marked completed or no-show only once their start time has arrived.

### Landing page
- Public landing page at `/`, wired to live data: departments and doctor cards come from the database, with each doctor's real next open slot.
- The 8 founding doctors are seeded with photos and weekly sessions (`npm run db:seed`).
- Header adapts for signed-in users ("My Dashboard").

### Navigation
- Loading states for every page, so navigation responds instantly and Next.js can prefetch routes.
- Login, signup and sign-in prompts navigate inside the app instead of reloading the page; pages fade in on navigation.

## Run the Task 3 app
Inside this `Task_3` folder:
```bash
npm install
```
```bash
npm run db:push
```
```bash
npm run db:seed
```
```bash
npm run dev
```
`.env.local` needs `DATABASE_URL`, `SESSION_SECRET` and, for the seed, `SEED_DOCTOR_PASSWORD` (see `.env.example`). `npm test` runs the automated checks.

## Files
Compared with [`Task_2`](../Task_2). Every other file in this folder is unchanged from Task 2.

### Added (41)
- `public/favicon.ico`, `public/robots.txt`
- `public/images/hero-doctor.webp`, `public/images/hospital-hero.png`, `public/images/doctors/*.jpg` (8 doctor photos)
- Landing: `src/components/landing/contact.ts`, `logo.tsx`, `site-header.tsx`
- Sessions & rescheduling: `src/app/doctor/availability/sessions-client.tsx`, `src/app/patient/dashboard/patient-appointment-actions.tsx`, `src/components/reschedule-modal.tsx`, `src/lib/booking-rules.ts`
- Seeding: `src/db/seed-specialists.ts`
- Migrations: `src/db/migrations/0001_happy_bill_hollister.sql`, `0002_short_the_twelve.sql`, `meta/0001_snapshot.json`, `meta/0002_snapshot.json`
- Pages: `src/app/not-found.tsx`, `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, `src/app/template.tsx`
- Loading states: `src/components/page-skeleton.tsx`, `loading.tsx` in `src/app`, `doctors`, `doctors/[id]`, `doctor/availability`, `doctor/dashboard`, `patient/dashboard`, `queue`, `reports`, `settings`, `login`, `signup`, `register`

### Modified (29)
`.env.example`, `README.md`, `next.config.ts`, `src/actions/appointments.ts`, `src/actions/auth.ts`, `src/actions/availability.ts`, `src/actions/seed.ts`, `src/app/doctor/availability/page.tsx`, `src/app/doctor/dashboard/doctor-appointment-actions.tsx`, `src/app/doctor/dashboard/page.tsx`, `src/app/doctors/[id]/page.tsx`, `src/app/doctors/page.tsx`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/patient/dashboard/page.tsx`, `src/app/queue/page.tsx`, `src/app/reports/page.tsx`, `src/components/auth-page.tsx`, `src/components/clinical-shell.tsx`, `src/components/footer.tsx`, `src/components/slot-picker.tsx`, `src/db/migrations/meta/_journal.json`, `src/db/repo.ts`, `src/db/schema.ts`, `src/db/seed.ts`, `src/db/specialists-catalog.ts`, `src/lib/validators.ts`, `src/test-suite.ts`

### Removed (6)
`src/app/encounters/page.tsx`, `src/app/encounters/encounters-client.tsx`, `src/app/reception/page.tsx`, `src/app/reception/reception-client.tsx`, `src/app/schedule/page.tsx`, `src/app/schedule/schedule-client.tsx`

## Commit history (Task 3)
| Commit | Change |
|---|---|
| `5829946` | Scope queue and reports to the signed-in doctor; remove prototype routes |
| `8619c13` | Live session validation; password-confirmed atomic account deletion |
| `5488570` | Login rate limiting, generic errors, open-redirect guard, 8+ char passwords |
| `69b403a` | Security headers, robots.txt, favicon, 404, Terms/Privacy pages |
| `8da890f` | Doctor sessions, wave capacity booking with tokens, rescheduling, leave |
| `8de8487` | Landing page wired to live doctors, departments and availability |
| `266315b` | Reschedule validation, unique tokens, per-day booking lock, session ownership |
| `700a025` | Founding doctors listed in the landing design order |
| `be90f7e` | Smooth page transitions |

## UI components (shadcn/ui)

Interactive UI now uses shadcn/ui components instead of plain HTML elements: `Button`, `Input`, `Textarea`, `Label`, `Select`, `Checkbox`, `Switch`, `Tabs`, `Card`, `Badge`, `Table` and `Dialog` (modals). They live in `src/components/ui/` (configured by `components.json`) and are built on Radix UI, `class-variance-authority` and the existing `cn()` helper. Theme tokens map to the existing design colours in `globals.css`, so the look is unchanged. Add more components with `npx shadcn@latest add <name>`.
