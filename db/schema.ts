import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
