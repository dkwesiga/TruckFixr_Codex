import { cn } from "@/lib/utils";

type AppLogoProps = {
  className?: string;
  imageClassName?: string;
  frameClassName?: string;
  href?: string;
  alt?: string;
  variant?: "full" | "icon";
};

export default function AppLogo({
  className,
  imageClassName,
  frameClassName,
  href,
  alt = "TruckFixr",
  variant = "full",
}: AppLogoProps) {
  const content = (
    <div className={cn("flex shrink-0 items-center", className)}>
      <div
        className={cn(
          variant === "full"
            ? "overflow-hidden"
            : "overflow-hidden rounded-2xl bg-white/95 p-2 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/80",
          variant === "icon" && "flex h-14 w-14 items-center justify-center p-1.5",
          frameClassName
        )}
      >
        <img
          src="/truckfixr-logo.png"
          alt={alt}
          className={cn(
            "block object-contain",
            variant === "icon"
              ? "h-full w-full"
              : "h-12 w-auto",
            imageClassName
          )}
        />
      </div>
    </div>
  );

  if (href) {
    return <a href={href}>{content}</a>;
  }

  return content;
}
