import { createClient } from "@/lib/supabase/server";
import { summarize } from "@/lib/ai/provider";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/summarize — Summarize an item's content.
 * Uses the user's configured AI provider and API key.
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
    const { itemId } = body;

    if (!itemId) {
      return NextResponse.json(
        { error: "itemId is required" },
        { status: 400 }
      );
    }

    // Fetch the item
    const { data: item, error: fetchError } = await supabase
      .from("items")
      .select("*")
      .eq("id", itemId)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // If already summarized, return existing summary
    if (item.summary) {
      return NextResponse.json({ summary: item.summary });
    }

    // Get content to summarize
    const textToSummarize =
      (item.raw_metadata as Record<string, unknown>)?.fullContent as string ??
      item.content_snippet ??
      item.title;

    if (!textToSummarize) {
      return NextResponse.json(
        { error: "No content available to summarize" },
        { status: 400 }
      );
    }

    // Summarize using the user's configured AI provider
    const summary = await summarize(textToSummarize, user.id);

    // Store the summary (only if it's a real summary, not the "not configured" message)
    if (!summary.includes("not configured")) {
      await supabase
        .from("items")
        .update({ summary })
        .eq("id", itemId);
    }

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Error summarizing:", error);

    const message = error instanceof Error ? error.message : "Failed to summarize";

    // Provide user-friendly error messages for common API errors
    if (message.includes("401") || message.includes("Unauthorized") || message.includes("invalid")) {
      return NextResponse.json(
        { error: "Invalid API key. Please check your key in Settings." },
        { status: 400 }
      );
    }

    if (message.includes("429") || message.includes("rate")) {
      return NextResponse.json(
        { error: "Rate limit reached. Please try again in a moment." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Failed to summarize. Check your API key in Settings." },
      { status: 500 }
    );
  }
}
