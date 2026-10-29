"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn primary text-xs py-1.5 px-3 inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
    >
      <Printer size={14} />
      <span>Print Receipt</span>
    </button>
  );
}
