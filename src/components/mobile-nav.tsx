"use client";

import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Feed", icon: "\u2630" },
  { href: "/dashboard/bookmarks", label: "Saved", icon: "\u2605" },
  { href: "/dashboard/sources", label: "Sources", icon: "\u25C9" },
  { href: "/dashboard/settings", label: "Settings", icon: "\u2699" },
] as const;

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="mobile-bottom-nav">
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);

        return (
          <a
            key={item.href}
            href={item.href}
            className={`mobile-nav-item ${isActive ? "active" : ""}`}
          >
            <span className="mobile-nav-icon">{item.icon}</span>
            <span className="mobile-nav-label">{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
