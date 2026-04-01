"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function BottomNav() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        // Only hide after scrolling down 10px+ to avoid jitter
        if (y > lastScrollY.current + 10) {
          setHidden(true);
        } else if (y < lastScrollY.current - 5) {
          setHidden(false);
        }
        lastScrollY.current = y;
        ticking.current = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const items = [
    { href: "/", label: "Now", icon: "⚡" },
    { href: "/groups", label: "Groups", icon: "👥" },
    { href: "/me", label: "Me", icon: "◉" },
  ];

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 h-14 bg-white border-t border-warm-gray-200 flex justify-around items-center z-50 transition-transform duration-300 ${
        hidden ? "translate-y-full" : "translate-y-0"
      }`}
    >
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
