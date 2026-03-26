import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * PATCH /api/items/read — Mark items as read/unread
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
    const { itemId, isRead } = body;

    if (!itemId || typeof isRead !== "boolean") {
      return NextResponse.json(
        { error: "itemId and isRead are required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("user_feed_items")
      .update({ is_read: isRead })
      .eq("user_id", user.id)
      .eq("item_id", itemId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating read state:", error);
    return NextResponse.json(
      { error: "Failed to update read state" },
      { status: 500 }
    );
  }
}
