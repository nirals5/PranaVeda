import { and, eq, ne } from 'drizzle-orm';
import { getDb, schema } from './db.js';

// Which Alexa account is linked to which person, and whether they allowed
// Alexa notifications. Ending the link also ends the skill's sessions.

const { alexaLinks, refreshTokens, sessions } = schema;

// Every request from a linked skill carries both ids. An Alexa account can be
// linked to one person at a time: a new link takes it over.
export async function rememberAlexaUser(userId: string, alexaUserId: string, notifications?: boolean): Promise<void> {
  const db = getDb();
  await db.delete(alexaLinks).where(and(eq(alexaLinks.alexaUserId, alexaUserId), ne(alexaLinks.userId, userId)));
  const set = { alexaUserId, updatedAt: new Date(), ...(notifications === undefined ? {} : { notifications }) };
  await db
    .insert(alexaLinks)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: alexaLinks.userId, set });
}

export async function setAlexaNotifications(alexaUserId: string, on: boolean): Promise<void> {
  await getDb().update(alexaLinks).set({ notifications: on, updatedAt: new Date() }).where(eq(alexaLinks.alexaUserId, alexaUserId));
}

// The skill was disabled in the Alexa app.
export async function forgetAlexaUser(alexaUserId: string): Promise<void> {
  await getDb().delete(alexaLinks).where(eq(alexaLinks.alexaUserId, alexaUserId));
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
  await db.delete(alexaLinks).where(eq(alexaLinks.userId, userId));
}
