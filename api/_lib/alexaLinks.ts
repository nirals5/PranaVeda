import { and, eq, ne } from 'drizzle-orm';
import { getDb, schema } from './db.js';

// Which Alexa account is linked to which person, and whether they allowed
// Alexa notifications. Ending the link also ends the skill's sessions.

const { alexaLinks, alexaNotificationChoices, refreshTokens, sessions } = schema;

// Every request from a linked skill carries both ids. An Alexa account can be
// linked to one person at a time: a new link takes it over.
export async function rememberAlexaUser(userId: string, alexaUserId: string, notifications?: boolean): Promise<void> {
  const db = getDb();
  if (notifications === undefined) {
    const [choice] = await db.select().from(alexaNotificationChoices).where(eq(alexaNotificationChoices.alexaUserId, alexaUserId)).limit(1);
    notifications = choice?.notifications;
  }
  await db.delete(alexaLinks).where(and(eq(alexaLinks.alexaUserId, alexaUserId), ne(alexaLinks.userId, userId)));
  const set = { alexaUserId, updatedAt: new Date(), ...(notifications === undefined ? {} : { notifications }) };
  await db
    .insert(alexaLinks)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: alexaLinks.userId, set });
}

// Returns whether a linked person was updated (false: kept until Alexa is known).
export async function setAlexaNotifications(alexaUserId: string, on: boolean): Promise<boolean> {
  const db = getDb();
  const at = new Date();
  await db
    .insert(alexaNotificationChoices)
    .values({ alexaUserId, notifications: on, updatedAt: at })
    .onConflictDoUpdate({ target: alexaNotificationChoices.alexaUserId, set: { notifications: on, updatedAt: at } });
  const updated = await db.update(alexaLinks).set({ notifications: on, updatedAt: at }).where(eq(alexaLinks.alexaUserId, alexaUserId)).returning({ userId: alexaLinks.userId });
  return updated.length > 0;
}

// The skill was disabled in the Alexa app.
export async function forgetAlexaUser(alexaUserId: string): Promise<void> {
  await getDb().delete(alexaLinks).where(eq(alexaLinks.alexaUserId, alexaUserId));
  await getDb().delete(alexaNotificationChoices).where(eq(alexaNotificationChoices.alexaUserId, alexaUserId));
}

export async function alexaLinkFor(userId: string): Promise<{ alexaUserId: string; notifications: boolean } | null> {
  const [row] = await getDb().select().from(alexaLinks).where(eq(alexaLinks.userId, userId)).limit(1);
  return row ? { alexaUserId: row.alexaUserId, notifications: row.notifications } : null;
}

// Linked: the skill holds a session that has not been ended.
export async function alexaLinked(userId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ familyId: sessions.familyId })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.client, 'alexa')))
    .limit(1);
  return !!row;
}

// From the website: the skill's tokens stop working, so Alexa asks to link again.
export async function unlinkAlexa(userId: string, now = new Date()): Promise<void> {
  const db = getDb();
  await db
    .update(refreshTokens)
    .set({ revokedAt: now, successorEnc: null })
    .where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.client, 'alexa')));
  await db.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.client, 'alexa')));
  const gone = await db.delete(alexaLinks).where(eq(alexaLinks.userId, userId)).returning({ alexaUserId: alexaLinks.alexaUserId });
  for (const { alexaUserId } of gone) await db.delete(alexaNotificationChoices).where(eq(alexaNotificationChoices.alexaUserId, alexaUserId));
}
