"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Pending gear" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/gear", label: "All gear" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border">
      {ITEMS.map((item) => {
        // /admin is exact-match; everything else is prefix-match.
        const isActive =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative rounded-t-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "text-foreground after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-0.5 after:bg-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
