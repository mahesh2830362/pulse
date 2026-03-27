import { createClient } from "@/lib/supabase/server";
import { detectUrlType } from "@/lib/extractor/detect";
import { discoverFeedUrl, getYouTubeFeedUrl } from "@/lib/monitor/rss";
import { NextResponse } from "next/server";

/**
 * POST /api/sources — Add a new source to monitor.
 * Auto-detects type and discovers RSS feeds.
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
    const { url, name: customName, checkIntervalMinutes, isHighPriority } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const detection = detectUrlType(url);

    // Check for duplicate source
    const { data: existing } = await supabase
      .from("sources")
      .select("id")
      .eq("user_id", user.id)
      .eq("url", detection.canonicalUrl)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Source already exists", sourceId: existing.id },
        { status: 409 }
      );
    }

    // Discover RSS feed if applicable
    let feedUrl: string | null = null;
    let sourceType = detection.type;
    let sourceName = customName ?? "";

    if (detection.type === "youtube" && detection.metadata.isChannel === "true") {
      // YouTube channel — get RSS feed
      feedUrl = await getYouTubeFeedUrl(detection.canonicalUrl);
      sourceName = sourceName || (detection.metadata.channelPath.split("/").pop() ?? "YouTube Channel");
      sourceType = "youtube";
    } else if (detection.type === "x_profile") {
      // X profile — no auto-monitoring (option C)
      sourceName = sourceName || `@${detection.metadata.username}`;
    } else if (detection.type === "rss") {
      // Direct RSS URL
      feedUrl = detection.canonicalUrl;
      sourceName = sourceName || new URL(detection.canonicalUrl).hostname;
    } else {
      // Website — try to find RSS
      feedUrl = await discoverFeedUrl(detection.canonicalUrl);

      if (feedUrl) {
        sourceType = "rss";
      } else {
        sourceType = "website";
      }

      // Get site name
      if (!sourceName) {
        try {
          const response = await fetch(detection.canonicalUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; PulseBot/1.0)" },
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) {
            const html = await response.text();
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            sourceName = titleMatch?.[1]?.trim() ?? new URL(detection.canonicalUrl).hostname;
          }
        } catch {
          sourceName = new URL(detection.canonicalUrl).hostname;
        }
      }
    }

    // Determine default check interval
    const defaultInterval =
      sourceType === "rss" || sourceType === "youtube"
        ? 10 // RSS: every 10 min
        : sourceType === "website"
          ? 10 // Page monitoring: every 10 min
          : 0; // X profiles: no auto-check (paste links manually)

    // Insert source
    const { data: source, error: insertError } = await supabase
      .from("sources")
      .insert({
        user_id: user.id,
        url: detection.canonicalUrl,
        feed_url: feedUrl,
        type: sourceType,
        name: sourceName.slice(0, 200),
        check_interval_minutes: checkIntervalMinutes ?? defaultInterval,
        is_high_priority: isHighPriority ?? false,
        is_active: true,
      })
      .select("*")
      .single();

    if (insertError) {
      throw insertError;
    }

    // Create feed_state entry for monitoring
    if (feedUrl || sourceType === "website") {
      await supabase.from("feed_states").insert({
        source_id: source.id,
        last_checked_at: null,
        last_content_hash: null,
        etag: null,
      });
    }

    return NextResponse.json({
      success: true,
      source,
      feedDiscovered: feedUrl !== null,
      monitoringType:
        feedUrl ? "rss" : sourceType === "website" ? "page" : "manual",
    });
  } catch (error) {
    console.error("Error adding source:", error);
    return NextResponse.json(
      { error: "Failed to add source" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sources — Get all user sources.
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

    const { data: sources, error } = await supabase
      .from("sources")
      .select("*, feed_states(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ sources: sources ?? [] });
  } catch (error) {
    console.error("Error fetching sources:", error);
    return NextResponse.json(
      { error: "Failed to fetch sources" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sources — Remove a source.
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
    const sourceId = searchParams.get("id");

    if (!sourceId) {
      return NextResponse.json({ error: "Source ID required" }, { status: 400 });
    }

    // Verify ownership
    const { data: source } = await supabase
      .from("sources")
      .select("id")
      .eq("id", sourceId)
      .eq("user_id", user.id)
      .single();

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    // Delete feed_state first (foreign key)
    await supabase.from("feed_states").delete().eq("source_id", sourceId);

    // Delete source
    const { error } = await supabase
      .from("sources")
      .delete()
      .eq("id", sourceId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting source:", error);
    return NextResponse.json(
      { error: "Failed to delete source" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/sources — Update source settings.
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
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Source ID required" }, { status: 400 });
    }

    // Only allow safe fields
    const allowedFields: Record<string, unknown> = {};
    if ("name" in updates) allowedFields.name = updates.name;
    if ("check_interval_minutes" in updates)
      allowedFields.check_interval_minutes = updates.check_interval_minutes;
    if ("is_high_priority" in updates)
      allowedFields.is_high_priority = updates.is_high_priority;
    if ("is_active" in updates) allowedFields.is_active = updates.is_active;

    const { data: source, error } = await supabase
      .from("sources")
      .update(allowedFields)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ source });
  } catch (error) {
    console.error("Error updating source:", error);
    return NextResponse.json(
      { error: "Failed to update source" },
      { status: 500 }
    );
  }
}
