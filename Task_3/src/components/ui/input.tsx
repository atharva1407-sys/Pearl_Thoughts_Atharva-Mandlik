import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-[9px] border border-input bg-white px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-[#6aa5ff] focus-visible:ring-[3px] focus-visible:ring-[rgba(22,112,255,0.09)] disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  );
}

export { Input };
