"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col justify-between p-6 sm:p-12 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Header / Navigation */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="text-sm font-semibold tracking-wide uppercase text-zinc-500 dark:text-zinc-400">
            Task 1 • Pearl Thoughts
          </span>
        </div>
        <div className="text-xs font-mono bg-zinc-200/70 dark:bg-zinc-800/80 px-2.5 py-1 rounded-md text-zinc-600 dark:text-zinc-400">
          Next.js App Router
        </div>
      </header>

      {/* Main Hero Card */}
      <main className="max-w-4xl w-full mx-auto my-auto flex flex-col items-center text-center py-12">
        {/* Status Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs sm:text-sm font-medium mb-8">
          <span>✨</span>
          <span>Task 1 Initialized Successfully</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight mb-6 bg-gradient-to-r from-zinc-900 via-indigo-950 to-indigo-600 dark:from-white dark:via-indigo-200 dark:to-indigo-400 bg-clip-text text-transparent">
          Hello, World!
        </h1>

        {/* Subtitle / Description */}
        <p className="max-w-xl text-base sm:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed mb-10">
          This is the Next.js <span className="font-semibold text-zinc-900 dark:text-zinc-200">&ldquo;Hello World&rdquo;</span> page created in <span className="font-semibold text-zinc-900 dark:text-zinc-200">Task_1</span>. Built with Next.js App Router, TypeScript, and Tailwind CSS.
        </p>

        {/* Interactive Controls */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-12">
          <button
            onClick={() => setCount((c) => c + 1)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-900 font-medium text-sm transition-all shadow-md active:scale-95 cursor-pointer"
          >
            <span>Interactive Counter:</span>
            <span className="font-mono font-bold bg-zinc-700 text-white dark:bg-zinc-200 dark:text-zinc-900 px-2 py-0.5 rounded text-xs">
              {mounted ? count : 0}
            </span>
          </button>

          <Link
            href="/helloworld"
            className="px-6 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 font-medium text-sm transition-all text-zinc-700 dark:text-zinc-300"
          >
            Visit /helloworld route →
          </Link>
        </div>

        {/* Tech Stack Info Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-2xl text-left">
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 backdrop-blur-sm">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Framework</div>
            <div className="font-semibold text-sm">Next.js 16</div>
          </div>
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 backdrop-blur-sm">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Language</div>
            <div className="font-semibold text-sm">TypeScript 5</div>
          </div>
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 backdrop-blur-sm">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Styling</div>
            <div className="font-semibold text-sm">Tailwind CSS 4</div>
          </div>
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 backdrop-blur-sm">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Architecture</div>
            <div className="font-semibold text-sm">App Router</div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl w-full mx-auto pt-6 border-t border-zinc-200/60 dark:border-zinc-800/60 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 gap-2">
        <div>Pearl Thoughts Assessment • Task 1</div>
        <div className="font-mono">Status: Ready (200 OK)</div>
      </footer>
    </div>
  );
}
