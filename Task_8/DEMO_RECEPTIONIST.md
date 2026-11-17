# Task 8 Walkthrough: Receptionist Front-Desk Console & Queue Unavailable/Reschedule

This guide walks through the Receptionist front-desk workflow and OPD queue management features implemented in **Task 8** for Medrella Healthcare (Ruby Hall Clinic, Pune).

---

## 1. Quick Start (Fully Offline Demo)

Run the included batch script from the `Task_8` directory:

```cmd
cd Task_8
start-demo.bat
```

Or start manually with environment variables:

```cmd
cd Task_8
set DATABASE_URL=disabled
set USE_MOCK_PAYMENTS=true
set DEMO_DATA=true
set DEMO_RECEPTION_PASSWORD=your_reception_password
set DEMO_PATIENT_PASSWORD=your_patient_password
npm run dev -- -p 3100
```

Open `http://localhost:3100` in your browser.

---

## 2. Demo Accounts & Credentials

| Role | Email Address | Password Variable | Default Landing Page |
| :--- | :--- | :--- | :--- |
| **Receptionist** | `reception.demo@medrella.demo` | `DEMO_RECEPTION_PASSWORD` | `/reception` |
| **Doctor (General Medicine)** | `ananya.sharma@medrella.com` | `SEED_DOCTOR_PASSWORD` | `/doctor/dashboard` |
| **Doctor (Cardiology)** | `rohan.mehta@medrella.com` | `SEED_DOCTOR_PASSWORD` | `/doctor/dashboard` |
| **Patient (Waiting in OPD)** | `sneha.demo@medrella.demo` | `DEMO_PATIENT_PASSWORD` | `/patient/dashboard` |
| **Patient (Arrived Late)** | `pooja.demo@medrella.demo` | `DEMO_PATIENT_PASSWORD` | `/patient/dashboard` |

---

## 3. Step-by-Step Feature Walkthrough

### Step 1: Receptionist Authentication & Shell Access
1. Navigate to `http://localhost:3100/login`.
2. Notice the role switcher now includes a **Reception** tab alongside **Patient** and **Doctor**.
3. Select **Reception**, enter `reception.demo@medrella.demo` and your `DEMO_RECEPTION_PASSWORD`.
4. Upon successful authentication, you are immediately routed to `/reception`.
5. Notice the navigation shell:
   - The top navbar and clinical sidebar display **Reception Console** and **Live Queue**.
   - Specialized doctor actions (prescriptions, clinical availability editing) and patient payment checkout are hidden from the receptionist shell.

### Step 2: Front-Desk Console (`/reception`)
1. **Live OPD Metrics**:
   - Total Bookings, Waiting Outside (with pulsing live indicator), Not Yet Arrived, In Consultation, and Completed Visits.
2. **Doctor Schedule Switcher**:
   - Filter chips display both specialists (Dr. Ananya Sharma and Dr. Rohan Mehta).
   - Each chip shows live counts of waiting vs not arrived patients and active "Serving #Token" indicator.
3. **Instant Search & Status Filtering**:
   - Search by patient name (e.g., "Sneha"), phone number (e.g., "9822033333"), or token number (e.g., "#3").
   - Filter by status tabs: *Waiting*, *Not Arrived*, *In Consultation*, *Completed*, or *Cancelled/No-Show*.
4. **Auto-Refresh**:
   - The console background poll runs every 20 seconds to keep waiting queues synchronized without manual browser refresh.

### Step 3: Same-Day Patient Check-In
1. In the console table, locate **Pooja Gaikwad** under *Not Yet Arrived* (Status: `BOOKED`).
2. Click the green **Check In** button.
3. Observe the immediate updates:
   - Status changes to `CHECKED_IN` (Waiting Outside).
   - Check-in details record the exact time and attribution: `Checked in: <HH:MM> by Reception: Front Desk Staff`.
   - The patient moves into the active waiting queue for Dr. Sharma.

### Step 4: "Unavailable" Action & Continuous Queue Re-indexing
1. In the waiting queue, locate **Sneha Kulkarni** (Token #3).
2. Click the amber **Unavailable** button.
3. A confirmation modal appears explaining that the patient will be removed from the active waiting queue and prompted to reschedule.
4. Click **Confirm & Reschedule**:
   - Status transitions atomically `CHECKED_IN -> BOOKED`.
   - Check-in timestamp and attribution are cleared.
   - The patient is removed from the waiting room.
   - Remaining patients behind Sneha immediately advance, closing the queue gap contiguously with zero holes.
5. The **Reschedule Modal** automatically opens for Sneha with Dr. Ananya Sharma:
   - **Scenario A**: Choose another available slot on today or a future date and click *Confirm Reschedule*. The patient retains their payment, receives a new token number for the selected slot, and updated reminder schedules are created.
   - **Scenario B**: Click *Cancel* or close the modal without picking a slot. The patient safely remains under *Not Yet Arrived* where they can be checked in again later or rescheduled when they return.

### Step 5: No-Show Marking Rules
1. In the console table, notice that the **No-Show** button is disabled for appointments whose scheduled start time has not yet arrived.
2. Locate an appointment whose scheduled slot has already passed without arrival.
3. Click **No-Show** and confirm in the dialog. The appointment transitions to `NO_SHOW` and reminders are cancelled.

### Step 6: Cancellation with Refund Preview
1. Click **Cancel** on any active appointment.
2. The cancellation dialog calculates and displays Ruby Hall Clinic's refund tier and rupee amount before finalizing.
3. Confirming the cancellation updates the status, clears reminders, and dispatches cancellation email notifications.

### Step 7: Role Boundary Verification
1. Notice that the receptionist cannot click "Call Patient" or "Complete Consultation" in the console or live queue. These clinical transitions remain strictly reserved for the attending doctor.
2. Sign in as Dr. Ananya Sharma (`ananya.sharma@medrella.com`) and visit `/queue`:
   - Dr. Sharma can call the next patient into consultation (`CHECKED_IN -> IN_CONSULTATION`).
   - Dr. Sharma can mark consultations as `COMPLETED`.
   - Dr. Sharma can also mark waiting patients as **Unavailable**.
