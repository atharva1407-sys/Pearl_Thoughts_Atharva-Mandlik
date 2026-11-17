# Run and test Task 6 locally: complete guide

Everything below uses Windows PowerShell. Replace paths if yours differ.

## 0. What you need

- Node.js 20 or newer (`node -v` to check) and npm.
- A browser.
- Optional, for the "full" setup: a Neon database branch, Razorpay test keys, a Brevo key and a Sarvam key.

## 1. Quick start (5 minutes, no accounts needed)

This runs the whole app on seeded **in-memory** data. Nothing is saved after you stop the server.

```powershell
cd C:\Users\Admin\Downloads\Pearl_Thoughts_Atharva-Mandlik\Task_6
npm install
```

Create a file named `.env.local` in the `Task_6` folder with exactly this (change the key line if you have one):

```
DATABASE_URL=disabled-for-local-test
USE_MOCK_PAYMENTS=true
SESSION_SECRET=any-long-random-text-at-least-32-characters-long
CRON_SECRET=local-cron-secret
APP_URL=http://localhost:3000
ADMIN_EMAILS=admin.test@example.com
SARVAM_API_KEY=
```

Start the app:

```powershell
npm run dev
```

Open http://localhost:3000. Stop it with `Ctrl + C`.

- Emails are **printed in the terminal** (look for `[NOTIFICATION OUTBOX - CONSOLE]`) instead of being sent.
- Payments use a built-in **mock gateway** with a "Simulate Successful Payment" button.
- The assistant says "not set up" until you set `SARVAM_API_KEY`. Everything else works.
- Restarting the server resets all data. Sign up again each time.

> Never paste real keys into chat or commit `.env.local`. It is git-ignored.

## 2. Full setup (real database, real emails, real AI)

Only needed if you want data to survive restarts or to see real email and AI behaviour.

| Want | Add to `.env.local` | Notes |
|---|---|---|
| Real database | `DATABASE_URL=` the connection string of a **Neon test branch** | Never use your `production` branch for testing. After setting it run the migrations below. |
| Real emails | `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY=`, `EMAIL_FROM=Medrella Healthcare <your-verified-sender>` | Check spam. The sender must be verified in Brevo. |
| Real AI assistant | `SARVAM_API_KEY=` your key | Optional: `SARVAM_MODEL=sarvam-105b-conversations` |
| Razorpay test payments | `RAZORPAY_KEY_ID=`, `RAZORPAY_KEY_SECRET=`, `RAZORPAY_WEBHOOK_SECRET=` and **remove** `USE_MOCK_PAYMENTS` | Test card from the Razorpay dashboard. |

Apply the database changes once per database (each is additive and safe to repeat; there are now four: 0003 to 0006):

```powershell
$env:DATABASE_URL = "PASTE_YOUR_NEON_TEST_BRANCH_STRING"
npm run db:migrate-0003
npm run db:migrate-0004
npm run db:migrate-0005
npm run db:migrate-0006
```

Restart `npm run dev` after any change to `.env.local`.

## 3. Automated checks (run these first)

```powershell
npm test
npm run lint
npm run build
```

`npm test` runs seven suites and needs no internet or keys. Expect: 115, 72, 81, 31, 104, 4 and 114 checks passing, no failures. The timezone suite re-runs the booking, cancel and refund rules with the server clock set to four different timezones; the last suite checks one-date, monthly and date-range sessions and Stream capacity, also under three timezones.

## 4. Manual test script

Use two browser windows (or one normal and one private) so you can be a patient and a doctor at the same time.

### A. Patient basics
1. Go to `/signup`, choose **Patient Portal**, fill the form and tick the terms. You land on the patient dashboard.
   - Expect a **welcome email** in the terminal (or your inbox).
2. Open **Find Specialists**, pick a doctor, choose tomorrow and any slot, type a reason, press **Pay ₹… & Book**.
   - A checkout popup opens with a 10-minute hold timer. Press **Simulate Successful Payment**.
   - Expect booking and payment emails and a confirmed appointment on the dashboard. **Payments & Receipts** shows the receipt.
3. On the dashboard press **Reschedule**, pick another slot, confirm. Expect a rescheduled email.
4. Press **Cancel**. The popup shows the refund amount first (100% when 24 hours or more ahead). Confirm. Expect cancellation and refund emails.
5. **Notification Settings**: promotional email is off by default. Toggle it, save, reload.

