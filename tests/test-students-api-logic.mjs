/**
 * Unit tests for the students-api pure helpers (shared, runtime-agnostic
 * module imported by the edge function itself — no re-implementation).
 *
 *  - normalizePhone: KZ/RU normalization to +7XXXXXXXXXX (8→+7, bare 10-digit
 *    promotion, junk rejected).
 *  - isManualChangeRecent: the 3-day "coaches win over automation" guard.
 *  - splitFullName / phoneDigits helpers.
 *
 * Run: node tests/test-students-api-logic.mjs
 */
import {
  normalizePhone,
  phoneDigits,
  splitFullName,
  isManualChangeRecent,
  MANUAL_GUARD_DAYS,
} from '../supabase/functions/students-api/students-logic.mjs';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function eq(actual, expected, msg) {
  assert(actual === expected, `${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}

console.log('\n=== normalizePhone ====================================================\n');
eq(normalizePhone('+7 777 123 45 67'), '+77771234567', 'spaces stripped, +7 kept');
eq(normalizePhone('8 (777) 123-45-67'), '+77771234567', 'leading 8 → +7, parens/dashes stripped');
eq(normalizePhone('87771234567'), '+77771234567', 'bare 8XXXXXXXXXX → +7');
eq(normalizePhone('77771234567'), '+77771234567', 'bare 7XXXXXXXXXX → +7');
eq(normalizePhone('7771234567'), '+77771234567', 'bare 10-digit local → +7 prepended');
eq(normalizePhone('+7-777-123-45-67'), '+77771234567', 'dashes stripped');
eq(normalizePhone('7.777.123.45.67'), '+77771234567', 'dots stripped');
eq(normalizePhone(''), null, 'empty → null');
eq(normalizePhone('   '), null, 'whitespace → null');
eq(normalizePhone('123'), null, 'too short → null');
eq(normalizePhone('+1 212 555 0100'), null, 'non-+7 11-digit (leading 1) → null');
eq(normalizePhone('abc'), null, 'letters → null');
eq(normalizePhone(null), null, 'null input → null');
eq(normalizePhone(77771234567), null, 'non-string input → null');
// idempotent
eq(normalizePhone(normalizePhone('87771234567')), '+77771234567', 'idempotent on already-normalized');

console.log('\n=== phoneDigits =======================================================\n');
eq(phoneDigits('+77771234567'), '7771234567', 'last 10 digits of normalized');
eq(phoneDigits('+7 777 123 45 67'), '7771234567', 'strips non-digits then last 10');
eq(phoneDigits(null), '', 'null → empty');

console.log('\n=== splitFullName =====================================================\n');
assert(JSON.stringify(splitFullName('Askar Zhumabek')) === JSON.stringify({ first_name: 'Askar', last_name: 'Zhumabek' }), 'two tokens');
assert(JSON.stringify(splitFullName('  Askar   Zhumabek  Uly ')) === JSON.stringify({ first_name: 'Askar', last_name: 'Zhumabek Uly' }), 'extra spaces + 3 tokens');
assert(JSON.stringify(splitFullName('Madonna')) === JSON.stringify({ first_name: 'Madonna', last_name: '' }), 'single token → empty last_name');
eq(splitFullName(''), null, 'empty → null');
eq(splitFullName('   '), null, 'whitespace → null');
eq(splitFullName(null), null, 'null → null');

console.log('\n=== isManualChangeRecent (3-day guard) ================================\n');
eq(MANUAL_GUARD_DAYS, 3, 'guard window is 3 days');
const NOW = Date.parse('2026-10-08T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3600 * 1000).toISOString();

eq(isManualChangeRecent({ changed_by_type: 'manual', created_at: hoursAgo(1) }, NOW), true,
  'manual change 1h ago → blocked');
eq(isManualChangeRecent({ changed_by_type: 'manual', created_at: hoursAgo(71) }, NOW), true,
  'manual change 71h ago (< 72h) → blocked');
eq(isManualChangeRecent({ changed_by_type: 'manual', created_at: hoursAgo(73) }, NOW), false,
  'manual change 73h ago (> 72h) → allowed');
eq(isManualChangeRecent({ changed_by_type: 'api', created_at: hoursAgo(1) }, NOW), false,
  'recent API change → not a manual block');
eq(isManualChangeRecent({ changed_by_type: 'system', created_at: hoursAgo(1) }, NOW), false,
  'recent system change → not a manual block');
eq(isManualChangeRecent(null, NOW), false, 'no typed row → allowed');
eq(isManualChangeRecent({ changed_by_type: 'manual', created_at: 'not-a-date' }, NOW), false,
  'unparseable timestamp → allowed (fail open, not a false block)');
// exact boundary: exactly 3 days is NOT younger-than-3-days
eq(isManualChangeRecent({ changed_by_type: 'manual', created_at: new Date(NOW - 3 * 86400 * 1000).toISOString() }, NOW), false,
  'exactly 3 days old → allowed (strict <)');

console.log(`\n--- ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
