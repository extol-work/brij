"use client";

import { SessionProvider } from "next-auth/react";
import { useEffect } from "react";
import { initPostHog } from "@/lib/posthog";

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return <SessionProvider>{children}</SessionProvider>;
}
