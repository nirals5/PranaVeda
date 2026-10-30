import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

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

// Saved places and the website's calendar link, kept on the account only
// once the user turns that on (api/_lib/connections.ts). `data` is sealed
// JSON (AES-256-GCM under CONNECTIONS_ENC_KEY): a calendar link works like a
// password, and places are where someone lives and works.
export const accountConnections = pgTable('account_connections', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  data: text('data').notNull(),
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

// Request counts for rate limiting (api/_lib/rateLimit.ts): one row per caller
// (a user, or a guest's network address) per route and time window. Rows are
// deleted once their window has passed, so nothing here is kept for long.
export const rateLimitCounts = pgTable(
  'rate_limit_counts',
  {
    caller: text('caller').notNull(), // "user:<id>" or "ip:<address>"
    bucket: text('bucket').notNull(), // route and window, e.g. "chat:minute:29384756"
    count: integer('count').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.caller, t.bucket] }), index('rate_limit_counts_expires_idx').on(t.expiresAt)]
);

// ---------------------------------------------------------------------------
// Food library. Reference data, not user data: the "PranaVeda – Food Library"
// Google Sheet is where it is edited, and these tables are a copy of it that
// `npm run food:import` replaces whole (db/food/). Never edit these rows in the
// database: the next import overwrites them.
// ---------------------------------------------------------------------------

export const RECIPE_STATUSES = ['sattvik', 'adapted', 'check', 'not_sattvik', 'not_for_home_use'] as const;
export const HOW_TAKEN = ['drink', 'eat', 'chew', 'lick'] as const;
export const POTENCIES = ['warming', 'cooling'] as const;
export const DVIDAL = ['pulse_with_curd', 'pulse_with_milk'] as const;
export const FOOD_GROUPS = [
  'animal', 'dairy', 'fermented', 'fruit', 'grain', 'herb', 'meat', 'nut', 'oil',
  'other', 'pulse', 'salt', 'seed', 'spice', 'sweetener', 'unknown', 'vegetable', 'water',
] as const;
export const KITCHEN = ['yes', 'no', 'unknown'] as const;
export const INGREDIENT_SATTVIK = ['ok', 'excluded', 'to_confirm', 'unsafe'] as const;
export const EXCLUSION_STATUSES = [
  'excluded', 'unsafe', 'combination_rule', 'allowed_by_exception', 'allowed_in_small_amounts',
] as const;
export const SUBSTITUTION_ROLES = ['primary', 'classical', 'jain_adaptation'] as const;

// One row per import, so it is always clear which copy of the sheet is live.
export const foodImports = pgTable('food_imports', {
  id: serial('id').primaryKey(),
  importedAt: timestamptz('imported_at').notNull().defaultNow(),
  fileName: text('file_name').notNull(),
  fileSha256: text('file_sha256').notNull(),
  counts: jsonb('counts').notNull(), // rows per table
  warnings: jsonb('warnings').notNull(), // what the import noticed but let through
});

export const foodSources = pgTable('food_sources', {
  id: text('id').primaryKey(), // F1, F2…
  title: text('title').notNull(),
  author: text('author'),
  edition: text('edition'),
  rights: text('rights'),
  role: text('role'),
});

// Every recipe in the compendium, kept and removed alike, so a code can never
// be reused. Removed recipes keep only their names, status, reason and page.
// A recipe dropped from the sheet is retired, not deleted: a user may have
// saved it.
export const foodRecipes = pgTable(
  'food_recipes',
  {
    code: text('code').primaryKey(), // FC04.01: compendium chapter and number
    status: text('status', { enum: RECIPE_STATUSES }).notNull(),
    statusReason: text('status_reason'),
    englishName: text('english_name').notNull(),
    englishNameDrafted: boolean('english_name_drafted').notNull().default(true), // AI-drafted, not yet reviewed
    sanskritName: text('sanskrit_name').notNull(),
    dishType: text('dish_type'),
    howTaken: text('how_taken', { enum: HOW_TAKEN }),
    kitchenReady: boolean('kitchen_ready'),
    potency: text('potency', { enum: POTENCIES }),
    // As the source lists them; the Sanskrit list does not line up one-to-one
    // with the English one, so the per-ingredient links come from the English.
    ingredientsSanskrit: text('ingredients_sanskrit'),
    classicalProperties: text('classical_properties'),
    // Reference only. Never shown in the app or sent to a client: they read as
    // health claims.
    classicalIndications: text('classical_indications'),
    contraindications: text('contraindications'),
    classicalReference: text('classical_reference'),
    sourceId: text('source_id').references(() => foodSources.id),
    sourcePage: integer('source_page'),
    preparationNote: text('preparation_note'),
    dvidal: text('dvidal', { enum: DVIDAL }),
    fermentedBatter: boolean('fermented_batter').notNull().default(false),
    // The only recipes the app may draw from (still subject to review).
    appCandidate: boolean('app_candidate').notNull().default(false),
    retiredAt: timestamptz('retired_at'),
  },
  (t) => [index('food_recipes_app_idx').on(t.code).where(sql`${t.appCandidate} and ${t.retiredAt} is null`)]
);

