import { createAdminClient } from "@/lib/supabase/admin";
import { fetchFeed } from "@/lib/monitor/rss";
import { checkPageChange } from "@/lib/monitor/page";
import { sendPushNotification } from "@/lib/notifications/push";
import type { PushSubscriptionData } from "@/lib/notifications/push";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/sources/poll — Vercel Cron handler (every 5 minutes).
 * Also supports POST for manual triggering.
 * Uses admin client since cron jobs have no user session/cookies.
 */
export async function GET(request: Request) {
  return pollSources(request);
}

export async function POST(request: Request) {
  return pollSources(request);
}

async function pollSources(request: Request) {
  try {
    // Verify authorization: Vercel Cron sends CRON_SECRET header automatically
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Allow if: Vercel cron (no secret needed on Vercel), secret matches, or no secret set (dev)
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Find all active sources due for checking
    const { data: sources, error: sourcesError } = await supabase
      .from("sources")
      .select("*, feed_states(*)")
      .eq("is_active", true)
      .gt("check_interval_minutes", 0);

    if (sourcesError) {
      throw sourcesError;
    }

    const now = new Date();
    const results: Array<{
      sourceId: string;
      sourceName: string;
      newItems: number;
      error?: string;
    }> = [];

    for (const source of sources ?? []) {
      const feedState = source.feed_states?.[0];
      const lastChecked = feedState?.last_checked_at
        ? new Date(feedState.last_checked_at)
        : null;

      // Skip if not due yet
      if (lastChecked) {
        const minutesSince =
          (now.getTime() - lastChecked.getTime()) / 60000;
        if (minutesSince < source.check_interval_minutes) {
          continue;
        }
      }

      try {
        if (source.feed_url) {
          // RSS/Atom feed polling
          const feedResult = await fetchFeed(
            source.feed_url,
            feedState?.etag,
            null
          );

          if (feedResult === null) {
            // 304 Not Modified — update check time only
            await supabase
              .from("feed_states")
              .update({ last_checked_at: now.toISOString() })
              .eq("source_id", source.id);

            results.push({
              sourceId: source.id,
              sourceName: source.name,
              newItems: 0,
            });
            continue;
          }

          let newItemCount = 0;

          for (const feedItem of feedResult.items) {
            // Check for duplicate
            const { data: existing } = await supabase
              .from("items")
              .select("id")
              .eq("content_hash", feedItem.contentHash)
              .single();

            if (!existing) {
              // Insert new item
              const { data: newItem } = await supabase
                .from("items")
                .insert({
                  source_id: source.id,
                  url: feedItem.url,
                  title: feedItem.title,
                  content_snippet: feedItem.contentSnippet,
                  author: feedItem.author,
                  published_at: feedItem.publishedAt,
                  image_url: feedItem.imageUrl,
                  content_hash: feedItem.contentHash,
                  raw_metadata: { feedTitle: feedResult.feedTitle },
                })
                .select("id")
                .single();

              if (newItem) {
                // Add to all users who follow this source
                await supabase.from("user_feed_items").insert({
                  user_id: source.user_id,
                  item_id: newItem.id,
                  is_read: false,
                });
                newItemCount++;

                // Create in-app notification for high-priority sources
                if (source.is_high_priority) {
                  await supabase.from("notifications").insert({
                    user_id: source.user_id,
                    title: `New from ${source.name}`,
                    body: feedItem.title,
                    url: feedItem.url,
                    is_read: false,
                  });

                  // Send push notification
                  const { data: subs } = await supabase
                    .from("push_subscriptions")
                    .select("endpoint, p256dh, auth")
                    .eq("user_id", source.user_id);

                  if (subs) {
                    for (const sub of subs) {
                      await sendPushNotification(
                        {
                          endpoint: sub.endpoint,
                          keys: { p256dh: sub.p256dh, auth: sub.auth },
                        } as PushSubscriptionData,
                        {
                          title: `New from ${source.name}`,
                          body: feedItem.title,
                          url: feedItem.url,
                          tag: `pulse-${source.id}`,
                        }
                      );
                    }
                  }
                }
              }
            }
          }

          // Update feed state
          await supabase
            .from("feed_states")
            .update({
              last_checked_at: now.toISOString(),
              etag: feedResult.etag,
              last_content_hash: null,
            })
            .eq("source_id", source.id);

          results.push({
            sourceId: source.id,
            sourceName: source.name,
            newItems: newItemCount,
          });
        } else if (source.type === "website") {
          // Page change detection
          const pageResult = await checkPageChange(
            source.url,
            feedState?.last_content_hash ?? null
          );

          if (pageResult.hasChanged || !feedState?.last_content_hash) {
            // Only create item if content actually changed (not first check)
            if (pageResult.hasChanged) {
              const contentHash = pageResult.newHash;

              const { data: existing } = await supabase
                .from("items")
                .select("id")
                .eq("content_hash", contentHash)
                .single();

              if (!existing) {
                const { data: newItem } = await supabase
                  .from("items")
                  .insert({
                    source_id: source.id,
                    url: source.url,
                    title: `Updated: ${pageResult.title ?? source.name}`,
                    content_snippet: pageResult.contentSnippet,
                    author: null,
                    published_at: now.toISOString(),
                    image_url: pageResult.imageUrl,
                    content_hash: contentHash,
                    raw_metadata: { changeDetected: true },
                  })
                  .select("id")
                  .single();

                if (newItem) {
                  await supabase.from("user_feed_items").insert({
                    user_id: source.user_id,
                    item_id: newItem.id,
                    is_read: false,
                  });
                }
              }
            }

            // Update hash
            await supabase
              .from("feed_states")
              .update({
                last_checked_at: now.toISOString(),
                last_content_hash: pageResult.newHash,
              })
              .eq("source_id", source.id);

            results.push({
              sourceId: source.id,
              sourceName: source.name,
              newItems: pageResult.hasChanged ? 1 : 0,
            });
          } else {
            await supabase
              .from("feed_states")
              .update({ last_checked_at: now.toISOString() })
              .eq("source_id", source.id);

            results.push({
              sourceId: source.id,
              sourceName: source.name,
              newItems: 0,
            });
          }
        }
      } catch (error) {
        results.push({
          sourceId: source.id,
          sourceName: source.name,
          newItems: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const totalNew = results.reduce((sum, r) => sum + r.newItems, 0);

    return NextResponse.json({
      success: true,
      sourcesChecked: results.length,
      totalNewItems: totalNew,
      results,
    });
  } catch (error) {
    console.error("Poll error:", error);
    return NextResponse.json(
      { error: "Poll failed" },
      { status: 500 }
    );
  }
}
