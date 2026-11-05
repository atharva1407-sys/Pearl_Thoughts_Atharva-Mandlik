"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
export function PrintButton() {
  return (
    <Button variant="default"
      type="button"
      onClick={() => window.print()}
      className="text-xs py-1.5 px-3 inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
    >
      <Printer size={14} />
      <span>Print Receipt</span>
    </Button>
  );
}
