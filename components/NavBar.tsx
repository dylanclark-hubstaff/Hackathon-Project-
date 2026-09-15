"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function NavBar({ userName, role }: { userName: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const links = [
    { href: "/accounts", label: role === "partner_manager" ? "Partners" : "Customers" },
    { href: "/settings", label: "Settings" },
  ];

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/accounts" className="text-sm font-semibold text-slate-900">
            Partner Sequencer
          </Link>
          <nav className="flex gap-4">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`text-sm ${
                  pathname.startsWith(l.href)
                    ? "font-medium text-brand-600"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>{userName}</span>
          <button onClick={handleSignOut} className="text-slate-500 hover:text-slate-900">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
