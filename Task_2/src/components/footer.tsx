export function Footer() {
  return (
    <footer className="max-w-5xl w-full mx-auto pt-8 mt-12 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-3">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 rounded-full bg-white text-zinc-950 font-black text-[10px] flex items-center justify-center">
          N
        </div>
        <span>Pearl Thoughts Assessment • Task 2</span>
      </div>
      <div className="font-mono text-zinc-400">Status: Ready (200 OK)</div>
    </footer>
  );
}
