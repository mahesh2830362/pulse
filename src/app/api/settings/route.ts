import { createClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/crypto";
import { NextResponse } from "next/server";

/**
 * GET /api/settings — Get user's AI settings (key is masked).
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

    const { data: settings } = await supabase
      .from("user_settings")
      .select("ai_provider, ai_api_key, ai_model, updated_at")
      .eq("user_id", user.id)
      .single();

    if (!settings) {
      return NextResponse.json({
        settings: {
          ai_provider: "claude",
          ai_api_key: null,
          ai_api_key_masked: null,
          ai_model: null,
          isConfigured: false,
        },
      });
    }

    // Decrypt and mask the API key — show first 8 and last 4 chars
    let masked: string | null = null;
    if (settings.ai_api_key) {
      try {
        const decrypted = decrypt(settings.ai_api_key);
        masked = maskApiKey(decrypted);
      } catch {
        // Key may be stored in plaintext from before encryption was added
        masked = maskApiKey(settings.ai_api_key);
      }
    }

    return NextResponse.json({
      settings: {
        ai_provider: settings.ai_provider,
        ai_api_key_masked: masked,
        ai_model: settings.ai_model,
        isConfigured: !!settings.ai_api_key,
        updated_at: settings.updated_at,
      },
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings — Update user's AI settings.
 */
export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { ai_provider, ai_api_key, ai_model } = body;

    // Validate provider
    const validProviders = ["claude", "openai", "gemini"];
    if (ai_provider && !validProviders.includes(ai_provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${validProviders.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate API key format (basic check)
    if (ai_api_key !== undefined && ai_api_key !== null && ai_api_key !== "") {
      if (typeof ai_api_key !== "string" || ai_api_key.length < 10) {
        return NextResponse.json(
          { error: "Invalid API key format" },
          { status: 400 }
        );
      }
    }

    // Build update object — only include fields that were provided
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (ai_provider !== undefined) updates.ai_provider = ai_provider;
    if (ai_api_key !== undefined) {
      updates.ai_api_key = ai_api_key ? encrypt(ai_api_key) : null;
    }
    if (ai_model !== undefined) updates.ai_model = ai_model || null;

    // Upsert settings
    const { error: upsertError } = await supabase
      .from("user_settings")
      .upsert(
        { user_id: user.id, ...updates },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      throw upsertError;
    }

    // Return masked key
    const maskedKey = ai_api_key ? maskApiKey(ai_api_key) : null;

    return NextResponse.json({
      success: true,
      settings: {
        ai_provider: ai_provider ?? "claude",
        ai_api_key_masked: maskedKey,
        ai_model: ai_model ?? null,
        isConfigured: !!ai_api_key,
      },
    });
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/settings — Remove user's API key.
 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await supabase
      .from("user_settings")
      .update({
        ai_api_key: null,
        ai_model: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting settings:", error);
    return NextResponse.json(
      { error: "Failed to delete settings" },
      { status: 500 }
    );
  }
}

function maskApiKey(key: string): string {
  if (key.length <= 12) return "••••••••";
  return `${key.slice(0, 8)}${"•".repeat(key.length - 12)}${key.slice(-4)}`;
}
