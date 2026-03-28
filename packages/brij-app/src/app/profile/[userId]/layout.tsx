import { db } from "@/db";
import { users, groupMemberships, activities, attendances, groups } from "@/db/schema";
import { eq, and, count, isNull } from "drizzle-orm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    return { title: "Profile not found — brij" };
  }

  // Count communities
  const memberships = await db
    .select({ count: count() })
    .from(groupMemberships)
    .where(and(
      eq(groupMemberships.userId, userId),
      eq(groupMemberships.status, "active"),
    ));

  // Count activities organized
  const [coordinated] = await db
    .select({ count: count() })
    .from(activities)
    .where(eq(activities.coordinatorId, userId));

  // Primary community
  const primaryMembership = await db
    .select({ groupName: groups.name, role: groupMemberships.role })
    .from(groupMemberships)
    .innerJoin(groups, and(eq(groups.id, groupMemberships.groupId), isNull(groups.deletedAt)))
    .where(and(
      eq(groupMemberships.userId, userId),
      eq(groupMemberships.status, "active"),
    ))
    .orderBy(groupMemberships.joinedAt)
    .limit(1);

  const name = user.name || "Someone";
  const primary = primaryMembership[0];
  const communityCount = memberships[0]?.count || 0;
  const organizedCount = coordinated?.count || 0;

  const description = primary
    ? `${name} · ${primary.role === "coordinator" ? "Organizer" : "Member"} at ${primary.groupName}. ${organizedCount} activities organized across ${communityCount} communities.`
    : `${name} on brij — ${communityCount} communities, ${organizedCount} activities organized.`;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://brij.extol.work";

  return {
    title: `${name} — brij`,
    description,
    openGraph: {
      title: `${name} — brij`,
      description,
      url: `${baseUrl}/profile/${userId}`,
      type: "profile",
      siteName: "brij",
    },
    twitter: {
      card: "summary",
      title: `${name} — brij`,
      description,
    },
  };
}

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
