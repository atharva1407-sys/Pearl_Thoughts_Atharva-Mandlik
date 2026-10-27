import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser } from "@/actions/auth";
import { ClinicalShell } from "@/components/clinical-shell";

export const metadata: Metadata = {
  title: "Medrella Healthcare — Clinical Appointment System",
  description: "Next.js outpatient hospital appointment scheduling application for Pearl Thoughts Task 2",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-screen bg-[#f6f8fb] text-[#14243d]">
        <ClinicalShell user={user}>{children}</ClinicalShell>
      </body>
    </html>
  );
}
