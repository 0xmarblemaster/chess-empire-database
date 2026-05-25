/**
 * DOM smoke test: renderSchoolHero produces 7 cards, each with a .stat-icon
 * descendant and the correct .variant-* class on the card root.
 *
 * Also covers the leaderboard color helpers — verifies rank classes are
 * applied on the default sort, cell .has-value flags activate when Top-3
 * and Promotions are non-zero, and the participation band switches between
 * low / mid / high.
 *
 * Run: node tests/test-coach-kpi-hero-icons.js
 */

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

function makeMockEl(tag) {
    return {
        tagName: tag,
        children: [],
        attributes: {},
        dataset: {},
        className: '',
        textContent: '',
        _innerHTML: '',
        get innerHTML() { return this._innerHTML; },
        set innerHTML(v) { this._innerHTML = v; if (v === '') this.children = []; },
        appendChild(child) { this.children.push(child); return child; },
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; },
    };
}

function makeContainer() { return makeMockEl('div'); }

function loadModule() {
    const path = require('path');
    const modulePath = require.resolve(path.join(__dirname, '..', 'coach-kpi.js'));
    delete require.cache[modulePath];
    global.document = { createElement(tag) { return makeMockEl(tag); } };
    global.window = {};
    return require(modulePath);
}

function findByClass(root, token) {
    if (!root) return null;
    if (typeof root.className === 'string' && new RegExp(`\\b${token}\\b`).test(root.className)) {
        return root;
    }
    if (Array.isArray(root.children)) {
        for (const c of root.children) {
            const hit = findByClass(c, token);
            if (hit) return hit;
        }
    }
    return null;
}

const SUMMARY = {
    active_students_count: 42,
    active_players_count: 30,
    participation_pct: 71.4,
    top3_count: 5,
    new_razryads_count: 3,
    promotions_count: 4,
    total_tournaments: 6,
};

console.log('\n=== renderSchoolHero mounts 7 variant cards with .stat-icons ===\n');
(function testHeroVariants() {
    const kpi = loadModule();
    const container = makeContainer();
    kpi.renderSchoolHero(container, SUMMARY, {});

    assert(container.children.length === 7,
        'renders exactly 7 hero cards');

    const variants = [
        'active-students',
        'active-players',
        'participation',
        'top3',
        'razryads',
        'promotions',
        'tournaments',
    ];
    variants.forEach((v, i) => {
        const card = container.children[i];
        assert(card && /\bkpi-hero-card\b/.test(card.className),
            `card[${i}] carries the .kpi-hero-card class`);
        assert(card && new RegExp(`\\bvariant-${v}\\b`).test(card.className),
            `card[${i}] carries .variant-${v}`);
        const icon = findByClass(card, 'stat-icon');
        assert(icon !== null,
            `card[${i}] (.variant-${v}) contains a .stat-icon descendant`);
        assert(icon && typeof icon.textContent === 'string' && icon.textContent.length > 0,
            `card[${i}] icon renders a glyph (textContent non-empty)`);
        assert(icon && icon.attributes && icon.attributes['aria-hidden'] === 'true',
            `card[${i}] icon is aria-hidden (decorative)`);
    });
})();

console.log('\n=== renderSchoolHero — empty summary falls back to empty card ===\n');
(function testHeroEmpty() {
    const kpi = loadModule();
    const container = makeContainer();
    kpi.renderSchoolHero(container, {}, {});
    const empty = findByClass(container, 'kpi-empty-state');
    assert(empty !== null,
        'empty summary renders the empty state (no orphan variant cards)');
    const heroCard = findByClass(container, 'kpi-hero-card');
    assert(heroCard === null,
        'no .kpi-hero-card is mounted when summary is empty');
})();

