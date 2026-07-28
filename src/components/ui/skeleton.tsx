import { cn } from '@cloudflare/kumo';

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-kumo-elevated animate-pulse rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
