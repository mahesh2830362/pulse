import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const checks: Record<string, unknown> = {
    nodeVersion: process.version,
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseUrlPrefix: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30) ?? "NOT SET",
  };

  // Test imports one by one
  try {
    const { createServerClient } = await import("@supabase/ssr");
    checks.supabaseSsr = "OK";
  } catch (e) {
    checks.supabaseSsr = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    checks.supabaseJs = "OK";
  } catch (e) {
    checks.supabaseJs = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  try {
    const SHA256 = (await import("crypto-js/sha256")).default;
    const hash = SHA256("test").toString();
    checks.cryptoJs = `OK (hash=${hash.slice(0, 10)})`;
  } catch (e) {
    checks.cryptoJs = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  try {
    const { detectUrlType } = await import("@/lib/extractor/detect");
    const result = detectUrlType("https://www.theverge.com/tech");
    checks.detectUrl = `OK (type=${result.type}, isSource=${result.isSource})`;
  } catch (e) {
    checks.detectUrl = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  try {
    const { discoverFeedUrl } = await import("@/lib/monitor/rss");
    checks.rssImport = "OK";
  } catch (e) {
    checks.rssImport = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json(checks, { status: 200 });
}
// trigger deploy 1774628581