console.log('\n=== renderLeaderboard applies rank-1/2/3 on default sort ========\n');
(function testRankClasses() {
    const kpi = loadModule();
    const container = makeContainer();
    const rows = [
        { coach_id: 'a', coach_name: 'A', total_tournaments: 10, active_students_count: 10, active_players_count: 8, top3_count: 2, promotions_count: 1, new_razryads_count: 0 },
        { coach_id: 'b', coach_name: 'B', total_tournaments: 8,  active_students_count: 10, active_players_count: 4, top3_count: 0, promotions_count: 0, new_razryads_count: 0 },
        { coach_id: 'c', coach_name: 'C', total_tournaments: 6,  active_students_count: 10, active_players_count: 2, top3_count: 1, promotions_count: 0, new_razryads_count: 0 },
        { coach_id: 'd', coach_name: 'D', total_tournaments: 4,  active_students_count: 10, active_players_count: 7, top3_count: 0, promotions_count: 3, new_razryads_count: 0 },
    ];
    kpi.renderLeaderboard(container, rows, {});

    const r1 = findByClass(container, 'rank-1');
    const r2 = findByClass(container, 'rank-2');
    const r3 = findByClass(container, 'rank-3');
    assert(r1 && r1.tagName === 'tr', 'rank-1 sits on a <tr>');
    assert(r2 && r2.tagName === 'tr', 'rank-2 sits on a <tr>');
    assert(r3 && r3.tagName === 'tr', 'rank-3 sits on a <tr>');

    // 4th row must NOT carry any rank- class
    function findAllByClass(root, token, out) {
        out = out || [];
        if (!root) return out;
        if (typeof root.className === 'string' && new RegExp(`\\b${token}\\b`).test(root.className)) {
            out.push(root);
        }
        if (Array.isArray(root.children)) {
            for (const c of root.children) findAllByClass(c, token, out);
        }
        return out;
    }
    const ranks = [
        ...findAllByClass(container, 'rank-1'),
        ...findAllByClass(container, 'rank-2'),
        ...findAllByClass(container, 'rank-3'),
        ...findAllByClass(container, 'rank-4'),
    ];
    assert(ranks.length === 3, 'only top 3 rows are ranked (rank-4 never assigned)');
})();

console.log('\n=== renderLeaderboard skips rank classes on non-default sort ===\n');
(function testRankSkippedOnUserSort() {
    const kpi = loadModule();
    const container = makeContainer();
    const rows = [
        { coach_id: 'a', coach_name: 'Z', total_tournaments: 10, active_students_count: 1, active_players_count: 1, top3_count: 0, promotions_count: 0, new_razryads_count: 0 },
        { coach_id: 'b', coach_name: 'A', total_tournaments: 1,  active_students_count: 1, active_players_count: 1, top3_count: 0, promotions_count: 0, new_razryads_count: 0 },
    ];
    kpi.renderLeaderboard(container, rows, { sortKey: 'coach_name' });
    const r1 = findByClass(container, 'rank-1');
    assert(r1 === null,
        'no rank-1 highlight when user sorts by coach_name (sort ≠ composite)');
})();

console.log('\n=== Cell color flags react to row values ========================\n');
(function testCellFlags() {
    const kpi = loadModule();
    const container = makeContainer();
    const rows = [
        // top-3 > 0, promotions > 0, participation high (8/10 = 80%)
        { coach_id: 'a', coach_name: 'A', total_tournaments: 5, active_students_count: 10, active_players_count: 8, top3_count: 3, promotions_count: 2, new_razryads_count: 0 },
        // top-3 = 0, promotions = 0, participation mid (5/10 = 50%)
        { coach_id: 'b', coach_name: 'B', total_tournaments: 4, active_students_count: 10, active_players_count: 5, top3_count: 0, promotions_count: 0, new_razryads_count: 0 },
        // participation low (2/10 = 20%)
        { coach_id: 'c', coach_name: 'C', total_tournaments: 3, active_students_count: 10, active_players_count: 2, top3_count: 0, promotions_count: 0, new_razryads_count: 0 },
    ];
    kpi.renderLeaderboard(container, rows, {});

    function rowOf(coachId) {
        function walk(node) {
            if (!node) return null;
            if (node.tagName === 'tr' && node.dataset && node.dataset.coachId === coachId) return node;
            if (Array.isArray(node.children)) {
                for (const c of node.children) {
                    const hit = walk(c);
                    if (hit) return hit;
                }
            }
            return null;
        }
        return walk(container);
    }
    const rowA = rowOf('a');
    const rowB = rowOf('b');
    const rowC = rowOf('c');

    assert(findByClass(rowA, 'top3-cell') && /has-value/.test(findByClass(rowA, 'top3-cell').className),
        'row A: top3-cell carries .has-value (top3=3)');
    assert(findByClass(rowB, 'top3-cell') && !/has-value/.test(findByClass(rowB, 'top3-cell').className),
        'row B: top3-cell has no .has-value (top3=0)');

    assert(findByClass(rowA, 'promo-cell') && /has-value/.test(findByClass(rowA, 'promo-cell').className),
        'row A: promo-cell carries .has-value (promotions=2)');
    assert(findByClass(rowB, 'promo-cell') && !/has-value/.test(findByClass(rowB, 'promo-cell').className),
        'row B: promo-cell has no .has-value (promotions=0)');

    assert(findByClass(rowA, 'participation-cell') && /\bhigh\b/.test(findByClass(rowA, 'participation-cell').className),
        'row A: participation-cell .high band (80%)');
    assert(findByClass(rowB, 'participation-cell') && /\bmid\b/.test(findByClass(rowB, 'participation-cell').className),
        'row B: participation-cell .mid band (50%)');
    assert(findByClass(rowC, 'participation-cell') && /\blow\b/.test(findByClass(rowC, 'participation-cell').className),
        'row C: participation-cell .low band (20%)');
})();

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
