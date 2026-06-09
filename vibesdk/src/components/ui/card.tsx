import * as React from "react"

import { cn } from "@/lib/utils"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-bg-4 dark:bg-bg-2 text-text-primary flex flex-col rounded-md border",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, variant, ...props }: React.ComponentProps<"div"> & { variant?: "minimal"}) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "flex items-start gap-1.5 py-4 px-4",
        className,
        variant !== "minimal" ? "py-4" : "py-1",
      )}
      {...props}
    />
  )
}

const CardWarning = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: "warning" | "error" | "info"
  }
>(({ className, variant = "warning", ...props }, ref) => {
  const variantStyles = {
    warning: "bg-yellow-50 text-yellow-900 border-yellow-200",
    error: "bg-red-50 text-red-900 border-red-200",
    info: "bg-blue-50 text-blue-900 border-blue-200",
  }

  return (
    <div
      ref={ref}
      role="alert"
      data-slot="card-warning"
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-sm border-b rounded-t-md",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  )
})

CardWarning.displayName = "CardWarning"


const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-text-secondary", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("px-6  py-4", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, CardWarning }
