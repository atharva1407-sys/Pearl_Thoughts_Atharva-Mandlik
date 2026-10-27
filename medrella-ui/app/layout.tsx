import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Medrella | Hospital Management', description: 'Hospital operations and patient management workspace' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
