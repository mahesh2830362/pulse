"use client";

import { useState, useCallback } from "react";

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

interface FeedItemProps {
  readonly item: FeedItemData;
  readonly onMarkRead: (itemId: string, isRead: boolean) => void;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getSourceLabel(metadata: Record<string, unknown>): string {
  if (metadata?.siteName) return metadata.siteName as string;
  if (metadata?.username) return `@${metadata.username}`;
  if (metadata?.authorUrl) {
    try {
      return new URL(metadata.authorUrl as string).hostname;
    } catch {
      return "";
    }
  }
  return "";
}

function getTypeLabel(metadata: Record<string, unknown>): string | null {
  if (metadata?.isPost === "true" || metadata?.embedHtml) return "Tweet";
  if (metadata?.isVideo === "true") return "YouTube";
  if (metadata?.isChannelSource) return "Channel";
  if (metadata?.isProfileSource) return "Profile";
  if (metadata?.subreddit) return "Reddit";
  return null;
}

export function FeedItem({ item, onMarkRead }: FeedItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [summary, setSummary] = useState<string | null>(item.summary);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isBookmarking, setIsBookmarking] = useState(false);

  const sourceLabel = getSourceLabel(item.raw_metadata);
  const typeLabel = getTypeLabel(item.raw_metadata);
  const timeAgo = formatTimeAgo(item.published_at ?? item.feed_created_at);

  async function handleSummarize() {
    setIsSummarizing(true);
    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      const data = await response.json();
      if (response.ok) {
        setSummary(data.summary);
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setIsSummarizing(false);
    }
  }

  function handleClick() {
    setIsExpanded(!isExpanded);
    if (!item.is_read) {
      onMarkRead(item.id, true);
    }
  }

  return (
    <div
      style={{
        padding: "16px 0",
        borderBottom: "1px solid rgba(0, 0, 0, 0.04)",
        cursor: "pointer",
      }}
      onClick={handleClick}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "start" }}>
        {/* Unread indicator */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            marginTop: 7,
            flexShrink: 0,
            ...(item.is_read
              ? {
                  border: "1.5px solid #d2d2d7",
                  backgroundColor: "transparent",
                }
              : {
                  backgroundColor: "var(--color-unread)",
                }),
          }}
        />

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: item.is_read ? 400 : 600,
              fontSize: 16,
              lineHeight: 1.3,
              letterSpacing: "-0.02em",
              color: item.is_read
                ? "var(--color-text-secondary)"
                : "var(--color-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: isExpanded ? "normal" : "nowrap",
            }}
          >
            {item.title}
          </div>

          <div
            style={{
              color: "var(--color-text-tertiary)",
              fontSize: 13,
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              gap: 6,
              letterSpacing: "-0.016em",
            }}
          >
            {sourceLabel && <span>{sourceLabel}</span>}
            {sourceLabel && (typeLabel || timeAgo) && <span>&bull;</span>}
            {typeLabel && (
              <>
                <span>{typeLabel}</span>
                <span>&bull;</span>
              </>
            )}
            <span>{timeAgo}</span>
          </div>

          {/* Expanded view */}
          {isExpanded && (
            <div style={{ marginTop: 12 }}>
              {/* Snippet */}
              {item.content_snippet && (
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: "var(--color-text-secondary)",
                    letterSpacing: "-0.016em",
                    marginBottom: 12,
                  }}
                >
                  {item.content_snippet.slice(0, 300)}
                  {item.content_snippet.length > 300 ? "..." : ""}
                </p>
              )}

              {/* Summary */}
              {summary && (
                <div
                  style={{
                    background: "rgba(0, 113, 227, 0.04)",
                    border: "1px solid rgba(0, 113, 227, 0.1)",
                    borderRadius: 10,
                    padding: "12px 14px",
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      color: "var(--color-accent)",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.02em",
                      marginBottom: 4,
                    }}
                  >
                    Summary
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      lineHeight: 1.5,
                      color: "var(--color-text)",
                      letterSpacing: "-0.016em",
                    }}
                  >
                    {summary}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isBookmarked || isBookmarking) return;
                    setIsBookmarking(true);
                    fetch("/api/bookmarks", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ itemId: item.id }),
                    })
                      .then((res) => {
                        if (res.ok || res.status === 409) setIsBookmarked(true);
                      })
                      .catch(() => {})
                      .finally(() => setIsBookmarking(false));
                  }}
                  disabled={isBookmarking || isBookmarked}
                  style={{
                    padding: "6px 14px",
                    fontSize: 13,
                    fontWeight: 500,
                    color: isBookmarked ? "white" : "var(--color-accent)",
                    backgroundColor: isBookmarked
                      ? "var(--color-accent)"
                      : "var(--color-accent-light)",
                    border: "none",
                    borderRadius: 8,
                    cursor:
                      isBookmarking || isBookmarked ? "default" : "pointer",
                    letterSpacing: "-0.016em",
                    transition: "all 0.15s",
                  }}
                >
                  {isBookmarked
                    ? "\u2605 Bookmarked"
                    : isBookmarking
                      ? "Saving..."
                      : "\u2606 Bookmark"}
                </button>

                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    padding: "6px 14px",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--color-accent)",
                    backgroundColor: "var(--color-accent-light)",
                    borderRadius: 8,
                    textDecoration: "none",
                    letterSpacing: "-0.016em",
                  }}
                >
                  Open original
                </a>

                {!summary && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSummarize();
                    }}
                    disabled={isSummarizing}
                    style={{
                      padding: "6px 14px",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--color-text-secondary)",
                      backgroundColor: "rgba(0, 0, 0, 0.04)",
                      border: "none",
                      borderRadius: 8,
                      cursor: isSummarizing ? "not-allowed" : "pointer",
                      opacity: isSummarizing ? 0.6 : 1,
                      letterSpacing: "-0.016em",
                    }}
                  >
                    {isSummarizing ? "Summarizing..." : "Summarize"}
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkRead(item.id, !item.is_read);
                  }}
                  style={{
                    padding: "6px 14px",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--color-text-secondary)",
                    backgroundColor: "rgba(0, 0, 0, 0.04)",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    letterSpacing: "-0.016em",
                  }}
                >
                  {item.is_read ? "Mark unread" : "Mark read"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Thumbnail */}
        {item.image_url && !isExpanded && (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 8,
              overflow: "hidden",
              flexShrink: 0,
              backgroundColor: "rgba(0, 0, 0, 0.04)",
            }}
          >
            <img
              src={item.image_url}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
