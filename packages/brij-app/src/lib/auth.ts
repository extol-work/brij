import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/** Get the authenticated user's DB record, or null if not signed in. */
export async function getAuthUser(): Promise<{ id: string; email: string; name: string | null } | null> {
  const session = await auth();
  if (!session?.user?.email) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.email, session.user.email),
  });

  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}
