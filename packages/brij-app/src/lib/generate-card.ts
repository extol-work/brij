/**
 * Pre-generate an Extol Card image and store it in Vercel Blob.
 *
 * Called when an activity closes (after summary is set).
 * The stored URL is used for OG tags and instant card viewing.
 */

import { put } from "@vercel/blob";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Generate the card by calling our own card API route internally,
 * then upload the resulting PNG to Vercel Blob.
 */
export async function generateAndStoreCard(
  activityId: string,
  baseUrl: string
): Promise<string | null> {
  try {
    // Call our own card generation API
    const cardApiUrl = `${baseUrl}/api/cards/${activityId}`;
    const res = await fetch(cardApiUrl);

    if (!res.ok) {
      console.error(`Card generation failed for ${activityId}: ${res.status}`);
      return null;
    }

    const imageBuffer = await res.arrayBuffer();

    // Upload to Vercel Blob
    const blob = await put(
      `cards/${activityId}.png`,
      Buffer.from(imageBuffer),
      {
        access: "public",
        contentType: "image/png",
        addRandomSuffix: false,
        allowOverwrite: true,
      }
    );

    // Store the blob URL on the activity
    await db
      .update(activities)
      .set({ cardUrl: blob.url, updatedAt: new Date() })
      .where(eq(activities.id, activityId));

    return blob.url;
  } catch (err) {
    console.error(`Card pre-generation error for ${activityId}:`, err);
    return null;
  }
}
