import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-10 shrink-0 items-center rounded-full border border-slate-400 bg-slate-300 shadow-sm outline-none transition-all data-[state=checked]:border-blue-700 data-[state=checked]:bg-blue-600 data-[state=unchecked]:border-slate-400 data-[state=unchecked]:bg-slate-300 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-500 dark:data-[state=unchecked]:bg-slate-600",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-white ring-0 shadow-sm transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-[2px] dark:bg-white"
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
