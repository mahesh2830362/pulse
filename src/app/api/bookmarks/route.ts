import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/bookmarks — Bookmark an item.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { itemId, notes, tagIds } = body;

    if (!itemId) {
      return NextResponse.json(
        { error: "itemId is required" },
        { status: 400 }
      );
    }

    // Check if already bookmarked
    const { data: existing } = await supabase
      .from("bookmarks")
      .select("id")
      .eq("user_id", user.id)
      .eq("item_id", itemId)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Already bookmarked", bookmarkId: existing.id },
        { status: 409 }
      );
    }

    // Create bookmark
    const { data: bookmark, error: insertError } = await supabase
      .from("bookmarks")
      .insert({
        user_id: user.id,
        item_id: itemId,
        notes: notes ?? null,
      })
      .select("*")
      .single();

    if (insertError) {
      throw insertError;
    }

    // Add tags if provided
    if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
      const bookmarkTags = tagIds.map((tagId: string) => ({
        bookmark_id: bookmark.id,
        tag_id: tagId,
      }));

      await supabase.from("bookmark_tags").insert(bookmarkTags);
    }

    return NextResponse.json({ success: true, bookmark });
  } catch (error) {
    console.error("Error creating bookmark:", error);
    return NextResponse.json(
      { error: "Failed to create bookmark" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/bookmarks — Get user's bookmarks with items and tags.
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
    const tagId = searchParams.get("tag");
    const search = searchParams.get("q");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
    const offset = parseInt(searchParams.get("offset") ?? "0");

    let query = supabase
      .from("bookmarks")
      .select(
        `
        id,
        notes,
        created_at,
        updated_at,
        items (
          id,
          url,
          title,
          content_snippet,
          author,
          published_at,
          image_url,
          summary,
          raw_metadata
        ),
        bookmark_tags (
          tags (
            id,
            name,
            color
          )
        )
      `
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // Flatten and filter
    let bookmarks = (data ?? []).map((b) => ({
      id: b.id,
      notes: b.notes,
      created_at: b.created_at,
      updated_at: b.updated_at,
      item: b.items,
      tags: (b.bookmark_tags ?? []).map((bt: Record<string, unknown>) => bt.tags as { id: string; name: string; color: string }),
    }));

    // Filter by tag if specified
    if (tagId) {
      bookmarks = bookmarks.filter((b) =>
        b.tags.some((t) => t.id === tagId)
      );
    }

    // Filter by search query
    if (search) {
      const q = search.toLowerCase();
      bookmarks = bookmarks.filter(
        (b) => {
          const item = b.item as unknown as Record<string, unknown> | null;
          return (
            (item?.title as string)?.toLowerCase().includes(q) ||
            (item?.content_snippet as string)?.toLowerCase().includes(q) ||
            b.notes?.toLowerCase().includes(q)
          );
        }
      );
    }

    return NextResponse.json({ bookmarks });
  } catch (error) {
    console.error("Error fetching bookmarks:", error);
    return NextResponse.json(
      { error: "Failed to fetch bookmarks" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/bookmarks — Update bookmark notes or tags.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, notes, tagIds } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Bookmark ID required" },
        { status: 400 }
      );
    }

    // Update notes if provided
    if (notes !== undefined) {
      const { error } = await supabase
        .from("bookmarks")
        .update({ notes, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    }

    // Replace tags if provided
    if (tagIds !== undefined && Array.isArray(tagIds)) {
      // Remove existing tags
      await supabase.from("bookmark_tags").delete().eq("bookmark_id", id);

      // Add new tags
      if (tagIds.length > 0) {
        const bookmarkTags = tagIds.map((tagId: string) => ({
          bookmark_id: id,
          tag_id: tagId,
        }));
        await supabase.from("bookmark_tags").insert(bookmarkTags);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating bookmark:", error);
    return NextResponse.json(
      { error: "Failed to update bookmark" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/bookmarks — Remove a bookmark.
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Bookmark ID required" },
        { status: 400 }
      );
    }

    // Delete bookmark_tags first
    await supabase.from("bookmark_tags").delete().eq("bookmark_id", id);

    // Delete bookmark
    const { error } = await supabase
      .from("bookmarks")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting bookmark:", error);
    return NextResponse.json(
      { error: "Failed to delete bookmark" },
      { status: 500 }
    );
  }
}
