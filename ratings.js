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
    let allData = { leaderboard: [], branches: [], coaches: [] };

    async function loadLeaderboard() {
        const { data, error } = await supabase.rpc('get_rating_leaderboard');
        if (error) { console.error('RPC error:', error); return null; }

        const branchMap = new Map();
        const coachMap = new Map();
        const leaderboard = data.map((r, i) => {
            if (r.branch_id && r.branch_name) branchMap.set(r.branch_id, r.branch_name);
            if (r.coach_id && r.coach_first_name) coachMap.set(r.coach_id, { id: r.coach_id, first_name: r.coach_first_name, last_name: r.coach_last_name });
            return {
                studentId: r.student_id,
                firstName: r.first_name || '',
                lastName: r.last_name || '',
                photoUrl: r.photo_url,
                branch: r.branch_name || '',
                branchId: r.branch_id,
                coachId: r.coach_id,
                rating: r.rating,
                delta: r.delta === 0 ? null : r.delta,
                rank: i + 1
            };
        });

        const branches = Array.from(branchMap, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
        const coaches = Array.from(coachMap.values()).sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));

        return { leaderboard, branches, coaches };
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
            return `<img class="avatar" src="${entry.photoUrl}" alt="${name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="avatar-initials" style="display:none;background:${getInitialsColor(name)}">${(entry.firstName[0]||'')+(entry.lastName[0]||'')}</div>`;
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
        const coachId = document.getElementById('coachFilter').value;
        let filtered = allData.leaderboard;
        if (search) {
            filtered = filtered.filter(e =>
                `${e.firstName} ${e.lastName}`.toLowerCase().includes(search)
            );
        }
        if (branchId) {
            filtered = filtered.filter(e => String(e.branchId) === branchId);
        }
        if (coachId) {
            filtered = filtered.filter(e => String(e.coachId) === coachId);
        }
        if (branchId || coachId) {
            filtered = filtered.map((e, i) => ({ ...e, rank: i + 1 }));
        }
        document.getElementById('playerCount').textContent = `${filtered.length} players`;
        document.getElementById('tableContainer').innerHTML = renderTable(filtered);
    }

    function populateCoachFilter(branchId) {
        const coachSelect = document.getElementById('coachFilter');
        const currentVal = coachSelect.value;
        coachSelect.innerHTML = '<option value="">All Coaches</option>';
        let coaches = allData.coaches;
        if (branchId) {
            const coachIdsInBranch = new Set(
                allData.leaderboard.filter(e => String(e.branchId) === branchId && e.coachId).map(e => e.coachId)
            );
            coaches = coaches.filter(c => coachIdsInBranch.has(c.id));
        }
        for (const c of coaches) {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.first_name || ''} ${c.last_name || ''}`.trim();
            coachSelect.appendChild(opt);
        }
        if (currentVal && [...coachSelect.options].some(o => o.value === currentVal)) {
            coachSelect.value = currentVal;
        } else {
            coachSelect.value = '';
        }
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
    populateCoachFilter('');
    applyFilters();

    // Event listeners
    document.getElementById('searchInput').addEventListener('input', applyFilters);
    document.getElementById('branchFilter').addEventListener('change', () => {
        populateCoachFilter(branchSelect.value);
        applyFilters();
    });
    document.getElementById('coachFilter').addEventListener('change', applyFilters);
})();