// The glossary: every ingredient once, under its natural English name.
export const foodIngredients = pgTable(
  'food_ingredients',
  {
    name: text('name').primaryKey(),
    botanicalName: text('botanical_name'),
    foodGroup: text('food_group', { enum: FOOD_GROUPS }).notNull(),
    kitchen: text('kitchen', { enum: KITCHEN }).notNull(), // can a home cook buy it?
    sattvik: text('sattvik', { enum: INGREDIENT_SATTVIK }).notNull(),
    note: text('note'),
  },
  (t) => [uniqueIndex('food_ingredients_name_lower_key').on(sql`lower(${t.name})`)]
);

// The Sanskrit (and other) spellings an ingredient goes by in the sources.
export const foodIngredientNames = pgTable(
  'food_ingredient_names',
  {
    ingredient: text('ingredient')
      .notNull()
      .references(() => foodIngredients.name, { onDelete: 'cascade', onUpdate: 'cascade' }),
    name: text('name').notNull(),
  },
  (t) => [primaryKey({ columns: [t.ingredient, t.name] }), index('food_ingredient_names_lower_idx').on(sql`lower(${t.name})`)]
);

export const foodRecipeIngredients = pgTable(
  'food_recipe_ingredients',
  {
    recipeCode: text('recipe_code')
      .notNull()
      .references(() => foodRecipes.code, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    ingredient: text('ingredient')
      .notNull()
      .references(() => foodIngredients.name, { onUpdate: 'cascade' }),
    // The classical ingredient is honey; the recipe uses a honey swap instead
    // (food_substitutions for the Honey exclusion).
    honeySwapped: boolean('honey_swapped').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.recipeCode, t.position] }),
    index('food_recipe_ingredients_ingredient_idx').on(t.ingredient),
  ]
);

// The sattvik rule. Shared with the practice library, which keeps its own copy
// of the same list today.
export const exclusions = pgTable('exclusions', {
  id: text('id').primaryKey(), // slug of the item, e.g. "honey"
  item: text('item').notNull(),
  status: text('status', { enum: EXCLUSION_STATUSES }).notNull(),
  notes: text('notes'), // a combination rule's whole wording lives here
  appliesTo: text('applies_to'),
  // Phrases where a term means something else and is not food, e.g. "lift your
  // spirits" for Alcohol; the food check ignores a term inside one of these.
  notWhen: text('not_when').array().notNull().default(sql`'{}'::text[]`),
});

// The words that trigger an exclusion, in English, Hindi or Sanskrit.
export const exclusionTerms = pgTable(
  'exclusion_terms',
  {
    exclusionId: text('exclusion_id')
      .notNull()
      .references(() => exclusions.id, { onDelete: 'cascade' }),
    term: text('term').notNull(),
  },
  (t) => [primaryKey({ columns: [t.exclusionId, t.term] })]
);

export const foodSubstitutions = pgTable('food_substitutions', {
  position: integer('position').primaryKey(), // order in the sheet
  replaces: text('replaces').notNull(),
  exclusionId: text('exclusion_id').references(() => exclusions.id),
  swap: text('swap').notNull(),
  basis: text('basis'),
  ayurvedicQuality: text('ayurvedic_quality'), // still to be reviewed
  howToUse: text('how_to_use'),
  role: text('role', { enum: SUBSTITUTION_ROLES }),
});

// ---------------------------------------------------------------------------
// Practice library. Reference data, like the food library: the "PranaVeda –
// Practice Library" Google Sheet is where it is edited, and these tables are a
// copy of it that `npm run practice:import` replaces whole (db/practice/).
// Never edit these rows in the database: the next import overwrites them.
// ---------------------------------------------------------------------------

