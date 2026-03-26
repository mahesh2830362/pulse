"use client";

import { useState, useEffect, useCallback } from "react";
import { PasteUrlBar } from "./paste-url-bar";
import { FeedItem } from "./feed-item";

type FilterType = "all" | "unread" | "read";

interface FeedItemData {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly content_snippet: string | null;
  readonly author: string | null;
  readonly published_at: string | null;
  readonly image_url: string | null;
  readonly summary: string | null;
  readonly raw_metadata: Record<string, unknown>;
  readonly is_read: boolean;
  readonly feed_created_at: string;
}

const FILTERS: ReadonlyArray<{ value: FilterType; label: string }> = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
];

export function Feed() {
  const [items, setItems] = useState<FeedItemData[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [isLoading, setIsLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    try {
      const filterParam = filter === "read" ? "all" : filter;
      const response = await fetch(`/api/items?filter=${filterParam}`);
      const data = await response.json();

      if (response.ok) {
        let fetchedItems = data.items ?? [];

        if (filter === "read") {
          fetchedItems = fetchedItems.filter(
            (item: FeedItemData) => item.is_read
          );
        }

        setItems(fetchedItems);
      }
    } catch {
      // Silently fail — user sees empty state
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleMarkRead = useCallback(
    async (itemId: string, isRead: boolean) => {
      // Optimistic update
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, is_read: isRead } : item
        )
      );

      try {
        await fetch("/api/items/read", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, isRead }),
        });
      } catch {
        // Revert on failure
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId ? { ...item, is_read: !isRead } : item
          )
        );
      }
    },
    []
  );

  const unreadCount = items.filter((item) => !item.is_read).length;

  return (
    <div>
      <PasteUrlBar onItemSaved={fetchItems} />

      {/* Filters */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border: "none",
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: "-0.016em",
                cursor: "pointer",
                backgroundColor:
                  filter === f.value
                    ? "var(--color-text)"
                    : "rgba(0, 0, 0, 0.04)",
                color: filter === f.value ? "white" : "var(--color-text-secondary)",
                transition: "all 0.15s",
              }}
            >
              {f.label}
              {f.value === "unread" && unreadCount > 0 && (
                <span
                  style={{
                    marginLeft: 6,
                    backgroundColor:
                      filter === "unread"
                        ? "rgba(255,255,255,0.3)"
                        : "var(--color-unread)",
                    color: "white",
                    fontSize: 11,
                    padding: "1px 6px",
                    borderRadius: 10,
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Feed items */}
      {isLoading ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 0",
            color: "var(--color-text-tertiary)",
            fontSize: 15,
          }}
        >
          Loading...
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "80px 24px",
            color: "var(--color-text-secondary)",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>
            {"\u25C9"}
          </div>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "var(--color-text)",
              letterSpacing: "-0.02em",
              marginBottom: 8,
            }}
          >
            {filter === "unread"
              ? "All caught up"
              : filter === "read"
                ? "Nothing read yet"
                : "No items yet"}
          </h2>
          <p
            style={{
              fontSize: 15,
              maxWidth: 360,
              margin: "0 auto",
              lineHeight: 1.5,
            }}
          >
            {filter === "all"
              ? "Paste a URL above to save your first article, tweet, or video."
              : filter === "unread"
                ? "You've read everything. Nice work."
                : "Saved items you've opened will appear here."}
          </p>
        </div>
      ) : (
        <div>
          {items.map((item) => (
            <FeedItem
              key={item.id}
              item={item}
              onMarkRead={handleMarkRead}
            />
          ))}
        </div>
      )}
    </div>
  );
}