### B. Doctor
1. In the second window sign up as **Doctor Portal**.
2. **Weekly Shifts**: press **Add OPD Session**, fill the popup, create. Try Stream and Wave.
3. As a patient, book a slot with that doctor. As the doctor, the booking appears on **Doctor Agenda**.
4. **Scheduling options** (new doctors start with a 09:00–17:00 weekly session Monday to Friday; weekends are switched off):
   - Press **Add One-Date Session**, pick a Sunday, 14:00–16:00, Stream, **Patients per slot = 2**. As a patient, open that doctor and that date: four slots with "2 seats"; the same Sunday a week later shows nothing. Book the same slot with two patients; a third is refused.
   - Pick a weekday that already has the 09:00–17:00 session and overlapping hours: the form refuses it with an "overlaps" message.
   - Press **Add Monthly Session**, date of month 15, runs from the 1st of this month to the end of next month: it appears on the 15th of each month in that range only.
   - In the one-date form, add two more dates under "Same session on more dates" and tick "One slot for the whole session" with 10:00–14:00 and 3 patients per slot: three sessions are created; a patient sees one 10:00 slot with 3 seats, and the fourth booking is refused.
   - Edit a weekly session and set "Runs until" to a date two weeks away: slots disappear after that date.

### C. Admin page
1. Sign up a patient using the email in `ADMIN_EMAILS` (default `admin.test@example.com`).
2. Open `/admin/notifications`: counts, failed messages and a retry button. Any other user gets a 404.

### D. The assistant (needs `SARVAM_API_KEY`)
Click the round assistant button at the bottom right of **My Appointments** (patient) or the **Doctor dashboard** (doctor). Run `npm run db:migrate-0007` first when using a real database.

**Patient**: check the result of each message.

| Type | Expected |
|---|---|
| `Find a cardiologist` | Names the real cardiologist, fee and experience |
| `Book Dr. <name> tomorrow around 10:00` | A **Confirm booking** card. Nothing is booked yet. Press **Confirm booking**: a free visit is booked at once; a paid visit shows a **Pay** card (use **Pay (test)** locally, or **Simulate failure** to see a failed payment keep the seat held). |
| A taken slot (fill it from another account first) | The assistant offers the nearest open times as tappable chips |
| `Cancel my appointment with Dr. <name>` | A red cancel card that shows the **refund amount first**. **Not now** changes nothing. |
| `Move my appointment to <date> at <time>` | A reschedule card; Confirm moves it |
| `Show my payments and refunds` / `Show my prescriptions` | Only your own records |
| `मुझे त्वचा रोग विशेषज्ञ चाहिए` / `Kal ke liye cardiologist ka slot dikhao` | Reply in Hindi / Hinglish |
| `What medicine should I take for fever?` | Refuses and offers to book a doctor |
| `I have severe chest pain` | Instant emergency message (call 112). The AI is not used. |

**Doctor**: try `What is on my schedule today?`, `Show my appointment stats this month`, `Any scheduling conflicts this week?`, `When is my next free slot?`, `Suggest a new slot for <patient>'s appointment`. The doctor assistant only reads and suggests; it never changes appointments.

**Voice** (Chrome, Edge or Safari with microphone access): tap the **mic** for one voice message, or the **waveform** button for a hands-free conversation. Talk over the assistant, or press **Stop**, to interrupt it. Closing the chat releases the microphone.

**Prescriptions:** as a doctor, mark a visit **Done**, then use **Prescription** in *Completed Consultations*; the patient sees it at `/patient/prescriptions`.

Rules to confirm: the assistant never books, cancels, moves or pays without a Confirm press, a confirmation older than 5 minutes is refused, and more than 20 messages in 10 minutes shows a "too quickly" message.

### E. Reminders and follow-ups
With the server running, call the jobs by hand:

```powershell
curl.exe -H "Authorization: Bearer local-cron-secret" http://localhost:3000/api/cron/notifications
curl.exe -H "Authorization: Bearer local-cron-secret" http://localhost:3000/api/cron/engagement
```

- The first sends due emails and reminders (reminders go out 24 hours and 2 hours before a visit).
- The second queues follow-ups (a visit completed 1 to 3 days ago) and, for patients who opted in, check-up and re-engagement messages. Locally you cannot easily create visits that old, so this part is proven by `npm test`.
- Without the correct header both return 401.

## 5. If something goes wrong

| Problem | Fix |
|---|---|
| `Another next dev server is already running` or port busy | Close the other terminal running `npm run dev`, or run `npm run dev -- -p 3100` and open that port |
| Page looks blank for a moment on first open | Normal while Next compiles. Wait a few seconds. |
| Assistant says "not set up" | `SARVAM_API_KEY` is empty. Add it and restart. |
| Assistant says it is having trouble | Key invalid, no internet, or Sarvam is down. The rest of the app still works. |
| Changed `.env.local` but nothing changed | Stop and restart `npm run dev` |
| Emails never arrive | Without Brevo they only print in the terminal. With Brevo check spam and that `EMAIL_FROM` is your verified sender. |
| Database errors after pointing at Neon | Run the `db:migrate-0003` to `db:migrate-0006` commands against that branch |
| Login says invalid for a seeded doctor | Register your own doctor account instead |
| Everything vanished | You are in quick-start mode (in-memory). Restart resets data. |

## 6. Before you share or deploy

Run section 3 once more, then deploy in this order: apply `npm run db:migrate-0005` and `npm run db:migrate-0006` to the live database first, then add the environment variables in Vercel, then deploy. The full checklist is in `README.md` and `CHANGES.md`.
