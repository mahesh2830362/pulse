"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface SearchResultItem {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly content_snippet: string | null;
  readonly author: string | null;
  readonly published_at: string | null;
  readonly image_url: string | null;
  readonly summary: string | null;
  readonly is_read: boolean;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function highlightMatch(text: string, query: string): string {
  if (!query || !text) return text;
  // Escape regex special chars
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(
    new RegExp(`(${escaped})`, "gi"),
    "\u00AB$1\u00BB"
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReadonlyArray<SearchResultItem>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setHasSearched(true);

    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(trimmed)}&limit=30`
      );
      const data = await response.json();

      if (response.ok) {
        setResults(data.items ?? []);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        performSearch(value);
      }, 350);
    },
    [performSearch]
  );

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

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
          Search
        </h1>
        <p
          style={{
            fontSize: 17,
            color: "var(--color-text-secondary)",
            marginTop: 6,
            letterSpacing: "-0.016em",
          }}
        >
          Find articles, tweets, and posts across all your content.
        </p>
      </div>

      {/* Search input */}
      <div
        style={{
          marginBottom: 28,
          padding: "14px 18px",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 14,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          style={{ fontSize: 18, color: "var(--color-text-tertiary)" }}
        >
          {"\u2315"}
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Search by title, content, or author..."
          autoFocus
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            background: "none",
            fontSize: 16,
            color: "var(--color-text)",
            letterSpacing: "-0.016em",
          }}
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
              setHasSearched(false);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              color: "var(--color-text-tertiary)",
              padding: 4,
            }}
          >
            {"\u2715"}
          </button>
        )}
      </div>

      {/* Results */}
      {isLoading ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 0",
            color: "var(--color-text-tertiary)",
            fontSize: 15,
          }}
        >
          Searching...
        </div>
      ) : hasSearched && results.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "80px 24px",
            color: "var(--color-text-secondary)",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>
            {"\u2315"}
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
            No results found
          </h2>
          <p
            style={{
              fontSize: 15,
              maxWidth: 360,
              margin: "0 auto",
              lineHeight: 1.5,
            }}
          >
            Try a different search term or check the spelling.
          </p>
        </div>
      ) : !hasSearched ? (
        <div
          style={{
            textAlign: "center",
            padding: "80px 24px",
            color: "var(--color-text-secondary)",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>
            {"\u2315"}
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.5 }}>
            Type at least 2 characters to search.
          </p>
        </div>
      ) : (
        <div>
          <div
            style={{
              fontSize: 13,
              color: "var(--color-text-tertiary)",
              marginBottom: 16,
              letterSpacing: "-0.016em",
            }}
          >
            {results.length} result{results.length === 1 ? "" : "s"}
          </div>

          {results.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                gap: 12,
                padding: "16px 0",
                borderBottom: "1px solid var(--color-border)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              {/* Thumbnail */}
              {item.image_url ? (
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    overflow: "hidden",
                    flexShrink: 0,
                    backgroundColor: "var(--color-hover)",
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
              ) : (
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    backgroundColor: "var(--color-hover)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    flexShrink: 0,
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  {"\u2630"}
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
                    whiteSpace: "nowrap",
                  }}
                >
                  {highlightMatch(item.title, query)
                    .split(/\u00AB|\u00BB/)
                    .map((part, i) =>
                      i % 2 === 1 ? (
                        <mark
                          key={i}
                          style={{
                            backgroundColor: "var(--color-accent-light)",
                            color: "var(--color-accent)",
                            padding: "0 2px",
                            borderRadius: 3,
                          }}
                        >
                          {part}
                        </mark>
                      ) : (
                        <span key={i}>{part}</span>
                      )
                    )}
                </div>

                {item.content_snippet && (
                  <div
                    style={{
                      fontSize: 14,
                      lineHeight: 1.5,
                      color: "var(--color-text-secondary)",
                      marginTop: 3,
                      letterSpacing: "-0.016em",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.content_snippet.slice(0, 150)}
                  </div>
                )}

                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-tertiary)",
                    marginTop: 4,
                    letterSpacing: "-0.016em",
                  }}
                >
                  {item.author && <span>{item.author}</span>}
                  {item.author && item.published_at && " \u2022 "}
                  {item.published_at && (
                    <span>{formatDate(item.published_at)}</span>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
