# Pearl_Thoughts_Atharva-Mandlik

Full Stack Development tasks for Pearl Thoughts, organized one self-contained folder per task.

| Folder | Task | Description |
|---|---|---|
| [`Task_1`](Task_1) | ER Diagram & Next.js Setup | ER diagram for the Schedule Project module (`User` → `Patient` → `Doctor` → `Availability` → `Appointment`), its video walkthrough, and an independent Next.js "Hello World" app. |
| [`Task_2`](Task_2) | Medrella Appointment Booking App | Full-stack Next.js 16 app (TypeScript, Tailwind, Drizzle ORM, Neon PostgreSQL, Zod, JWT cookie auth). See [`Task_2/README.md`](Task_2/README.md). |
| [`Task_3`](Task_3) | Feedback, Feature Additions & Stability | Enhanced app with multi-session scheduling (Stream & Wave), atomic rescheduling, doctor leave management, founding doctors catalog, and smooth navigation. See [`Task_3/README.md`](Task_3/README.md) and [`Task_3/CHANGES.md`](Task_3/CHANGES.md). |
| [`Task_4`](Task_4) | Razorpay (Test Mode) Payments & Refunds | Paid booking with Razorpay sandbox integration, 10-minute seat holds, official Razorpay Checkout popup, payment receipts, tiered refund policies, and notification outbox. See [`Task_4/README.md`](Task_4/README.md) and [`Task_4/CHANGES.md`](Task_4/CHANGES.md). |

---

## 🏃 Running Any Task Independently

Every task folder is completely independent with zero cross-task dependencies. Anyone can jump into a specific task folder and run or test it directly:

```bash
# Navigate to the specific task folder
cd Task_1   # or Task_2, Task_3, Task_4

# Install dependencies (first time only)
npm install

# Run the development server
npm run dev

# Run automated verification tests (Tasks 2, 3, and 4)
npm test
```

> **Note on Environment Variables**: `Task_2`, `Task_3`, and `Task_4` include a `.env.example` in their respective folder. If running locally without a PostgreSQL database, setting `DATABASE_URL="disabled-for-local-test"` enables the fully seeded in-memory fallback.

