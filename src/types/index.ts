export type SourceType = "rss" | "website" | "x_profile" | "youtube" | "reddit" | "generic";

export type AIProvider = "claude" | "openai" | "gemini";

export interface Source {
  readonly id: string;
  readonly user_id: string;
  readonly url: string;
  readonly type: SourceType;
  readonly name: string;
  readonly favicon_url: string | null;
  readonly check_interval_minutes: number;
  readonly is_high_priority: boolean;
  readonly is_active: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface Item {
  readonly id: string;
  readonly source_id: string | null;
  readonly url: string;
  readonly title: string;
  readonly content_snippet: string | null;
  readonly author: string | null;
  readonly published_at: string | null;
  readonly image_url: string | null;
  readonly content_hash: string;
  readonly raw_metadata: Record<string, unknown>;
  readonly created_at: string;
}

export interface Bookmark {
  readonly id: string;
  readonly user_id: string;
  readonly item_id: string;
  readonly notes: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly item?: Item;
  readonly tags?: Tag[];
}

export interface Tag {
  readonly id: string;
  readonly user_id: string;
  readonly name: string;
  readonly color: string;
  readonly created_at: string;
}

export interface BookmarkTag {
  readonly bookmark_id: string;
  readonly tag_id: string;
}

export interface FeedState {
  readonly source_id: string;
  readonly last_checked_at: string | null;
  readonly last_content_hash: string | null;
  readonly etag: string | null;
}

export interface UserFeedItem {
  readonly user_id: string;
  readonly item_id: string;
  readonly is_read: boolean;
  readonly created_at: string;
}

export interface AIProviderConfig {
  readonly provider: AIProvider;
  readonly apiKey: string;
  readonly model?: string;
}
