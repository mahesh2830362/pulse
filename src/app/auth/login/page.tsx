"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleLogin() {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        setError(authError.message);
        setIsLoading(false);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 24px",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 400, width: "100%" }}>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            color: "var(--color-text)",
            marginBottom: 8,
          }}
        >
          Sign in to Pulse
        </h1>
        <p
          style={{
            fontSize: 17,
            color: "var(--color-text-secondary)",
            marginBottom: 40,
            letterSpacing: "-0.016em",
          }}
        >
          Keep everything in sync across your devices.
        </p>

        {error && (
          <div
            style={{
              padding: "12px 16px",
              backgroundColor: "rgba(255, 59, 48, 0.08)",
              border: "1px solid rgba(255, 59, 48, 0.2)",
              borderRadius: 12,
              color: "var(--color-unread)",
              fontSize: 14,
              marginBottom: 24,
              textAlign: "left",
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: "14px 24px",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            fontSize: 17,
            fontWeight: 500,
            color: "var(--color-text)",
            cursor: isLoading ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.6 : 1,
            transition: "all 0.2s",
            letterSpacing: "-0.016em",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          {isLoading ? "Signing in..." : "Continue with Google"}
        </button>

        <p
          style={{
            marginTop: 32,
            fontSize: 12,
            color: "var(--color-text-tertiary)",
            lineHeight: 1.5,
          }}
        >
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </main>
  );
}
