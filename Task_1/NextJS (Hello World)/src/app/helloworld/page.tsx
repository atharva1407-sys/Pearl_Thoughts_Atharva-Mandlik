import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HelloWorld Page | Task 1",
  description: "Dedicated HelloWorld page for Task 1",
};

export default function HelloWorldPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col justify-between p-6 sm:p-12 font-sans selection:bg-indigo-500 selection:text-white">
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between">
        <Link
          href="/"
          className="text-sm font-semibold tracking-wide text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          ← Back to Home
        </Link>
        <span className="text-xs font-mono bg-zinc-200/70 dark:bg-zinc-800/80 px-2.5 py-1 rounded-md text-zinc-600 dark:text-zinc-400">
          /helloworld
        </span>
      </header>

      <main className="max-w-3xl w-full mx-auto my-auto flex flex-col items-center text-center py-12">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-medium mb-6">
          <span>●</span>
          <span>Dedicated Route</span>
        </div>

        <h1 className="text-6xl sm:text-8xl font-black tracking-tight mb-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
          HelloWorld
        </h1>

        <p className="max-w-md text-base sm:text-lg text-zinc-600 dark:text-zinc-400 mb-8">
          Welcome to the dedicated <code className="font-mono font-bold text-zinc-800 dark:text-zinc-200">/helloworld</code> route in <span className="font-semibold text-zinc-900 dark:text-zinc-200">Task_1</span>.
        </p>

        <Link
          href="/"
          className="px-6 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-900 font-medium text-sm transition-all shadow-md"
        >
          Return to Home
        </Link>
      </main>

      <footer className="max-w-4xl w-full mx-auto pt-6 border-t border-zinc-200/60 dark:border-zinc-800/60 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Task 1 — Next.js HelloWorld
      </footer>
    </div>
  );
}
