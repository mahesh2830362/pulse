import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const DEFAULT_COLORS = [
  "#0071e3",
  "#ff3b30",
  "#34c759",
  "#ff9500",
  "#af52de",
  "#5856d6",
  "#ff2d55",
  "#00c7be",
  "#007aff",
  "#ff6482",
];

/**
 * POST /api/tags — Create a new tag.
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
    const { name, color } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Tag name is required" },
        { status: 400 }
      );
    }

    const cleanName = name.trim().toLowerCase().replace(/^#/, "");

    // Check for duplicate
    const { data: existing } = await supabase
      .from("tags")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", cleanName)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Tag already exists", tag: existing },
        { status: 409 }
      );
    }

    // Count existing tags to pick a color
    const { count } = await supabase
      .from("tags")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    const tagColor =
      color ?? DEFAULT_COLORS[(count ?? 0) % DEFAULT_COLORS.length];

    const { data: tag, error: insertError } = await supabase
      .from("tags")
      .insert({
        user_id: user.id,
        name: cleanName,
        color: tagColor,
      })
      .select("*")
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({ success: true, tag });
  } catch (error) {
    console.error("Error creating tag:", error);
    return NextResponse.json(
      { error: "Failed to create tag" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tags — Get all user tags.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: tags, error } = await supabase
      .from("tags")
      .select("*")
      .eq("user_id", user.id)
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ tags: tags ?? [] });
  } catch (error) {
    console.error("Error fetching tags:", error);
    return NextResponse.json(
      { error: "Failed to fetch tags" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tags — Delete a tag.
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
      return NextResponse.json({ error: "Tag ID required" }, { status: 400 });
    }

    // Remove from all bookmarks first
    await supabase.from("bookmark_tags").delete().eq("tag_id", id);

    // Delete tag
    const { error } = await supabase
      .from("tags")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting tag:", error);
    return NextResponse.json(
      { error: "Failed to delete tag" },
      { status: 500 }
    );
  }
}
