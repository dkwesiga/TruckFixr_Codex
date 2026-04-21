import { cn } from "@/lib/utils";

type AppLogoProps = {
  className?: string;
  imageClassName?: string;
  frameClassName?: string;
  href?: string;
  alt?: string;
};

export default function AppLogo({
  className,
  imageClassName,
  frameClassName,
  href,
  alt = "TruckFixr",
}: AppLogoProps) {
  const content = (
    <div className={cn("flex items-center", className)}>
      <div
        className={cn(
          "rounded-2xl bg-white/95 p-2 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/80",
          frameClassName
        )}
      >
        <img
          src="/truckfixr-logo.png"
          alt={alt}
          className={cn("h-12 w-auto", imageClassName)}
        />
      </div>
    </div>
  );

  if (href) {
    return <a href={href}>{content}</a>;
  }

  return content;
}
