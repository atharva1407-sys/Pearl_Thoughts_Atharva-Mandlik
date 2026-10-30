import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "inline-flex min-h-9 items-center justify-center gap-[7px] rounded-[7px] border border-primary bg-primary px-3.5 text-[13px] font-bold whitespace-nowrap text-primary-foreground shadow-[0_2px_4px_rgba(23,105,232,0.2)] transition-all duration-150 hover:bg-primary-dark",
        outline:
          "inline-flex min-h-9 items-center justify-center gap-[7px] rounded-[7px] border border-[#dce5f0] bg-white px-3.5 text-[13px] font-bold whitespace-nowrap text-[#455671] shadow-[0_1px_1px_rgba(20,36,61,0.04)] transition-all duration-150 hover:border-[#a8c9f8] hover:bg-[#f8fbff]",
        destructive:
          "inline-flex min-h-9 items-center justify-center gap-[7px] rounded-[7px] border border-destructive bg-destructive px-3.5 text-[13px] font-bold whitespace-nowrap text-white transition-all duration-150 hover:bg-destructive/90",
        secondary:
          "inline-flex min-h-9 items-center justify-center gap-[7px] rounded-[7px] border border-transparent bg-secondary px-3.5 text-[13px] font-bold whitespace-nowrap text-secondary-foreground transition-all duration-150 hover:bg-secondary/80",
        ghost:
          "inline-flex min-h-9 items-center justify-center gap-[7px] rounded-[7px] border border-transparent bg-transparent px-3.5 text-[13px] font-bold whitespace-nowrap text-[#455671] transition-all duration-150 hover:bg-[#f3f8fe]",
        link: "inline-flex items-center gap-1 border-0 bg-transparent p-0 text-[13px] font-bold text-primary underline-offset-4 hover:underline",
        // No visual styling of its own: the caller's classes define the look (segmented controls, chips, slots).
        bare: "",
      },
      size: {
        default: "",
        sm: "min-h-8 px-3 text-xs",
        lg: "min-h-11 px-6 text-sm",
        icon: "size-9 p-0",
      },
    },
    defaultVariants: { variant: "outline", size: "default" },
  }
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
