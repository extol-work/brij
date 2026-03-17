import type { Metadata } from "next";

interface Props {
  params: Promise<{ activityId: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { activityId } = await params;
  const cardImageUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://brij.extol.work"}/api/cards/${activityId}`;
  const cardPageUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://brij.extol.work"}/card/${activityId}`;

  return {
    title: "Extol Card — brij",
    description: "We showed up. Here's the proof.",
    openGraph: {
      title: "Extol Card",
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
      title: "Extol Card",
      description: "We showed up. Here's the proof.",
      images: [cardImageUrl],
    },
  };
}

export default function CardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
