import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { ServiceWorkerRegistrar } from "@/components/sw-registrar";
import { MobileNav } from "@/components/mobile-nav";

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
    <>
      <ServiceWorkerRegistrar />

      {/* Desktop layout */}
      <div className="desktop-layout">
        <Sidebar user={user} />
        <main className="desktop-main">
          <div className="notification-bell-wrapper">
            <NotificationBell />
          </div>
          {children}
        </main>
      </div>

      {/* Mobile layout */}
      <div className="mobile-layout">
        <header className="mobile-header">
          <span className="mobile-logo">Pulse</span>
          <NotificationBell />
        </header>
        <main className="mobile-main">
          {children}
        </main>
        <MobileNav />
      </div>
    </>
  );
}
