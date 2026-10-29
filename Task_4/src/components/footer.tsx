import Link from "next/link";

export function Footer() {
  return (
    <footer className="max-w-5xl w-full mx-auto pt-8 mt-12 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className="relative inline-flex shrink-0 items-center justify-center bg-[#0875df] font-semibold text-white shadow-xs"
          style={{
            width: "20px",
            height: "20px",
            borderRadius: "5px 5px 5px 0",
            fontSize: "13px",
            letterSpacing: "-1px",
            lineHeight: 1,
          }}
        >
          <span style={{ marginTop: "-1px" }}>m</span>
          <span className="absolute font-bold" style={{ fontSize: "6.5px", top: "1px", right: "2px", lineHeight: 1 }}>+</span>
        </span>
        <span className="font-bold text-zinc-300">
          medrella<span className="text-[#0584db]">.</span>
        </span>
        <span className="text-zinc-600">•</span>
        <span>Planned on a Schedula foundation • Pearl Thoughts Assessment</span>
        <span className="text-zinc-600">•</span>
        <Link href="/terms" className="text-zinc-400 hover:text-zinc-200 transition-colors underline">
          Terms
        </Link>
        <span className="text-zinc-600">•</span>
        <Link href="/privacy" className="text-zinc-400 hover:text-zinc-200 transition-colors underline">
          Privacy
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
        <span className="font-mono text-zinc-400">System: Operational (200 OK)</span>
      </div>
    </footer>
  );
}