export const PRACTICE_TYPES = ['asana', 'pranayama'] as const;
export const WHERE_SHOWN = ['right_now', 'explore_only', 'hidden'] as const;
export const MIN_EXPERIENCE = ['any', 'experienced'] as const;
export const INTENSITIES = ['gentle', 'moderate', 'strong'] as const;
export const DOSHA_EFFECTS = ['balances', 'neutral', 'aggravates'] as const;
export const PRACTICE_EFFECTS = [
  'grounding', 'calming', 'energizing', 'warming', 'cooling', 'balancing', 'digestive', 'focusing', 'restorative',
] as const;
export const SETTINGS = ['floor', 'standing', 'chair', 'lying'] as const;
export const BEST_TIMES = ['morning', 'midday', 'evening', 'any', 'after_meals'] as const;
export const WEATHER = ['hot', 'cold', 'any'] as const;
export const REVIEW_STATUSES = ['draft', 'reviewed', 'approved'] as const;
export const RULE_KINDS = ['guardrail', 'hint'] as const;
export const SOURCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;
export const PRACTICE_BASIS = ['AI-drafted', 'app_catalog', 'cited'] as const;
export const CONDITION_LEVELS = ['avoid', 'caution'] as const;
export const SOURCE_STATUSES = ['approved', 'proposed'] as const;

const textArray = (name: string) => text(name).array().notNull().default(sql`'{}'::text[]`);

export const practiceImports = pgTable('practice_imports', {
  id: serial('id').primaryKey(),
  importedAt: timestamptz('imported_at').notNull().defaultNow(),
  fileName: text('file_name').notNull(),
  fileSha256: text('file_sha256').notNull(),
  counts: jsonb('counts').notNull(),
  warnings: jsonb('warnings').notNull(),
});

export const practiceSources = pgTable('practice_sources', {
  id: text('id').primaryKey(), // S1, S2…
  title: text('title').notNull(),
  author: text('author'),
  role: text('role'),
  edition: text('edition'),
  rights: text('rights'),
  status: text('status', { enum: SOURCE_STATUSES }).notNull(),
  notes: text('notes'),
});

// The health conditions a practice can be avoided or adapted for. Shared:
// the wellness profile's conditions should come to use the same codes.
export const conditions = pgTable('conditions', {
  code: text('code').primaryKey(), // knee_injury
  label: text('label').notNull(),
  userWords: textArray('user_words'), // how people say it: "bad knee"
  sourcePhrases: text('source_phrases'),
});

// The states a session can serve: N1 Ground … N6 Wind down.
export const needs = pgTable('needs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  typicalSignals: text('typical_signals'),
  effectsThatServe: textArray('effects_that_serve'),
  doshaFocus: text('dosha_focus'),
  avoidEffects: text('avoid_effects'),
  whyTemplate: text('why_template'),
});

// One row per pose (P01…) or breath practice (B01…). A practice dropped from
// the sheet is retired, not deleted: a user may have it in a saved ritual.
export const practices = pgTable(
  'practices',
  {
    id: text('id').primaryKey(),
    appId: text('app_id'), // the app's catalog id, e.g. downward_dog
    type: text('type', { enum: PRACTICE_TYPES }).notNull(),
    nameSanskrit: text('name_sanskrit').notNull(),
    nameEnglish: text('name_english').notNull(),
    sourceLevel: text('source_level', { enum: SOURCE_LEVELS }),
    sourceBodyArea: text('source_body_area'),
    // Blank until the practice is tagged; the engine skips untagged rows.
    whereShown: text('where_shown', { enum: WHERE_SHOWN }),
    mergedInto: text('merged_into'),
    minExperience: text('min_experience', { enum: MIN_EXPERIENCE }),
    intensity: text('intensity', { enum: INTENSITIES }),
    settings: textArray('settings'),
    settingNote: text('setting_note'),
    durationMin: real('duration_min'),
    effects: textArray('effects'),
    vata: text('vata', { enum: DOSHA_EFFECTS }),
    pitta: text('pitta', { enum: DOSHA_EFFECTS }),
    kapha: text('kapha', { enum: DOSHA_EFFECTS }),
    // How the practice suits each dosha, in words (Amrita quotes these).
    doshaVata: text('dosha_vata'),
    doshaPitta: text('dosha_pitta'),
    doshaKapha: text('dosha_kapha'),
    bestTimes: textArray('best_times'), // in order: the first is preferred
    timingNote: text('timing_note'),
    bestWeather: textArray('best_weather'),
    counterPoseId: text('counter_pose_id'),
    avoidNotes: text('avoid_notes'),
    avoidWeather: textArray('avoid_weather'),
    avoidAfterMeal: boolean('avoid_after_meal').notNull().default(false),
    plainBenefit: text('plain_benefit'),
    image: text('image'), // file name under public/poses/
    cues: textArray('cues'),
    commonMistakes: textArray('common_mistakes'),
    modifications: text('modifications'),
    breathDescription: text('breath_description'),
    inhaleSec: integer('inhale_sec'),
    holdInSec: integer('hold_in_sec'),
    exhaleSec: integer('exhale_sec'),
    holdOutSec: integer('hold_out_sec'),
    cycles: integer('cycles'),
    ayurvedicNote: text('ayurvedic_note'),
    sourceCaution: text('source_caution'),
    dataFlag: text('data_flag'),
    basis: text('basis', { enum: PRACTICE_BASIS }),
    status: text('status', { enum: REVIEW_STATUSES }),
    reviewedBy: text('reviewed_by'),
    reviewedOn: date('reviewed_on'),
    iyengarRef: text('iyengar_ref'),
    classicalRef: text('classical_ref'),
    classicalSourceId: text('classical_source_id').references(() => practiceSources.id),
    retiredAt: timestamptz('retired_at'),
  },
  (t) => [uniqueIndex('practices_app_id_key').on(t.appId)]
);

