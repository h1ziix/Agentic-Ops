import { cn } from "@/lib/utils";

const pattern = [1, 1, 0, 1, 1, 1, 0, 1, 1] as const;

export function PixelMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("pixel-mark", className)}>
      {pattern.map((filled, index) => (
        <span key={index} data-filled={filled === 1} />
      ))}
    </span>
  );
}
