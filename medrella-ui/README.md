# Medrella Hospital Management UI

A responsive Next.js + TypeScript UI prototype inspired by the reference screenshots and Medrella's healthcare product styling. It includes reusable components and navigable pages for hospital operations.

## Pages included

- `/` — Dashboard
- `/queue` — Live token queue and next-patient panel
- `/reception` — Reception desk, walk-in registration, doctor sessions
- `/patients` — Searchable patient directory
- `/patient-profile` — Patient overview, allergies, upcoming appointment, recent visits
- `/schedule` — Weekly appointment calendar with week navigation
- `/new-appointment` — Appointment creation form
- `/encounters` — Consultation workspace and vitals
- `/orders` — Orders management shell
- `/billing` — Billing workspace shell
- `/reports` — Visit metrics, charts, and report table
- `/settings` — Hospital settings

## Run locally

Requires Node.js 20.9+.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Notes

- This is a frontend prototype with sample data. It does not connect to a real hospital database, EHR, billing system, or authentication provider.
- Forms and buttons demonstrate UI interactions with local feedback only. Integrate validated backend APIs before using with real patient data.
- The provided website could not be fetched reliably during generation, so the implementation follows the supplied screenshots and requested Medrella visual direction rather than claiming to be a pixel-perfect copy of the live site.
