import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
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
      <div style={{ textAlign: "center", maxWidth: 560 }}>
        <h1
          style={{
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
            color: "var(--color-text)",
            marginBottom: 16,
          }}
        >
          Pulse
        </h1>
        <p
          style={{
            fontSize: 21,
            fontWeight: 400,
            color: "var(--color-text-secondary)",
            lineHeight: 1.4,
            letterSpacing: "-0.016em",
            marginBottom: 40,
          }}
        >
          Never miss a thing. Monitor news, articles, tweets, and any source —
          all in one clean feed.
        </p>
        <Link
          href="/auth/login"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "14px 32px",
            backgroundColor: "var(--color-text)",
            color: "white",
            fontSize: 17,
            fontWeight: 500,
            borderRadius: 980,
            letterSpacing: "-0.016em",
            transition: "opacity 0.2s",
          }}
        >
          Get started
        </Link>
        <p
          style={{
            marginTop: 16,
            fontSize: 14,
            color: "var(--color-text-tertiary)",
          }}
        >
          Free for personal use
        </p>
      </div>
    </main>
  );
}
