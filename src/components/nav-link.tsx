"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon, type NavIconName } from "@/components/nav-icons";
import { cn } from "@/lib/utils";

export type NavChild = { href: string; label: string };

const isWithin = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/** Shows at once that a click registered, while the next page is on its way. */
function Pending() {
  const { pending } = useLinkStatus();
  return pending ? <span className="nav-pending" aria-hidden /> : null;
}

export function NavLink({
  href,
  label,
  icon,
  badgeCount,
  items,
  excludes = [],
}: {
  href: string;
  label: string;
  icon: NavIconName | React.ReactElement;
  badgeCount?: number;
  /** Pages of this module, listed while the module is open. */
  items?: NavChild[];
  /** Deeper paths that have their own entry and must not highlight this one. */
  excludes?: string[];
}) {
  const pathname = usePathname();
  const isOpen = isWithin(pathname, href) && !excludes.some((path) => isWithin(pathname, path));

  return (
    <div>
      <Link
        href={href}
        aria-current={pathname === href ? "page" : undefined}
        className={cn(
          "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          isOpen
            ? "bg-white/10 font-semibold text-white before:absolute before:inset-y-1.5 before:start-0 before:w-[3px] before:rounded-full before:bg-[#6fb1ee]"
            : "text-[#b9c7d6] hover:bg-white/5 hover:text-white"
        )}
      >
        {typeof icon === "string" ? <NavIcon name={icon} /> : icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <Pending />
        {badgeCount ? (
          <span className="min-w-5 rounded-full bg-[#e0574d] px-1.5 text-center text-[11px] font-semibold leading-5 text-white">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        ) : null}
      </Link>
      {isOpen && items?.length ? (
        <ul className="my-1 ms-[1.3rem] space-y-0.5 border-s border-white/15 ps-3">
          {items.map((item) => {
            const active = isWithin(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block truncate rounded px-2.5 py-1.5 text-[13px] transition-colors",
                    active ? "font-medium text-white" : "text-[#9fb0c2] hover:text-white"
                  )}
                >
                  {item.label}
                  <Pending />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
