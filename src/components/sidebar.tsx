"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { ThemeToggle } from "./theme-toggle";

interface SidebarProps {
  readonly user: User;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Feed", icon: "list" },
  { href: "/dashboard/search", label: "Search", icon: "search" },
  { href: "/dashboard/bookmarks", label: "Bookmarks", icon: "bookmark" },
  { href: "/dashboard/sources", label: "Sources", icon: "rss" },
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
] as const;

const ICONS: Record<string, string> = {
  list: "\u2630",
  search: "\u2315",
  bookmark: "\u2605",
  rss: "\u25C9",
  settings: "\u2699",
};

export function Sidebar({ user }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const initials =
    user.user_metadata?.full_name
      ?.split(" ")
      .map((n: string) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? "?";

  return (
    <aside
      style={{
        width: 240,
        borderRight: "1px solid var(--color-border)",
        padding: "32px 16px 24px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--color-surface)",
      }}
    >
      {/* Logo */}
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          color: "var(--color-text)",
          paddingLeft: 12,
          marginBottom: 32,
        }}
      >
        Pulse
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <a
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 10,
                fontSize: 15,
                fontWeight: isActive ? 600 : 400,
                letterSpacing: "-0.016em",
                color: isActive ? "var(--color-text)" : "var(--color-text-secondary)",
                backgroundColor: isActive ? "var(--color-hover)" : "transparent",
                textDecoration: "none",
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>
                {ICONS[item.icon]}
              </span>
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* Theme toggle */}
      <div style={{ padding: "0 12px", marginBottom: 12 }}>
        <ThemeToggle />
      </div>

      {/* User */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px",
          borderTop: "1px solid var(--color-border)",
          marginTop: 4,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            backgroundColor: "var(--color-text)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--color-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user.user_metadata?.full_name ?? "User"}
          </div>
        </div>
        <button
          onClick={handleSignOut}
          title="Sign out"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 14,
            color: "var(--color-text-tertiary)",
            padding: 4,
          }}
        >
          {"\u2192"}
        </button>
      </div>
    </aside>
  );
}
