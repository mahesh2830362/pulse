"use client";

import { useState, useEffect, useCallback } from "react";

interface AISettings {
  ai_provider: string;
  ai_api_key_masked: string | null;
  ai_model: string | null;
  isConfigured: boolean;
}

const PROVIDERS = [
  { value: "claude", label: "Claude (Anthropic)", keyPrefix: "sk-ant-" },
  { value: "openai", label: "OpenAI", keyPrefix: "sk-" },
  { value: "gemini", label: "Gemini (Google)", keyPrefix: "" },
] as const;

const MODEL_OPTIONS: Record<string, ReadonlyArray<{ value: string; label: string }>> = {
  claude: [
    { value: "", label: "Default (Haiku — fast & cheap)" },
    { value: "claude-haiku-4-20250514", label: "Claude Haiku 4" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  ],
  openai: [
    { value: "", label: "Default (GPT-4o Mini — fast & cheap)" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "gpt-4o", label: "GPT-4o" },
  ],
  gemini: [
    { value: "", label: "Default (Gemini 1.5 Flash — fast & cheap)" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  ],
};

export default function SettingsPage() {
  // Push notifications state
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [vapidConfigured, setVapidConfigured] = useState(false);

  // AI settings state
  const [aiSettings, setAiSettings] = useState<AISettings | null>(null);
  const [selectedProvider, setSelectedProvider] = useState("claude");
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fetch AI settings
  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch("/api/settings");
      const data = await response.json();
      if (response.ok && data.settings) {
        setAiSettings(data.settings);
        setSelectedProvider(data.settings.ai_provider || "claude");
        setSelectedModel(data.settings.ai_model || "");
      }
    } catch {
      // Settings not configured yet — that's fine
    }
  }, []);

  useEffect(() => {
    fetchSettings();

    const supported =
      "serviceWorker" in navigator && "PushManager" in window;
    setPushSupported(supported);
    setVapidConfigured(!!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

    if (supported) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushEnabled(!!sub);
        });
      });
    }
  }, [fetchSettings]);

  async function handleSaveAI() {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const body: Record<string, string | null> = {
        ai_provider: selectedProvider,
        ai_model: selectedModel || null,
      };

      // Only include key if user is editing it
      if (isEditingKey && apiKey) {
        body.ai_api_key = apiKey;
      }

      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save");
      }

      setAiSettings(data.settings);
      setApiKey("");
      setIsEditingKey(false);
      setSaveMessage({ type: "success", text: "Settings saved." });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      setSaveMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save settings",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemoveKey() {
    if (!confirm("Remove your API key? Summarization will stop working.")) return;

    try {
      await fetch("/api/settings", { method: "DELETE" });
      setAiSettings((prev) =>
        prev ? { ...prev, ai_api_key_masked: null, isConfigured: false } : null
      );
      setApiKey("");
      setIsEditingKey(false);
      setSaveMessage({ type: "success", text: "API key removed." });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      setSaveMessage({ type: "error", text: "Failed to remove key." });
    }
  }

  async function handleTogglePush() {
    try {
      const registration = await navigator.serviceWorker.ready;

      if (pushEnabled) {
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/notifications/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
      } else {
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) return;

        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        });

        const subJson = sub.toJSON();
        await fetch("/api/notifications/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: {
              endpoint: subJson.endpoint,
              keys: subJson.keys,
            },
          }),
        });

        setPushEnabled(true);
      }
    } catch (error) {
      console.error("Push toggle failed:", error);
      alert("Failed to toggle push notifications.");
    }
  }

  const sectionStyle = {
    marginBottom: 40,
  };

  const sectionTitleStyle = {
    fontSize: 20,
    fontWeight: 600 as const,
    letterSpacing: "-0.02em",
    color: "var(--color-text)",
    marginBottom: 16,
  };

  const cardStyle = {
    border: "1px solid var(--color-border)",
    borderRadius: 14,
    overflow: "hidden" as const,
  };

  const rowStyle = {
    padding: "16px 20px",
    borderBottom: "1px solid rgba(0,0,0,0.04)",
  };

  const labelStyle = {
    fontSize: 15,
    fontWeight: 500 as const,
    color: "var(--color-text)",
    letterSpacing: "-0.016em",
  };

  const sublabelStyle = {
    fontSize: 13,
    color: "var(--color-text-tertiary)",
    marginTop: 2,
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            lineHeight: 1.1,
            color: "var(--color-text)",
          }}
        >
          Settings
        </h1>
        <p
          style={{
            fontSize: 17,
            color: "var(--color-text-secondary)",
            marginTop: 6,
            letterSpacing: "-0.016em",
          }}
        >
          Manage your AI provider, preferences, and notifications.
        </p>
      </div>

      {/* AI Provider section */}
      <div style={sectionStyle}>
        <h2 style={sectionTitleStyle}>AI Summarization</h2>

        <div style={cardStyle}>
          {/* Provider selector */}
          <div style={rowStyle}>
            <div style={labelStyle}>Provider</div>
            <div style={sublabelStyle}>Choose which AI service to use for summaries</div>
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" as const }}>
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => {
                    setSelectedProvider(p.value);
                    setSelectedModel("");
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 10,
                    border: "1px solid",
                    borderColor:
                      selectedProvider === p.value
                        ? "var(--color-text)"
                        : "var(--color-border)",
                    backgroundColor:
                      selectedProvider === p.value
                        ? "var(--color-text)"
                        : "transparent",
                    color:
                      selectedProvider === p.value
                        ? "white"
                        : "var(--color-text-secondary)",
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: "pointer",
                    letterSpacing: "-0.016em",
                    transition: "all 0.15s",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div style={rowStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <div style={labelStyle}>API Key</div>
                <div style={sublabelStyle}>
                  {aiSettings?.isConfigured
                    ? `Current key: ${aiSettings.ai_api_key_masked}`
                    : "Add your API key to enable summarization"}
                </div>
              </div>
              {aiSettings?.isConfigured && !isEditingKey && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setIsEditingKey(true)}
                    style={{
                      padding: "6px 14px",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--color-accent)",
                      backgroundColor: "var(--color-accent-light, rgba(0,113,227,0.08))",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      letterSpacing: "-0.016em",
                    }}
                  >
                    Change
                  </button>
                  <button
                    onClick={handleRemoveKey}
                    style={{
                      padding: "6px 14px",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--color-unread, #ff3b30)",
                      backgroundColor: "rgba(255,59,48,0.08)",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      letterSpacing: "-0.016em",
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {(!aiSettings?.isConfigured || isEditingKey) && (
              <div style={{ marginTop: 10 }}>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    PROVIDERS.find((p) => p.value === selectedProvider)?.keyPrefix
                      ? `${PROVIDERS.find((p) => p.value === selectedProvider)?.keyPrefix}...`
                      : "Enter your API key"
                  }
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    fontSize: 14,
                    border: "1px solid var(--color-border)",
                    borderRadius: 10,
                    outline: "none",
                    backgroundColor: "var(--color-surface, white)",
                    color: "var(--color-text)",
                    letterSpacing: "-0.016em",
                    fontFamily: "monospace",
                    boxSizing: "border-box" as const,
                  }}
                />
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-tertiary)",
                    marginTop: 6,
                    lineHeight: 1.4,
                  }}
                >
                  {selectedProvider === "claude" && (
                    <>Get your key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)" }}>console.anthropic.com</a></>
                  )}
                  {selectedProvider === "openai" && (
                    <>Get your key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)" }}>platform.openai.com</a></>
                  )}
                  {selectedProvider === "gemini" && (
                    <>Get your key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)" }}>aistudio.google.com</a></>
                  )}
                  {" "}&mdash; your key is stored securely and never shared.
                </div>
              </div>
            )}
          </div>

          {/* Model selector */}
          <div style={rowStyle}>
            <div style={labelStyle}>Model</div>
            <div style={sublabelStyle}>Choose speed vs quality for summaries</div>
            <div style={{ marginTop: 10 }}>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  fontSize: 14,
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  outline: "none",
                  backgroundColor: "var(--color-surface, white)",
                  color: "var(--color-text)",
                  letterSpacing: "-0.016em",
                  cursor: "pointer",
                  appearance: "none" as const,
                  WebkitAppearance: "none" as const,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2386868b' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 14px center",
                  paddingRight: 36,
                }}
              >
                {(MODEL_OPTIONS[selectedProvider] ?? []).map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Save button */}
          <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={handleSaveAI}
              disabled={isSaving}
              style={{
                padding: "10px 24px",
                fontSize: 14,
                fontWeight: 600,
                color: "white",
                backgroundColor: "var(--color-text)",
                border: "none",
                borderRadius: 10,
                cursor: isSaving ? "not-allowed" : "pointer",
                opacity: isSaving ? 0.6 : 1,
                letterSpacing: "-0.016em",
                transition: "opacity 0.15s",
              }}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>

            {isEditingKey && (
              <button
                onClick={() => {
                  setIsEditingKey(false);
                  setApiKey("");
                }}
                style={{
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--color-text-secondary)",
                  backgroundColor: "transparent",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  cursor: "pointer",
                  letterSpacing: "-0.016em",
                }}
              >
                Cancel
              </button>
            )}

            {saveMessage && (
              <span
                style={{
                  fontSize: 14,
                  color:
                    saveMessage.type === "success"
                      ? "var(--color-success, #34c759)"
                      : "var(--color-unread, #ff3b30)",
                  letterSpacing: "-0.016em",
                }}
              >
                {saveMessage.text}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Notifications section */}
      <div style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Notifications</h2>

        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              ...rowStyle,
            }}
          >
            <div>
              <div style={labelStyle}>Push Notifications</div>
              <div style={sublabelStyle}>
                {!pushSupported
                  ? "Not supported in this browser"
                  : !vapidConfigured
                    ? "Add VAPID keys to .env.local to enable"
                    : pushEnabled
                      ? "Receiving alerts for high-priority sources"
                      : "Enable to get alerts when new content arrives"}
              </div>
            </div>
            <button
              onClick={handleTogglePush}
              disabled={!pushSupported || !vapidConfigured}
              style={{
                width: 48,
                height: 28,
                borderRadius: 14,
                border: "none",
                cursor:
                  pushSupported && vapidConfigured ? "pointer" : "not-allowed",
                backgroundColor: pushEnabled
                  ? "var(--color-success, #34c759)"
                  : "rgba(0,0,0,0.12)",
                position: "relative" as const,
                transition: "background 0.2s",
                opacity: pushSupported && vapidConfigured ? 1 : 0.4,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  backgroundColor: "white",
                  position: "absolute" as const,
                  top: 3,
                  left: pushEnabled ? 23 : 3,
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                }}
              />
            </button>
          </div>

          <div style={{ padding: "16px 20px" }}>
            <div style={labelStyle}>How it works</div>
            <div
              style={{
                fontSize: 13,
                color: "var(--color-text-tertiary)",
                marginTop: 6,
                lineHeight: 1.6,
              }}
            >
              1. Mark sources as high-priority (star icon on Sources page)
              <br />
              2. Enable push notifications above
              <br />
              3. When those sources publish new content, you will get a push alert
              <br />
              4. All notifications also appear in the bell icon dropdown
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
