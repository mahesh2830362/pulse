interface ExportBookmarkItem {
  readonly title: string;
  readonly url: string;
  readonly author: string | null;
  readonly content_snippet: string | null;
  readonly summary: string | null;
}

interface ExportBookmarkTag {
  readonly name: string;
  readonly color: string;
}

interface ExportBookmark {
  readonly notes: string | null;
  readonly created_at: string;
  readonly item: ExportBookmarkItem;
  readonly tags: ReadonlyArray<ExportBookmarkTag>;
}

interface ExportPayload {
  readonly exportedAt: string;
  readonly count: number;
  readonly bookmarks: ReadonlyArray<ExportBookmark>;
}

/**
 * Downloads an array of bookmarks as a JSON file.
 * Creates a new export payload object (immutable — does not modify input).
 */
export function downloadBookmarksAsJson(
  bookmarks: ReadonlyArray<{
    readonly notes: string | null;
    readonly created_at: string;
    readonly item: {
      readonly title: string;
      readonly url: string;
      readonly author: string | null;
      readonly content_snippet: string | null;
      readonly summary: string | null;
    };
    readonly tags: ReadonlyArray<{ readonly name: string; readonly color: string }>;
  }>
): void {
  const exportData: ExportPayload = {
    exportedAt: new Date().toISOString(),
    count: bookmarks.length,
    bookmarks: bookmarks.map((b) => ({
      notes: b.notes,
      created_at: b.created_at,
      item: {
        title: b.item.title,
        url: b.item.url,
        author: b.item.author,
        content_snippet: b.item.content_snippet,
        summary: b.item.summary,
      },
      tags: b.tags.map((t) => ({ name: t.name, color: t.color })),
    })),
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `pulse-bookmarks-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();

  // Clean up
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
