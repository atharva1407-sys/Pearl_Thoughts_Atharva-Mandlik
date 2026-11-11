# Medrella Healthcare Agent — Live Demo Guide (about 8 minutes)

## Before you present

1. Make sure nothing else is using port 3000, then start the app:
   ```bash
   cd C:\Users\Admin\Downloads\Pearl_Thoughts_Atharva-Mandlik\Task_6
   npm run dev
   ```
2. Open http://localhost:3000. Everything runs offline: in-memory data, mock payments. Only the AI assistant calls the internet (Sarvam).
3. **Logins** (passwords are in `.env.local`, never in this file):
   | Who | Email | Password variable |
   |---|---|---|
   | Patient (main demo) | `priya.demo@medrella.demo` | `DEMO_PATIENT_PASSWORD` |
   | Doctor | `rohan.mehta@medrella.com` (any doctor in `src/db/specialists-catalog.ts`) | `SEED_DOCTOR_PASSWORD` |
4. Priya starts with one completed visit 2 days ago. Priya can also open the admin outbox because her email is in `ADMIN_EMAILS`.
5. **To reset the demo to a clean state, stop the server and run `npm run dev` again** (data lives in memory).

## Demo script

### 1. The assistant (Sarvam AI with tools) — `/patient/assistant`
Log in as Priya, then open **Assistant** in the sidebar. Say:
- "Find a cardiologist" → real doctors and fees come from the database through a tool, not from the model's memory.
- "Show open slots for Dr. Rohan Mehta tomorrow and book the first one" → a **booking card** appears. *Point out: the agent cannot book or take payment itself.*
- Click **Review & book** → the booking page opens with the slot pre-selected → **Pay** → **Simulate Successful Payment**. Token and receipt appear.
- Hindi: "मुझे कल कार्डियोलॉजिस्ट डॉक्टर से मिलना है, कौन से समय खाली हैं?" → native Hindi reply with real slots. Marathi works the same way.
- Safety: "mujhe seene mein dard ho raha hai" or "I have chest pain" → fixed 112 emergency guidance, **the model is never called**.
- "Which medicine should I take for fever?" → refuses and offers to book a doctor.

### 2. Proactive engagement + the bell inbox
- In a second terminal (use your `CRON_SECRET` from `.env.local`):
  ```bash
  curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/engagement
  ```
  The JSON shows `followUpsQueued: 1`.
- Back in the app click the **bell** icon: Priya's follow-up email, booking confirmation and receipt are listed. The server terminal also prints each email (`[NOTIFICATION OUTBOX - CONSOLE]`).
- Promotional messages (such as the check-up reminder) are sent only to people who opted in (Settings page).
- `/admin/notifications` (Priya) shows outbox health: sent, pending, failed, dead-letter retry.

### 3. Cancel and refund (optional)
Dashboard → Cancel the new appointment → the refund amount is shown before you confirm.

## If something goes wrong
| Symptom | Fix |
|---|---|
| Assistant says "not set up" or "trouble right now" | Check `SARVAM_API_KEY` in `.env.local` and the internet connection; restart `npm run dev`. |
| Doctors or slots are empty | `ENABLE_SEED_DATA="true"` must be set in `.env.local`; restart. |
| Port 3000 busy | Stop the other `next dev`, or open the URL the terminal prints. |
| Emails do not arrive in a real inbox | Expected: demo emails print to the terminal and the bell inbox (Brevo is switched off for the demo). |

## Honest limits to mention
- The assistant is not a clinician: no diagnosis, no medicine advice.
- Rate limiting is per server instance and the demo database is in memory.
