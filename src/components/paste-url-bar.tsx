"use client";

import { useState, useCallback } from "react";

interface PasteUrlBarProps {
  readonly onItemSaved: () => void;
}

async function submitUrl(
  url: string
): Promise<{ type: "success" | "info" | "error"; message: string }> {
  const response = await fetch("/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Failed to save");
  }

  // Use the message from the API response
  if (data.action === "source_added") {
    return {
      type: "success",
      message: data.message ?? `Added as a source to monitor.`,
    };
  }

  if (data.action === "source_exists") {
    return {
      type: "info",
      message: data.message ?? `This source is already being monitored.`,
    };
  }

  // Item saved
  return {
    type: "success",
    message: data.message ?? `Saved: ${data.item?.title ?? "Item"}`,
  };
}

export function PasteUrlBar({ onItemSaved }: PasteUrlBarProps) {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "info" | "error";
    message: string;
  } | null>(null);

  const handleSave = useCallback(
    async (urlToSave: string) => {
      const trimmed = urlToSave.trim();
      if (!trimmed) return;

      setIsLoading(true);
      setFeedback(null);

      try {
        const result = await submitUrl(trimmed);
        setFeedback(result);
        setUrl("");
        onItemSaved();
      } catch (error) {
        setFeedback({
          type: "error",
          message:
            error instanceof Error ? error.message : "Something went wrong",
        });
      } finally {
        setIsLoading(false);
        setTimeout(() => setFeedback(null), 5000);
      }
    },
    [onItemSaved]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      await handleSave(url);
    },
    [url, handleSave]
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const pastedText = e.clipboardData.getData("text").trim();

      if (
        pastedText &&
        (pastedText.startsWith("http://") ||
          pastedText.startsWith("https://") ||
          pastedText.includes("."))
      ) {
        e.preventDefault();
        setUrl(pastedText);
        await handleSave(pastedText);
      }
    },
    [handleSave]
  );

  const feedbackColors: Record<string, { bg: string; text: string }> = {
    success: {
      bg: "rgba(52, 199, 89, 0.08)",
      text: "var(--color-success, #34c759)",
    },
    info: {
      bg: "rgba(0, 113, 227, 0.08)",
      text: "var(--color-accent, #0071e3)",
    },
    error: {
      bg: "rgba(255, 59, 48, 0.08)",
      text: "var(--color-unread, #ff3b30)",
    },
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "4px 4px 4px 20px",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 14,
            transition: "border-color 0.2s",
          }}
        >
          <span
            style={{
              fontSize: 18,
              color: "var(--color-text-tertiary)",
              flexShrink: 0,
            }}
          >
            +
          </span>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={handlePaste}
            placeholder="Paste any URL — article, tweet, video, website..."
            disabled={isLoading}
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
          {(url.trim() || isLoading) && (
            <button
              type="submit"
              disabled={isLoading || !url.trim()}
              style={{
                padding: "10px 20px",
                backgroundColor: "var(--color-text)",
                color: "white",
                border: "none",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                cursor: isLoading ? "not-allowed" : "pointer",
                opacity: isLoading ? 0.6 : 1,
                letterSpacing: "-0.016em",
                whiteSpace: "nowrap",
              }}
            >
              {isLoading ? "Saving..." : "Save"}
            </button>
          )}
        </div>
      </form>

      {/* Feedback message */}
      {feedback && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 16px",
            borderRadius: 10,
            fontSize: 14,
            letterSpacing: "-0.016em",
            backgroundColor: feedbackColors[feedback.type]?.bg,
            color: feedbackColors[feedback.type]?.text,
          }}
        >
          {feedback.message}
        </div>
      )}
    </div>
  );
}
