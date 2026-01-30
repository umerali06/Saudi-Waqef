"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative flex items-center rounded-xl px-3 py-2 text-sm transition",
        isActive
          ? "border border-primary/30 bg-primary/10 text-foreground shadow-sm"
          : "text-muted hover:bg-surface-muted hover:text-foreground"
      )}
    >
      {isActive ? (
        <span className="absolute left-2 h-1.5 w-1.5 rounded-full bg-primary" />
      ) : null}
      <span className={isActive ? "pl-3 font-semibold" : "pl-3"}>{label}</span>
    </Link>
  );
}
