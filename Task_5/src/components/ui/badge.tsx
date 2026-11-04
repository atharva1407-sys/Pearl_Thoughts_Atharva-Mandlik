import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-[5px] whitespace-nowrap rounded-[5px] px-[9px] py-1 text-[11.5px] font-bold",
  {
    variants: {
      variant: {
        default: "bg-[#edf4ff] text-[#2368bd]",
        blue: "bg-[#e8f2ff] text-[#1769e8]",
        sky: "bg-[#eaf6ff] text-[#2872b8]",
        green: "bg-[#e5f8ef] text-[#13865b]",
        red: "bg-[#ffebee] text-[#cb2c42]",
        amber: "bg-[#fff4df] text-[#a96910]",
        gray: "bg-[#f0f2f6] text-[#68768a]",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
