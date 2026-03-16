import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { activities, attendances, groups } from "@/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

/** GET /api/export/activities — export user's own activities as CSV */
export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  // Activities where user is coordinator
  const coordinated = await db
    .select({
      title: activities.title,
      groupName: groups.name,
      startsAt: activities.startsAt,
      location: activities.location,
      status: activities.status,
      attendeeCount: sql<number>`(SELECT count(*) FROM attendances WHERE activity_id = ${activities.id})::int`,
    })
    .from(activities)
    .leftJoin(groups, eq(groups.id, activities.groupId))
    .where(
      and(
        eq(activities.coordinatorId, user.id),
        ...(from ? [gte(activities.startsAt, new Date(from))] : []),
        ...(to ? [lte(activities.startsAt, new Date(to + "T23:59:59Z"))] : [])
      )
    );

  // Activities where user attended (not coordinator)
  const attended = await db
    .select({
      title: activities.title,
      groupName: groups.name,
      startsAt: activities.startsAt,
      location: activities.location,
      status: activities.status,
      checkedInAt: attendances.checkedInAt,
      attendeeCount: sql<number>`(SELECT count(*) FROM attendances WHERE activity_id = ${activities.id})::int`,
    })
    .from(attendances)
    .innerJoin(activities, eq(activities.id, attendances.activityId))
    .leftJoin(groups, eq(groups.id, activities.groupId))
    .where(
      and(
        eq(attendances.userId, user.id),
        ...(from ? [gte(activities.startsAt, new Date(from))] : []),
        ...(to ? [lte(activities.startsAt, new Date(to + "T23:59:59Z"))] : [])
      )
    );

  const rows: string[] = [
    "activity_name,group_name,date,time,location,role,attendee_count",
  ];

  for (const a of coordinated) {
    const d = a.startsAt ? new Date(a.startsAt) : null;
    rows.push(csvRow([
      a.title,
      a.groupName || "",
      d ? d.toISOString().split("T")[0] : "",
      d ? d.toISOString().split("T")[1]?.slice(0, 5) || "" : "",
      a.location || "",
      "coordinator",
      String(a.attendeeCount),
    ]));
  }

  for (const a of attended) {
    const d = a.startsAt ? new Date(a.startsAt) : null;
    rows.push(csvRow([
      a.title,
      a.groupName || "",
      d ? d.toISOString().split("T")[0] : "",
      d ? d.toISOString().split("T")[1]?.slice(0, 5) || "" : "",
      a.location || "",
      "attendee",
      String(a.attendeeCount),
    ]));
  }

  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="my-activities.csv"`,
    },
  });
}

function csvRow(fields: string[]): string {
  return fields.map((f) => `"${f.replace(/"/g, '""')}"`).join(",");
}
