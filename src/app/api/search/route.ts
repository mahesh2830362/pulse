import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/search?q=<query> — Search items by title, content_snippet, and author.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "30"),
      100
    );
    const offset = parseInt(searchParams.get("offset") ?? "0");

    if (!query || query.length < 2) {
      return NextResponse.json({ items: [] });
    }

    // Get user's feed item IDs first
    const { data: feedItemIds, error: feedError } = await supabase
      .from("user_feed_items")
      .select("item_id, is_read")
      .eq("user_id", user.id);

    if (feedError) {
      throw feedError;
    }

    const feedMap = new Map(
      (feedItemIds ?? []).map((f) => [f.item_id, f.is_read])
    );
    const itemIds = Array.from(feedMap.keys());

    if (itemIds.length === 0) {
      return NextResponse.json({ items: [] });
    }

    // Search across title, content_snippet, and author using ilike
    const searchPattern = `%${query}%`;

    const { data, error } = await supabase
      .from("items")
      .select(
        "id, url, title, content_snippet, author, published_at, image_url, summary"
      )
      .in("id", itemIds)
      .or(
        `title.ilike.${searchPattern},content_snippet.ilike.${searchPattern},author.ilike.${searchPattern}`
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    const items = (data ?? []).map((item) => ({
      ...item,
      is_read: feedMap.get(item.id) ?? false,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error searching items:", error);
    return NextResponse.json(
      { error: "Failed to search items" },
      { status: 500 }
    );
  }
}
