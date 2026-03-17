import type { Metadata } from "next";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq } from "drizzle-orm";

interface Props {
  params: Promise<{ activityId: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { activityId } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://brij.extol.work";
  const cardPageUrl = `${baseUrl}/card/${activityId}`;

  // Use pre-generated card URL if available, fall back to dynamic API
  const activity = await db.query.activities.findFirst({
    where: eq(activities.id, activityId),
  });

  const cardImageUrl = activity?.cardUrl || `${baseUrl}/api/cards/${activityId}`;
  const title = activity?.title ? `${activity.title} — Extol Card` : "Extol Card — brij";

  return {
    title,
    description: "We showed up. Here's the proof.",
    openGraph: {
      title: activity?.title || "Extol Card",
      description: "We showed up. Here's the proof.",
      type: "website",
      url: cardPageUrl,
      images: [
        {
          url: cardImageUrl,
          width: 1080,
          height: 1920,
          alt: "Extol Card",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: activity?.title || "Extol Card",
      description: "We showed up. Here's the proof.",
      images: [cardImageUrl],
    },
  };
}

export default function CardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
