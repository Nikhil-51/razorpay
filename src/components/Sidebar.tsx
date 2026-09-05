"use client"

import Link from "next/link";
import { LayoutDashboard, FileText, AlertCircle, CheckCircle2, BarChart3, FileOutput, Settings } from "lucide-react";
import { usePathname } from "next/navigation";

export function Sidebar() {
  const pathname = usePathname();

  const links = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Reconciliation", href: "/reconciliation", icon: CheckCircle2 },
    { name: "Transactions", href: "/transactions", icon: FileText },
    { name: "Exceptions", href: "/exceptions", icon: AlertCircle },
    { name: "Metrics", href: "/metrics", icon: BarChart3 },
    { name: "Reports", href: "/reports", icon: FileOutput },
  ];

  return (
    <div className="w-64 bg-[#1f2136] border-r border-[#2a2c47] flex flex-col h-full shadow-2xl z-10">
      <div className="p-8 flex justify-center items-center">
        <h1 className="text-3xl font-extrabold tracking-widest text-white drop-shadow-md">
          R3CON
        </h1>
      </div>
      
      <nav className="flex-1 px-4 space-y-2 mt-4">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname?.startsWith(link.href);
          
          return (
            <Link
              key={link.name}
              href={link.href}
              className={`flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                isActive 
                ? "bg-[#2b2e4a] text-white shadow-inner border border-[#3b3e66]" 
                : "text-indigo-200/60 hover:text-white hover:bg-[#252840]"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-[#00e5ff]' : ''}`} />
              {link.name}
            </Link>
          );
        })}
      </nav>
      
      <div className="px-4 pb-6">
        <Link
          href="/settings"
          className="flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium text-indigo-200/60 hover:text-white hover:bg-[#252840] transition-all"
        >
          <Settings className="w-5 h-5" />
          Settings
        </Link>
      </div>
    </div>
  );
}
