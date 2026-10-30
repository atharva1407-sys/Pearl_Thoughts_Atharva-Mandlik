"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-[22px] w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:bg-primary data-[state=unchecked]:bg-[#cfd8e5]",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-[18px] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-[1px]" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
