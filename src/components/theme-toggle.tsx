"use client";

import { useTheme } from "./theme-provider";

const OPTIONS = [
  { value: "light" as const, label: "\u2600", title: "Light" },
  { value: "dark" as const, label: "\u263E", title: "Dark" },
  { value: "system" as const, label: "\u25D1", title: "System" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        padding: 3,
        borderRadius: 10,
        backgroundColor: "var(--color-hover)",
      }}
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          title={opt.title}
          style={{
            flex: 1,
            padding: "5px 0",
            borderRadius: 8,
            border: "none",
            fontSize: 14,
            cursor: "pointer",
            backgroundColor:
              theme === opt.value ? "var(--color-surface)" : "transparent",
            color:
              theme === opt.value
                ? "var(--color-text)"
                : "var(--color-text-tertiary)",
            boxShadow:
              theme === opt.value
                ? "0 1px 3px rgba(0,0,0,0.1)"
                : "none",
            transition: "all 0.15s",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
