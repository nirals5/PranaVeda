import 'dotenv/config';
import { usageSummary } from '../../api/_lib/usage.js';

// npm run usage:summary — usage counts (KAN-32) for the last 7 and 30 days:
// installs seen per platform, signed in or not, and how often each event
// happened. Reads the database in DATABASE_URL (dev unless told otherwise).

const summary = await usageSummary(new Date());
const host = (process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL || '').match(/@([^/.]+)/)?.[1] ?? 'no database';
console.log(`Usage counts (${host})\n`);
console.log('Installs seen');
console.table(summary.installs.map((r) => ({ platform: r.platform, 'signed in': r.signedIn ? 'yes' : 'no', '7 days': r.last7, '30 days': r.last30 })));
console.log('Events');
console.table(summary.events.map((r) => ({ event: r.name, '7 days': r.last7, '30 days': r.last30 })));
