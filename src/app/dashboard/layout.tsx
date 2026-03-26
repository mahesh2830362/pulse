import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { ServiceWorkerRegistrar } from "@/components/sw-registrar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <ServiceWorkerRegistrar />
      <Sidebar user={user} />
      <main
        style={{
          flex: 1,
          padding: "40px 48px",
          maxWidth: 960,
          position: "relative",
        }}
      >
        {/* Notification bell — top right */}
        <div
          style={{
            position: "absolute",
            top: 40,
            right: 48,
          }}
        >
          <NotificationBell />
        </div>
        {children}
      </main>
    </div>
  );
}
