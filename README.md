# Pearl_Thoughts_Atharva-Mandlik

Full Stack Development tasks for Pearl Thoughts, one folder per task.

| Folder | Task | Contents |
|---|---|---|
| [`Task_1`](Task_1) | ER Diagram & Next.js setup | ER diagram for the Schedule Project module (User → Patient → Doctor → Availability → Appointment), its video walkthrough, and a Next.js "Hello World" app |
| [`Task_2`](Task_2) | Medrella appointment booking app | Full-stack Next.js app (TypeScript, Tailwind, Drizzle, Neon PostgreSQL, Zod, JWT auth) as first built and deployed. See [`Task_2/README.md`](Task_2/README.md) |
| [`Task_3`](Task_3) | Demo, feedback & improvements | The complete app with Task 3's work: security fixes, doctor sessions, stream & wave scheduling, rescheduling, leave, landing page, smooth navigation. [`Task_3/CHANGES.md`](Task_3/CHANGES.md) lists exactly which files Task 3 added, changed or removed |

Each app folder runs on its own: `cd Task_1` (or `Task_2`, `Task_3`), then `npm install` and `npm run dev`. `Task_2` and `Task_3` need their own `.env.local` (see that folder's `.env.example`).
