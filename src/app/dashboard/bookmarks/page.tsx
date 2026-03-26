"use client";

import { useState, useEffect, useCallback } from "react";
import { downloadBookmarksAsJson } from "@/lib/export-bookmarks";

interface TagData {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

interface BookmarkItem {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly content_snippet: string | null;
  readonly author: string | null;
  readonly published_at: string | null;
  readonly image_url: string | null;
  readonly summary: string | null;
  readonly raw_metadata: Record<string, unknown>;
}

interface BookmarkData {
  readonly id: string;
  readonly notes: string | null;
  readonly created_at: string;
  readonly item: BookmarkItem;
  readonly tags: ReadonlyArray<TagData>;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<BookmarkData[]>([]);
  const [tags, setTags] = useState<TagData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesText, setNotesText] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  const fetchBookmarks = useCallback(async () => {
    try {
      let url = "/api/bookmarks?limit=100";
      if (activeTag) url += `&tag=${activeTag}`;
      if (searchQuery) url += `&q=${encodeURIComponent(searchQuery)}`;

      const response = await fetch(url);
      const data = await response.json();
      if (response.ok) {
        setBookmarks(data.bookmarks ?? []);
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  }, [activeTag, searchQuery]);

  const fetchTags = useCallback(async () => {
    try {
      const response = await fetch("/api/tags");
      const data = await response.json();
      if (response.ok) {
        setTags(data.tags ?? []);
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    fetchBookmarks();
    fetchTags();
  }, [fetchBookmarks, fetchTags]);

  async function handleRemoveBookmark(bookmarkId: string) {
    setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));

    try {
      await fetch(`/api/bookmarks?id=${bookmarkId}`, { method: "DELETE" });
    } catch {
      fetchBookmarks();
    }
  }

  async function handleSaveNotes(bookmarkId: string) {
    try {
      await fetch("/api/bookmarks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: bookmarkId, notes: notesText }),
      });

      setBookmarks((prev) =>
        prev.map((b) =>
          b.id === bookmarkId ? { ...b, notes: notesText } : b
        )
      );
      setEditingNotes(null);
    } catch {
      // Silently fail
    }
  }

  async function handleToggleTag(bookmarkId: string, tagId: string) {
    const bookmark = bookmarks.find((b) => b.id === bookmarkId);
    if (!bookmark) return;

    const hasTag = bookmark.tags.some((t) => t.id === tagId);
    const newTagIds = hasTag
      ? bookmark.tags.filter((t) => t.id !== tagId).map((t) => t.id)
      : [...bookmark.tags.map((t) => t.id), tagId];

    // Optimistic update
    const newTags = hasTag
      ? bookmark.tags.filter((t) => t.id !== tagId)
      : [...bookmark.tags, tags.find((t) => t.id === tagId)!];

    setBookmarks((prev) =>
      prev.map((b) =>
        b.id === bookmarkId ? { ...b, tags: newTags } : b
      )
    );

    try {
      await fetch("/api/bookmarks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: bookmarkId, tagIds: newTagIds }),
      });
    } catch {
      fetchBookmarks();
    }
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    setIsCreatingTag(true);

    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim() }),
      });

      if (response.ok) {
        setNewTagName("");
        fetchTags();
      }
    } catch {
      // Silently fail
    } finally {
      setIsCreatingTag(false);
    }
  }

  async function handleDeleteTag(tagId: string) {
    if (!confirm("Delete this tag? It will be removed from all bookmarks.")) return;

    setTags((prev) => prev.filter((t) => t.id !== tagId));
    if (activeTag === tagId) setActiveTag(null);

    try {
      await fetch(`/api/tags?id=${tagId}`, { method: "DELETE" });
      fetchBookmarks();
    } catch {
      fetchTags();
    }
  }

  return (
    <div>
      {/* Header */}
      <div
        style={{
          marginBottom: 32,
          display: "flex",
          alignItems: "start",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
              color: "var(--color-text)",
            }}
          >
            Bookmarks
          </h1>
          <p
            style={{
              fontSize: 17,
              color: "var(--color-text-secondary)",
              marginTop: 6,
              letterSpacing: "-0.016em",
            }}
          >
            Your saved articles, tweets, and posts.
          </p>
        </div>
        {bookmarks.length > 0 && (
          <button
            onClick={() => downloadBookmarksAsJson(bookmarks)}
            title="Export bookmarks as JSON"
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--color-accent)",
              backgroundColor: "var(--color-accent-light)",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              letterSpacing: "-0.016em",
              whiteSpace: "nowrap",
              marginTop: 6,
            }}
          >
            {"\u2B07"} Export JSON
          </button>
        )}
      </div>

      {/* Search */}
      <div
        style={{
          marginBottom: 20,
          padding: "10px 16px",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 12,
        }}
      >
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search bookmarks..."
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            background: "none",
            fontSize: 15,
            color: "var(--color-text)",
            letterSpacing: "-0.016em",
          }}
        />
      </div>

      {/* Tags bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setActiveTag(null)}
          style={{
            padding: "5px 14px",
            borderRadius: 20,
            border: "none",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            letterSpacing: "-0.016em",
            backgroundColor: activeTag === null ? "var(--color-text)" : "rgba(0,0,0,0.04)",
            color: activeTag === null ? "white" : "var(--color-text-secondary)",
          }}
        >
          All
        </button>

        {tags.map((tag) => (
          <div key={tag.id} style={{ position: "relative", display: "inline-flex" }}>
            <button
              onClick={() => setActiveTag(activeTag === tag.id ? null : tag.id)}
              style={{
                padding: "5px 14px",
                borderRadius: 20,
                border: "none",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                letterSpacing: "-0.016em",
                backgroundColor:
                  activeTag === tag.id
                    ? tag.color
                    : `${tag.color}15`,
                color: activeTag === tag.id ? "white" : tag.color,
              }}
            >
              #{tag.name}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteTag(tag.id);
              }}
              title="Delete tag"
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: "none",
                backgroundColor: "var(--color-text-tertiary)",
                color: "white",
                fontSize: 9,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.6,
              }}
            >
              {"\u2715"}
            </button>
          </div>
        ))}

        {/* Create tag inline */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
            placeholder="+ new tag"
            disabled={isCreatingTag}
            style={{
              width: 90,
              padding: "5px 10px",
              borderRadius: 20,
              border: "1px dashed var(--color-border)",
              fontSize: 12,
              color: "var(--color-text-secondary)",
              background: "none",
              outline: "none",
              letterSpacing: "-0.016em",
            }}
          />
        </div>
      </div>

      {/* Bookmarks list */}
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
      ) : bookmarks.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "80px 24px",
            color: "var(--color-text-secondary)",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>
            {"\u2605"}
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
            {searchQuery
              ? "No matching bookmarks"
              : activeTag
                ? "No bookmarks with this tag"
                : "No bookmarks yet"}
          </h2>
          <p style={{ fontSize: 15, maxWidth: 360, margin: "0 auto", lineHeight: 1.5 }}>
            {searchQuery || activeTag
              ? "Try a different search or tag filter."
              : "Click the bookmark button on any item in your feed to save it here."}
          </p>
        </div>
      ) : (
        <div>
          {bookmarks.map((bookmark) => {
            const item = bookmark.item;
            if (!item) return null;

            const isExpanded = expandedId === bookmark.id;
            const isEditingThisNote = editingNotes === bookmark.id;

            return (
              <div
                key={bookmark.id}
                style={{
                  padding: "18px 0",
                  borderBottom: "1px solid rgba(0,0,0,0.04)",
                }}
              >
                {/* Main row */}
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "start",
                    cursor: "pointer",
                  }}
                  onClick={() =>
                    setExpandedId(isExpanded ? null : bookmark.id)
                  }
                >
                  {/* Thumbnail or icon */}
                  {item.image_url ? (
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 8,
                        overflow: "hidden",
                        flexShrink: 0,
                        backgroundColor: "rgba(0,0,0,0.04)",
                      }}
                    >
                      <img
                        src={item.image_url}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 8,
                        backgroundColor: "rgba(0,0,0,0.04)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        flexShrink: 0,
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      {"\u2605"}
                    </div>
                  )}

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 16,
                        lineHeight: 1.3,
                        letterSpacing: "-0.02em",
                        color: "var(--color-text)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: isExpanded ? "normal" : "nowrap",
                      }}
                    >
                      {item.title}
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--color-text-tertiary)",
                        marginTop: 3,
                        letterSpacing: "-0.016em",
                      }}
                    >
                      {item.author && <span>{item.author} &bull; </span>}
                      Saved {formatDate(bookmark.created_at)}
                    </div>

                    {/* Tags */}
                    {bookmark.tags.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          gap: 4,
                          marginTop: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        {bookmark.tags.map((tag) => (
                          <span
                            key={tag.id}
                            style={{
                              padding: "2px 8px",
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 500,
                              backgroundColor: `${tag.color}15`,
                              color: tag.color,
                            }}
                          >
                            #{tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveBookmark(bookmark.id);
                    }}
                    title="Remove bookmark"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 14,
                      padding: 4,
                      color: "var(--color-text-tertiary)",
                      flexShrink: 0,
                    }}
                  >
                    {"\u2715"}
                  </button>
                </div>

                {/* Expanded view */}
                {isExpanded && (
                  <div style={{ marginTop: 14, paddingLeft: 60 }}>
                    {/* Snippet */}
                    {item.content_snippet && (
                      <p
                        style={{
                          fontSize: 14,
                          lineHeight: 1.6,
                          color: "var(--color-text-secondary)",
                          letterSpacing: "-0.016em",
                          marginBottom: 14,
                        }}
                      >
                        {item.content_snippet.slice(0, 300)}
                        {item.content_snippet.length > 300 ? "..." : ""}
                      </p>
                    )}

                    {/* Summary */}
                    {item.summary && (
                      <div
                        style={{
                          background: "rgba(0, 113, 227, 0.04)",
                          border: "1px solid rgba(0, 113, 227, 0.1)",
                          borderRadius: 10,
                          padding: "12px 14px",
                          marginBottom: 14,
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
                          }}
                        >
                          {item.summary}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    <div style={{ marginBottom: 14 }}>
                      {isEditingThisNote ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <textarea
                            value={notesText}
                            onChange={(e) => setNotesText(e.target.value)}
                            placeholder="Add your notes..."
                            rows={3}
                            style={{
                              width: "100%",
                              border: "1px solid var(--color-border)",
                              borderRadius: 10,
                              padding: "10px 12px",
                              fontSize: 14,
                              color: "var(--color-text)",
                              background: "var(--color-surface)",
                              outline: "none",
                              resize: "vertical",
                              letterSpacing: "-0.016em",
                              lineHeight: 1.5,
                            }}
                          />
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() => handleSaveNotes(bookmark.id)}
                              style={{
                                padding: "6px 14px",
                                fontSize: 13,
                                fontWeight: 500,
                                color: "white",
                                backgroundColor: "var(--color-text)",
                                border: "none",
                                borderRadius: 8,
                                cursor: "pointer",
                              }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingNotes(null)}
                              style={{
                                padding: "6px 14px",
                                fontSize: 13,
                                color: "var(--color-text-secondary)",
                                backgroundColor: "rgba(0,0,0,0.04)",
                                border: "none",
                                borderRadius: 8,
                                cursor: "pointer",
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingNotes(bookmark.id);
                            setNotesText(bookmark.notes ?? "");
                          }}
                          style={{
                            padding: "8px 12px",
                            fontSize: 13,
                            color: bookmark.notes
                              ? "var(--color-text)"
                              : "var(--color-text-tertiary)",
                            backgroundColor: "var(--color-surface)",
                            border: "1px solid var(--color-border)",
                            borderRadius: 10,
                            cursor: "pointer",
                            width: "100%",
                            textAlign: "left",
                            letterSpacing: "-0.016em",
                            lineHeight: 1.5,
                          }}
                        >
                          {bookmark.notes || "Add a note..."}
                        </button>
                      )}
                    </div>

                    {/* Tag management */}
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        marginBottom: 14,
                      }}
                    >
                      {tags.map((tag) => {
                        const isSelected = bookmark.tags.some(
                          (t) => t.id === tag.id
                        );
                        return (
                          <button
                            key={tag.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleTag(bookmark.id, tag.id);
                            }}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 16,
                              border: isSelected
                                ? "none"
                                : `1px dashed ${tag.color}40`,
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: "pointer",
                              backgroundColor: isSelected
                                ? `${tag.color}20`
                                : "transparent",
                              color: tag.color,
                              opacity: isSelected ? 1 : 0.6,
                            }}
                          >
                            {isSelected ? "\u2713 " : "+ "}#{tag.name}
                          </button>
                        );
                      })}
                    </div>

                    {/* Open original */}
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
