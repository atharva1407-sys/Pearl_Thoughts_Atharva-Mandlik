import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "Medrella — Hospital Appointment Booking",
  description: "Next.js outpatient hospital appointment scheduling application for Pearl Thoughts Task 2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-screen bg-[#09090b] text-zinc-100 p-4 sm:p-8 flex flex-col justify-between relative selection:bg-indigo-500 selection:text-white">
        {/* Subtle Ambient Radial Glow */}
        <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_60%_at_50%_-15%,rgba(99,102,241,0.12),rgba(0,0,0,0))]"></div>
        
        <div className="relative z-10 flex flex-col min-h-screen">
          <Navbar />
          <div className="flex-1 max-w-5xl w-full mx-auto py-8">
            {children}
          </div>
          <Footer />
        </div>
      </body>
    </html>
  );
}
