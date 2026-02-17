(async function() {
    // Wait for supabase client
    let retries = 0;
    while (!window.supabaseClient && retries < 20) {
        await new Promise(r => setTimeout(r, 200));
        retries++;
    }
    if (!window.supabaseClient) {
        document.getElementById('tableContainer').innerHTML = '<div class="loading">Failed to connect to database.</div>';
        return;
    }

    const supabase = window.supabaseClient;
    let allData = { leaderboard: [], branches: [] };

    async function loadLeaderboard() {
        const { data: allRatings, error: ratErr } = await supabase
            .from('student_ratings')
            .select('student_id, rating, rating_date')
            .order('rating_date', { ascending: false });

        if (ratErr) { console.error('Ratings error:', ratErr); return null; }

        const latestMap = new Map();
        const previousMap = new Map();
        for (const r of allRatings) {
            if (!latestMap.has(r.student_id)) {
                latestMap.set(r.student_id, { rating: r.rating, date: r.rating_date });
            } else if (!previousMap.has(r.student_id)) {
                previousMap.set(r.student_id, { rating: r.rating, date: r.rating_date });
            }
        }

        const studentIds = Array.from(latestMap.keys());
        if (studentIds.length === 0) return { leaderboard: [], branches: [] };

        // Fetch in batches if needed (Supabase .in() limit)
        let students = [];
        const batchSize = 200;
        for (let i = 0; i < studentIds.length; i += batchSize) {
            const batch = studentIds.slice(i, i + batchSize);
            const { data } = await supabase
                .from('students')
                .select('id, first_name, last_name, photo_url, branch_id, branch:branches(name)')
                .in('id', batch);
            if (data) students.push(...data);
        }

        const { data: branches } = await supabase
            .from('branches')
            .select('id, name')
            .order('name');

        const studentMap = new Map(students.map(s => [s.id, s]));
        const leaderboard = [];
        for (const [studentId, ratingData] of latestMap) {
            const student = studentMap.get(studentId);
            if (!student || ratingData.rating <= 0) continue;
            const prev = previousMap.get(studentId);
            const delta = prev ? ratingData.rating - prev.rating : null;
            leaderboard.push({
                studentId,
                firstName: student.first_name || '',
                lastName: student.last_name || '',
                photoUrl: student.photo_url,
                branch: student.branch?.name || '',
                branchId: student.branch_id,
                rating: ratingData.rating,
                delta
            });
        }
        leaderboard.sort((a, b) => b.rating - a.rating);
        leaderboard.forEach((entry, i) => entry.rank = i + 1);

        return { leaderboard, branches: branches || [] };
    }

    function getRowClass(rank) {
        if (rank <= 3) return 'tier-top3';
        if (rank <= 10) return 'tier-top10';
        if (rank <= 20) return 'tier-top20';
        if (rank <= 100) return 'tier-top100';
        return '';
    }

    function getRankDisplay(rank) {
        const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
        return medals[rank] ? `${medals[rank]}` : rank;
    }

    function getInitialsColor(name) {
        const colors = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#ef4444','#6366f1','#14b8a6'];
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    }

    function renderAvatar(entry) {
        const name = `${entry.firstName} ${entry.lastName}`.trim();
        if (entry.photoUrl) {
            return `<img class="avatar" src="${entry.photoUrl}" alt="${name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="avatar-initials" style="display:none;background:${getInitialsColor(name)}">${(entry.firstName[0]||'')+(entry.lastName[0]||'')}</div>`;
        }
        const initials = ((entry.firstName[0]||'') + (entry.lastName[0]||'')).toUpperCase();
        return `<div class="avatar-initials" style="background:${getInitialsColor(name)}">${initials}</div>`;
    }

    function renderDelta(delta) {
        if (delta === null || delta === undefined) return '<span class="delta-neutral">—</span>';
        if (delta > 0) return `<span class="delta-positive">+${delta}</span>`;
        if (delta < 0) return `<span class="delta-negative">${delta}</span>`;
        return '<span class="delta-neutral">0</span>';
    }

    function renderTable(entries) {
        if (entries.length === 0) {
            return '<div class="loading">No players found.</div>';
        }
        let html = `<table class="leaderboard-table">
            <thead><tr>
                <th style="text-align:center">#</th>
                <th>Player</th>
                <th class="branch-col">Branch</th>
                <th>Rating</th>
                <th>Δ</th>
            </tr></thead><tbody>`;
        for (const e of entries) {
            html += `<tr class="row ${getRowClass(e.rank)}">
                <td class="rank-cell">${getRankDisplay(e.rank)}</td>
                <td><div class="name-cell">${renderAvatar(e)}<a href="student.html?id=${e.studentId}" class="student-name" style="color:inherit;text-decoration:none;">${e.firstName} ${e.lastName}</a></div></td>
                <td class="branch-col" style="color:#64748b;font-size:0.85rem">${e.branch}</td>
                <td class="rating-cell">${e.rating}</td>
                <td>${renderDelta(e.delta)}</td>
            </tr>`;
        }
        html += '</tbody></table>';
        return html;
    }

    function applyFilters() {
        const search = document.getElementById('searchInput').value.toLowerCase().trim();
        const branchId = document.getElementById('branchFilter').value;
        let filtered = allData.leaderboard;
        if (search) {
            filtered = filtered.filter(e =>
                `${e.firstName} ${e.lastName}`.toLowerCase().includes(search)
            );
        }
        if (branchId) {
            filtered = filtered.filter(e => String(e.branchId) === branchId);
        }
        document.getElementById('tableContainer').innerHTML = renderTable(filtered);
    }

    // Load data
    const result = await loadLeaderboard();
    if (!result) {
        document.getElementById('tableContainer').innerHTML = '<div class="loading">Error loading data.</div>';
        return;
    }
    allData = result;

    // Update count
    document.getElementById('playerCount').textContent = `${allData.leaderboard.length} players`;

    // Populate branch filter
    const branchSelect = document.getElementById('branchFilter');
    for (const b of allData.branches) {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.name;
        branchSelect.appendChild(opt);
    }

    // Render
    applyFilters();

    // Event listeners
    document.getElementById('searchInput').addEventListener('input', applyFilters);
    document.getElementById('branchFilter').addEventListener('change', applyFilters);
})();
