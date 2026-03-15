"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Radio, Users, ShieldAlert,
  Star, DollarSign, BarChart2, Building2, Settings, Brain,
} from "lucide-react";

const nav = [
  { href: "/",            label: "Overview",     icon: LayoutDashboard },
  { href: "/streams",     label: "Streams",      icon: Radio },
  { href: "/users",       label: "Users",        icon: Users },
  { href: "/moderation",  label: "Moderation",   icon: ShieldAlert },
  { href: "/creators",    label: "Creators",     icon: Star },
  { href: "/revenue",     label: "Revenue",      icon: DollarSign },
  { href: "/analytics",   label: "Analytics",    icon: BarChart2 },
  { href: "/agencies",    label: "Agencies",     icon: Building2 },
  { href: "/ghostbrain",  label: "GhostBrain",   icon: Brain },
  { href: "/settings",    label: "Settings",     icon: Settings },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="w-56 bg-dark-card border-r border-dark-border flex flex-col shrink-0">
      <div className="p-5 border-b border-dark-border">
        <span className="text-lg font-bold text-brand-purple">LitVybzLive</span>
        <p className="text-xs text-gray-500 mt-0.5">GhostL3 Admin</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
              path === href
                ? "bg-brand-purple text-white"
                : "text-gray-400 hover:text-white hover:bg-dark-border",
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-dark-border text-xs text-gray-600">
        GhostChain L3 · chain 903
      </div>
    </aside>
  );
}
