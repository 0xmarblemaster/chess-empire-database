/**
 * Shared student name → roster fuzzy matcher.
 *
 * Lifted out of admin-v2.js (the CSV import path) and coach-kpi-upload.js
 * (the Swiss-Manager tournament path) so both pipelines use one implementation.
 * Returned shape is the contract every caller already depended on:
 *   { matched, student, confidence, ambiguous?, candidates? }
 *
 * Loaded as a <script> in browser (exports onto window.studentMatch) and as a
 * CommonJS module from Node tests.
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) module.exports = factory();
    else root.studentMatch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function levenshteinDistance(a, b) {
        const m = a.length, n = b.length;
        if (m === 0) return n;
        if (n === 0) return m;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
                else dp[i][j] = Math.min(dp[i - 1][j - 1] + 1, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
            }
        }
        return dp[m][n];
    }

    function nfc(s) { return (s || '').normalize('NFC'); }

    function fuzzyMatchStudent(rawName, students) {
        if (!rawName || !students || students.length === 0) {
            return { matched: false, student: null, confidence: 0 };
        }
        const normalized = nfc(rawName).trim().toLowerCase();
        const parts = normalized.split(/\s+/).filter(p => p.length > 0);

        // Exact "first last" / "last first" match.
        const exact = [];
        for (const s of students) {
            const fn = nfc(s.firstName || '').toLowerCase();
            const ln = nfc(s.lastName  || '').toLowerCase();
            if (normalized === `${ln} ${fn}` || normalized === `${fn} ${ln}`) exact.push(s);
        }
        if (exact.length === 1) return { matched: true, student: exact[0], confidence: 100 };
        if (exact.length > 1) return { matched: true, student: exact[0], confidence: 100, ambiguous: true, candidates: exact };

        const MIN_SUBSTRING_LENGTH = 4;
        const MIN_TOKEN_SIMILARITY = 0.75;
        const MIN_WHOLE_NAME_SIMILARITY = 0.80;

        // 80% fuzzy: every token matches AND the whole-name similarity is ≥ 80%.
        const fuzzy80 = [];
        for (const s of students) {
            const fn = nfc(s.firstName || '').toLowerCase();
            const ln = nfc(s.lastName  || '').toLowerCase();
            const studentParts = [fn, ln];
            let matchedTokens = 0;
            for (const part of parts) {
                let hit = false;
                for (const sp of studentParts) {
                    if (!sp) continue;
                    if (part === sp) { hit = true; break; }
                    if (part.length >= MIN_SUBSTRING_LENGTH && sp.includes(part)) { hit = true; break; }
                    if (sp.length >= MIN_SUBSTRING_LENGTH && part.includes(sp)) { hit = true; break; }
                    const dist = levenshteinDistance(part, sp);
                    const maxLen = Math.max(part.length, sp.length);
                    const sim = (maxLen - dist) / maxLen;
                    if (sim >= MIN_TOKEN_SIMILARITY && maxLen >= MIN_SUBSTRING_LENGTH) { hit = true; break; }
                }
                if (hit) matchedTokens++;
            }
            if (matchedTokens === parts.length && parts.length >= 2) {
                const full1 = `${fn} ${ln}`;
                const full2 = `${ln} ${fn}`;
                const minDist = Math.min(levenshteinDistance(normalized, full1), levenshteinDistance(normalized, full2));
                const maxLen = Math.max(normalized.length, full1.length);
                if ((maxLen - minDist) / maxLen >= MIN_WHOLE_NAME_SIMILARITY) fuzzy80.push(s);
            }
        }
        if (fuzzy80.length === 1) return { matched: true, student: fuzzy80[0], confidence: 80 };
        if (fuzzy80.length > 1) return { matched: true, student: fuzzy80[0], confidence: 80, ambiguous: true, candidates: fuzzy80 };

        // 60% fallback: one name component matches exactly, the other is contained.
        const fuzzy60 = [];
        for (const s of students) {
            const fn = nfc(s.firstName || '').toLowerCase();
            const ln = nfc(s.lastName  || '').toLowerCase();
            if (parts.some(p => p === fn) || parts.some(p => p === ln)) {
                const otherParts = parts.filter(p => p !== fn && p !== ln);
                if (otherParts.length === 0 || otherParts.some(p =>
                    fn.includes(p) || ln.includes(p) || p.includes(fn) || p.includes(ln)
                )) {
                    fuzzy60.push(s);
                }
            }
        }
        if (fuzzy60.length === 1) return { matched: true, student: fuzzy60[0], confidence: 60 };
        if (fuzzy60.length > 1) return { matched: true, student: fuzzy60[0], confidence: 60, ambiguous: true, candidates: fuzzy60 };

        return { matched: false, student: null, confidence: 0 };
    }

    return { fuzzyMatchStudent, levenshteinDistance };
});
