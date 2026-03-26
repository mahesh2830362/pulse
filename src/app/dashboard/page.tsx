import { createClient } from "@/lib/supabase/server";
import { Feed } from "@/components/feed";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] ?? "there";

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
          Hey {firstName}
        </h1>
        <p
          style={{
            fontSize: 17,
            color: "var(--color-text-secondary)",
            marginTop: 6,
            letterSpacing: "-0.016em",
          }}
        >
          Here&apos;s what&apos;s new from your sources.
        </p>
      </div>

      {/* Feed with paste bar, filters, and items */}
      <Feed />
    </div>
  );
}
