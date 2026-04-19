"use client";

import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "../lib/utils";

const ScrollArea = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, type = "always", ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    data-slot="scroll-area"
    ref={ref}
    type={type}
    className={cn(
      "group/scroll-area relative flex min-h-0 flex-col overflow-hidden",
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport
      data-slot="scroll-area-viewport"
      className="min-h-0 w-full flex-1 rounded-[inherit]"
    >
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    data-slot="scroll-area-scrollbar"
    forceMount
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none rounded-full p-px opacity-20 transition-[opacity,background-color] duration-200 select-none group-hover/scroll-area:opacity-60",
      orientation === "vertical" && "my-1 h-[calc(100%-0.5rem)] w-1.5",
      orientation === "horizontal" &&
        "mx-1 h-1.5 w-[calc(100%-0.5rem)] flex-col",
      className,
    )}
    style={{
      backgroundColor: "rgba(148, 163, 184, 0.1)",
      width: orientation === "vertical" ? "6px" : undefined,
      height: orientation === "horizontal" ? "6px" : undefined,
    }}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb
      data-slot="scroll-area-thumb"
      className="relative flex-1 rounded-full bg-[rgba(22,32,51,0.14)] transition-[background-color,opacity] duration-200 group-hover/scroll-area:bg-[rgba(22,32,51,0.22)] data-[state=visible]:bg-[rgba(22,32,51,0.26)]"
    />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
