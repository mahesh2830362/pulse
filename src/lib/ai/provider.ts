import type { AIProvider, AIProviderConfig } from "@/types";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_MODELS: Record<AIProvider, string> = {
  claude: "claude-haiku-4-20250514",
  openai: "gpt-4o-mini",
  gemini: "gemini-1.5-flash",
};

const API_URLS: Record<AIProvider, string> = {
  claude: "https://api.anthropic.com/v1/messages",
  openai: "https://api.openai.com/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/models",
};

/**
 * Get AI config from environment variables (fallback).
 */
export function getAIConfigFromEnv(): AIProviderConfig {
  const provider = (process.env.AI_PROVIDER || "claude") as AIProvider;
  const apiKey = process.env.AI_API_KEY || "";
  const model = process.env.AI_MODEL || DEFAULT_MODELS[provider];

  return { provider, apiKey, model };
}

/**
 * Get AI config for a specific user.
 * Priority: user's stored settings > environment variables.
 */
export async function getAIConfigForUser(userId: string): Promise<AIProviderConfig> {
  try {
    const supabase = await createClient();

    const { data: settings } = await supabase
      .from("user_settings")
      .select("ai_provider, ai_api_key, ai_model")
      .eq("user_id", userId)
      .single();

    if (settings?.ai_api_key) {
      const provider = (settings.ai_provider || "claude") as AIProvider;
      return {
        provider,
        apiKey: settings.ai_api_key,
        model: settings.ai_model || DEFAULT_MODELS[provider],
      };
    }
  } catch {
    // Fall through to env config
  }

  // Fallback to environment variables
  return getAIConfigFromEnv();
}

/**
 * Summarize text using the user's configured AI provider.
 */
export async function summarize(text: string, userId?: string): Promise<string> {
  const config = userId
    ? await getAIConfigForUser(userId)
    : getAIConfigFromEnv();

  if (!config.apiKey) {
    return "AI summarization not configured. Add your API key in Settings.";
  }

  const prompt = `Summarize the following article in 2-3 concise sentences. Focus on the key takeaways:\n\n${text.slice(0, 4000)}`;

  switch (config.provider) {
    case "claude":
      return summarizeWithClaude(prompt, config);
    case "openai":
      return summarizeWithOpenAI(prompt, config);
    case "gemini":
      return summarizeWithGemini(prompt, config);
    default:
      return "Unsupported AI provider.";
  }
}

async function summarizeWithClaude(
  prompt: string,
  config: AIProviderConfig
): Promise<string> {
  const response = await fetch(API_URLS.claude, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

async function summarizeWithOpenAI(
  prompt: string,
  config: AIProviderConfig
): Promise<string> {
  const response = await fetch(API_URLS.openai, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function summarizeWithGemini(
  prompt: string,
  config: AIProviderConfig
): Promise<string> {
  const url = `${API_URLS.gemini}/${config.model}:generateContent?key=${config.apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 300 },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}
