"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function BottomNav() {
  const pathname = usePathname();

  const items = [
    { href: "/", label: "Now", icon: "⚡" },
    { href: "/groups", label: "Groups", icon: "👥" },
    { href: "/me", label: "Me", icon: "◉" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-14 bg-white border-t border-warm-gray-200 flex justify-around items-center z-50">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center ${
              active ? "text-bark-800 font-semibold" : "text-warm-gray-400"
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            <span className="text-[10px]">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
