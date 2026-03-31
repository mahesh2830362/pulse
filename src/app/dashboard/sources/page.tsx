"use client";

import { useState, useEffect, useCallback } from "react";

interface Source {
  readonly id: string;
  readonly url: string;
  readonly feed_url: string | null;
  readonly type: string;
  readonly name: string;
  readonly check_interval_minutes: number;
  readonly is_high_priority: boolean;
  readonly is_active: boolean;
  readonly created_at: string;
  readonly feed_states?: ReadonlyArray<{
    last_checked_at: string | null;
  }>;
}

const TYPE_ICONS: Record<string, string> = {
  rss: "\u25C9",
  website: "\u25CB",
  x_profile: "\u2715",
  youtube: "\u25B6",
  reddit: "\u25A0",
  generic: "\u25CF",
};

const TYPE_LABELS: Record<string, string> = {
  rss: "RSS Feed",
  website: "Page Monitor",
  x_profile: "X Profile",
  youtube: "YouTube",
  reddit: "Reddit",
  generic: "Website",
};

function formatLastChecked(dateString: string | null): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  const now = new Date();
  const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function formatInterval(minutes: number): string {
  if (minutes === 0) return "Manual only";
  if (minutes < 60) return `Every ${minutes}m`;
  if (minutes === 60) return "Hourly";
  return `Every ${Math.round(minutes / 60)}h`;
}

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const fetchSources = useCallback(async () => {
    try {
      const response = await fetch("/api/sources");
      const data = await response.json();
      if (response.ok) {
        setSources(data.sources ?? []);
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  async function handleAddSource(e: React.FormEvent) {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    setIsAdding(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl }),
      });

      // Guard against non-JSON responses (e.g. HTML error pages)
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(
          response.ok
            ? "Server returned an unexpected response"
            : `Server error (${response.status})`
        );
      }

      const data = await response.json();

      if (response.status === 409) {
        setFeedback({ type: "error", message: "Source already exists" });
      } else if (!response.ok) {
        throw new Error(data.error ?? "Failed to add");
      } else {
        const monitorMsg =
          data.monitoringType === "rss"
            ? "RSS feed discovered — auto-monitoring enabled"
            : data.monitoringType === "page"
              ? "No RSS found — page monitoring enabled"
              : "Saved as manual source";

        setFeedback({
          type: "success",
          message: `Added: ${data.source.name}. ${monitorMsg}`,
        });
        setUrl("");
        fetchSources();
      }
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Something went wrong",
      });
    } finally {
      setIsAdding(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  }

  async function handleDelete(sourceId: string, sourceName: string) {
    if (!confirm(`Remove "${sourceName}" from your sources?`)) return;

    try {
      const response = await fetch(`/api/sources?id=${sourceId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setSources((prev) => prev.filter((s) => s.id !== sourceId));
      }
    } catch {
      // Silently fail
    }
  }

  async function handleTogglePriority(source: Source) {
    const newPriority = !source.is_high_priority;

    // Optimistic update
    setSources((prev) =>
      prev.map((s) =>
        s.id === source.id ? { ...s, is_high_priority: newPriority } : s
      )
    );

    try {
      await fetch("/api/sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: source.id, is_high_priority: newPriority }),
      });
    } catch {
      // Revert
      setSources((prev) =>
        prev.map((s) =>
          s.id === source.id ? { ...s, is_high_priority: !newPriority } : s
        )
      );
    }
  }

  async function handleToggleActive(source: Source) {
    const newActive = !source.is_active;

    setSources((prev) =>
      prev.map((s) =>
        s.id === source.id ? { ...s, is_active: newActive } : s
      )
    );

    try {
      await fetch("/api/sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: source.id, is_active: newActive }),
      });
    } catch {
      setSources((prev) =>
        prev.map((s) =>
          s.id === source.id ? { ...s, is_active: !newActive } : s
        )
      );
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            lineHeight: 1.1,
            color: "var(--color-text)",
          }}
        >
          Sources
        </h1>
        <p
          style={{
            fontSize: 17,
            color: "var(--color-text-secondary)",
            marginTop: 6,
            letterSpacing: "-0.016em",
          }}
        >
          Manage websites, feeds, and profiles you follow.
        </p>
      </div>

      {/* Add source */}
      <form onSubmit={handleAddSource} style={{ marginBottom: 28 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "4px 4px 4px 20px",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 14,
          }}
        >
          <span style={{ fontSize: 18, color: "var(--color-text-tertiary)", flexShrink: 0 }}>
            +
          </span>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Add source — paste website, YouTube channel, or X profile URL..."
            disabled={isAdding}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "none",
              fontSize: 16,
              color: "var(--color-text)",
              letterSpacing: "-0.016em",
              padding: "10px 0",
            }}
          />
          {(url.trim() || isAdding) && (
            <button
              type="submit"
              disabled={isAdding || !url.trim()}
              style={{
                padding: "10px 20px",
                backgroundColor: "var(--color-text)",
                color: "white",
                border: "none",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                cursor: isAdding ? "not-allowed" : "pointer",
                opacity: isAdding ? 0.6 : 1,
                letterSpacing: "-0.016em",
                whiteSpace: "nowrap",
              }}
            >
              {isAdding ? "Adding..." : "Add Source"}
            </button>
          )}
        </div>
      </form>

      {/* Feedback */}
      {feedback && (
        <div
          style={{
            marginBottom: 20,
            padding: "10px 16px",
            borderRadius: 10,
            fontSize: 14,
            letterSpacing: "-0.016em",
            backgroundColor:
              feedback.type === "success"
                ? "rgba(52, 199, 89, 0.08)"
                : "rgba(255, 59, 48, 0.08)",
            color:
              feedback.type === "success"
                ? "var(--color-success)"
                : "var(--color-unread)",
          }}
        >
          {feedback.message}
        </div>
      )}

      {/* Sources list */}
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
      ) : sources.length === 0 ? (
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
            No sources yet
          </h2>
          <p style={{ fontSize: 15, maxWidth: 360, margin: "0 auto", lineHeight: 1.5 }}>
            Add a website, YouTube channel, or X profile to start monitoring for new content.
          </p>
        </div>
      ) : (
        <div>
          {sources.map((source) => {
            const lastChecked = source.feed_states?.[0]?.last_checked_at ?? null;

            return (
              <div
                key={source.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "16px 0",
                  borderBottom: "1px solid rgba(0, 0, 0, 0.04)",
                  opacity: source.is_active ? 1 : 0.5,
                }}
              >
                {/* Type icon */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: "rgba(0, 0, 0, 0.04)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  {TYPE_ICONS[source.type] ?? "\u25CF"}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 15,
                      color: "var(--color-text)",
                      letterSpacing: "-0.02em",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {source.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--color-text-tertiary)",
                      marginTop: 2,
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <span>{TYPE_LABELS[source.type] ?? source.type}</span>
                    <span>&bull;</span>
                    <span>{formatInterval(source.check_interval_minutes)}</span>
                    {lastChecked && (
                      <>
                        <span>&bull;</span>
                        <span>Checked {formatLastChecked(lastChecked)}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Priority toggle */}
                <button
                  onClick={() => handleTogglePriority(source)}
                  title={source.is_high_priority ? "High priority (notifications on)" : "Normal priority"}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 16,
                    padding: 4,
                    color: source.is_high_priority
                      ? "var(--color-unread)"
                      : "var(--color-text-tertiary)",
                  }}
                >
                  {source.is_high_priority ? "\u2605" : "\u2606"}
                </button>

                {/* Pause/resume */}
                <button
                  onClick={() => handleToggleActive(source)}
                  title={source.is_active ? "Pause monitoring" : "Resume monitoring"}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    padding: "4px 8px",
                    color: "var(--color-text-tertiary)",
                    borderRadius: 6,
                  }}
                >
                  {source.is_active ? "\u23F8" : "\u25B6"}
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(source.id, source.name)}
                  title="Remove source"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 14,
                    padding: 4,
                    color: "var(--color-unread)",
                  }}
                >
                  {"\u2715"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