// avoid: a user with the condition never gets the practice (guardrail G1).
// caution: they get it, with its avoid_notes (G13).
export const practiceConditions = pgTable(
  'practice_conditions',
  {
    practiceId: text('practice_id')
      .notNull()
      .references(() => practices.id, { onDelete: 'cascade' }),
    conditionCode: text('condition_code')
      .notNull()
      .references(() => conditions.code, { onUpdate: 'cascade' }),
    level: text('level', { enum: CONDITION_LEVELS }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.practiceId, t.conditionCode] }),
    index('practice_conditions_condition_idx').on(t.conditionCode),
  ]
);

export const practiceNeeds = pgTable(
  'practice_needs',
  {
    practiceId: text('practice_id')
      .notNull()
      .references(() => practices.id, { onDelete: 'cascade' }),
    needId: text('need_id')
      .notNull()
      .references(() => needs.id),
  },
  (t) => [primaryKey({ columns: [t.practiceId, t.needId] }), index('practice_needs_need_idx').on(t.needId)]
);

export const practicePrinciples = pgTable('practice_principles', {
  id: text('id').primaryKey(), // PR1…
  statement: text('statement').notNull(),
  concept: text('concept'),
  reference: text('reference'),
  basis: text('basis'),
  status: text('status', { enum: REVIEW_STATUSES }).notNull(),
  reviewedBy: text('reviewed_by'),
  reviewedOn: date('reviewed_on'),
});

export const practicePrincipleSources = pgTable(
  'practice_principle_sources',
  {
    principleId: text('principle_id')
      .notNull()
      .references(() => practicePrinciples.id, { onDelete: 'cascade' }),
    sourceId: text('source_id')
      .notNull()
      .references(() => practiceSources.id),
  },
  (t) => [primaryKey({ columns: [t.principleId, t.sourceId] })]
);

// The engine's rules, as reference text. The checks themselves live in code;
// enforced_by says where (or "not yet").
export const practiceRules = pgTable('practice_rules', {
  id: text('id').primaryKey(), // G1…, H1…
  kind: text('kind', { enum: RULE_KINDS }).notNull(),
  whenText: text('when_text').notNull(),
  thenText: text('then_text').notNull(),
  why: text('why'),
  enforcedBy: text('enforced_by'),
  basis: text('basis'),
  status: text('status', { enum: REVIEW_STATUSES }).notNull(),
  reviewedBy: text('reviewed_by'),
  reviewedOn: date('reviewed_on'),
});

export const practiceRulePrinciples = pgTable(
  'practice_rule_principles',
  {
    ruleId: text('rule_id')
      .notNull()
      .references(() => practiceRules.id, { onDelete: 'cascade' }),
    principleId: text('principle_id')
      .notNull()
      .references(() => practicePrinciples.id),
  },
  (t) => [primaryKey({ columns: [t.ruleId, t.principleId] })]
);

// The named sequences in the original Yogism dataset ("Hatha Yoga",
// "Stress relief"…), and which poses each one uses.
export const practiceFlows = pgTable('practice_flows', {
  id: text('id').primaryKey(), // slug of name and category
  name: text('name').notNull(),
  category: text('category').notNull(), // e.g. yoga-styles, life-style-yoga
});

export const practiceFlowMembers = pgTable(
  'practice_flow_members',
  {
    flowId: text('flow_id')
      .notNull()
      .references(() => practiceFlows.id, { onDelete: 'cascade' }),
    practiceId: text('practice_id')
      .notNull()
      .references(() => practices.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.flowId, t.practiceId] }), index('practice_flow_members_practice_idx').on(t.practiceId)]
);

// The original Yogism text for P01–P46, kept for reference. A community
// dataset, not a clinical source.
export const practiceSourceText = pgTable('practice_source_text', {
  practiceId: text('practice_id')
    .primaryKey()
    .references(() => practices.id, { onDelete: 'cascade' }),
  level: text('level'),
  bodyArea: text('body_area'),
  time: text('time'),
  benefits: text('benefits'),
  target: text('target'),
  variations: text('variations'),
  cautionNotes: text('caution_notes'),
  steps: text('steps'),
});
