import { bigserial, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// Accounts are additive: the app works signed out, and nothing here is read
// for a request that carries no credentials.

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email'),
  displayName: text('display_name'),
  // IANA zone (e.g. "America/Los_Angeles"). The server has no other way to
  // know the user's evening or quiet hours.
  timezone: text('timezone'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  deletedAt: timestamptz('deleted_at'),
});

// One row per sign-in method. A table rather than columns on users, so
// another provider is a row, not a migration.
export const identities = pgTable(
  'identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['apple', 'google'] }).notNull(),
    subject: text('subject').notNull(), // the provider's stable `sub`
    email: text('email'),
    // Apple "Hide My Email" addresses never match another provider's email.
    emailIsRelay: boolean('email_is_relay').notNull().default(false),
    // Kept only so Apple's tokens can be revoked when the account is deleted.
    appleRefreshTokenEnc: text('apple_refresh_token_enc'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('identities_provider_subject_key').on(t.provider, t.subject),
    index('identities_user_id_idx').on(t.userId),
    index('identities_email_idx').on(t.email),
  ]
);

// Refresh tokens are opaque and stored hashed. Rotation keeps a family: a
// retry inside the grace window gets the same successor; later reuse revokes
// the whole family.
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    client: text('client', { enum: ['web', 'ios', 'android', 'alexa'] }).notNull(),
    aud: text('aud').notNull(),
    scope: text('scope').notNull().default(''),
    expiresAt: timestamptz('expires_at').notNull(),
    rotatedAt: timestamptz('rotated_at'),
    successorEnc: text('successor_enc'), // cleared once the grace window ends
    revokedAt: timestamptz('revoked_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('refresh_tokens_token_hash_key').on(t.tokenHash),
    index('refresh_tokens_family_id_idx').on(t.familyId),
    index('refresh_tokens_user_id_idx').on(t.userId),
  ]
);

// Single-use, short-lived codes: the Android Sign in with Apple hand-off now,
// Alexa account linking later.
export const oauthCodes = pgTable(
  'oauth_codes',
  {
    codeHash: text('code_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    redirectUri: text('redirect_uri'),
    codeChallenge: text('code_challenge'),
    scope: text('scope').notNull().default(''),
    expiresAt: timestamptz('expires_at').notNull(),
    usedAt: timestamptz('used_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('oauth_codes_expires_at_idx').on(t.expiresAt)]
);

// One row per sign-in (a refresh-token family): which kind of device it is.
// Coarse on purpose — enough for a "signed-in devices" list and for knowing
// which platforms people use, with nothing that fingerprints a device.
export const sessions = pgTable(
  'sessions',
  {
    familyId: uuid('family_id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    client: text('client', { enum: ['web', 'ios', 'android', 'alexa'] }).notNull(),
    deviceClass: text('device_class', { enum: ['desktop', 'phone', 'tablet', 'speaker'] }),
    os: text('os'),
    osVersion: text('os_version'), // major version only
    browser: text('browser'), // web only
    deviceModel: text('device_model'), // native only
    appVersion: text('app_version'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    lastSeenAt: timestamptz('last_seen_at').notNull().defaultNow(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)]
);

// The wellness profile Amrita builds up, for signed-in users. Stored whole, as
// the same JSON the app keeps on the device, because Amrita's profile tool
// adds to its shape over time. `version` goes up by one on every write, so two
// writers cannot silently overwrite each other.
export const wellnessProfiles = pgTable('wellness_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  data: jsonb('data').notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

// Finished practices, for signed-in users. Append-only: an entry is never
// changed or removed (except with the account), and its id is made on the
// device, so uploading the same entry twice is harmless. `seq` is the order
// entries reached the server — devices ask for "everything after seq N".
export const practiceLogEntries = pgTable(
  'practice_log_entries',
  {
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entryId: text('entry_id').notNull(),
    completedAt: timestamptz('completed_at').notNull(),
    localDate: text('local_date').notNull(), // YYYY-MM-DD in the user's own timezone
    kind: text('kind', { enum: ['ritual', 'breathwork'] }).notNull(),
    data: jsonb('data').notNull(), // the whole entry, as the device keeps it
    receivedAt: timestamptz('received_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('practice_log_entries_user_entry_key').on(t.userId, t.entryId),
    index('practice_log_entries_user_seq_idx').on(t.userId, t.seq),
  ]
);

// Rituals a signed-in user bookmarked, from any device. Unlike the practice
// log they can be removed: a removal keeps the row as a marker (removed_at
// set, data cleared), so a device that uploads the same ritual late cannot
// bring it back.
export const savedRituals = pgTable(
  'saved_rituals',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ritualId: text('ritual_id').notNull(),
    data: jsonb('data'), // the saved ritual, as the device keeps it; null once removed
    savedAt: timestamptz('saved_at').notNull().defaultNow(),
    removedAt: timestamptz('removed_at'),
  },
  (t) => [uniqueIndex('saved_rituals_user_ritual_key').on(t.userId, t.ritualId)]
);
