"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  label,
  icon,
  badgeCount,
}: {
  href: string;
  label: string;
  icon?: React.ReactNode;
  badgeCount?: number;
}) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-2xl px-3 py-2 text-sm transition",
        isActive
          ? "border border-primary/30 bg-primary/10 text-foreground shadow-sm"
          : "text-muted hover:bg-white hover:text-foreground"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl border border-transparent bg-white/80 text-muted transition",
          isActive
            ? "border-primary/20 bg-primary/15 text-primary shadow-sm"
            : "group-hover:border-border group-hover:bg-white group-hover:text-foreground"
        )}
      >
        {icon}
      </span>
      <span className={cn("min-w-0 flex-1", isActive ? "font-semibold" : "")}>{label}</span>
      {typeof badgeCount === "number" && badgeCount > 0 ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      ) : null}
    </Link>
  );
}
