(async function() {
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
        const { data: students, error } = await supabase
            .from('students')
            .select('id, first_name, last_name, photo_url, current_level, current_lesson, branch_id, branch:branches(name), status')
            .eq('status', 'active');

        if (error) { console.error('Students error:', error); return null; }

        const { data: branches } = await supabase
            .from('branches')
            .select('id, name')
            .order('name');

        students.sort((a, b) => {
            if ((b.current_level || 1) !== (a.current_level || 1)) return (b.current_level || 1) - (a.current_level || 1);
            if ((b.current_lesson || 1) !== (a.current_lesson || 1)) return (b.current_lesson || 1) - (a.current_lesson || 1);
            const lastCmp = (a.last_name || '').localeCompare(b.last_name || '');
            if (lastCmp !== 0) return lastCmp;
            return (a.first_name || '').localeCompare(b.first_name || '');
        });

        const leaderboard = students.map((s, i) => ({
            rank: i + 1,
            studentId: s.id,
            firstName: s.first_name || '',
            lastName: s.last_name || '',
            photoUrl: s.photo_url,
            branch: s.branch?.name || '',
            branchId: s.branch_id,
            level: Math.min(s.current_level || 1, 8),
            lesson: s.current_lesson || 1
        }));

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
        return medals[rank] || rank;
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

    function renderTable(entries) {
        if (entries.length === 0) {
            return '<div class="loading">No players found.</div>';
        }
        let html = `<table class="leaderboard-table">
            <thead><tr>
                <th style="text-align:center">#</th>
                <th>Player</th>
                <th class="branch-col">Branch</th>
                <th>Level</th>
                <th>Lesson</th>
            </tr></thead><tbody>`;
        for (const e of entries) {
            html += `<tr class="row ${getRowClass(e.rank)}">
                <td class="rank-cell">${getRankDisplay(e.rank)}</td>
                <td><div class="name-cell">${renderAvatar(e)}<a href="student.html?id=${e.studentId}" class="student-name" style="color:inherit;text-decoration:none;">${e.firstName} ${e.lastName}</a></div></td>
                <td class="branch-col" style="color:#64748b;font-size:0.85rem">${e.branch}</td>
                <td class="level-cell">Level <strong>${e.level}</strong></td>
                <td class="lesson-cell">${e.lesson}</td>
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

    const result = await loadLeaderboard();
    if (!result) {
        document.getElementById('tableContainer').innerHTML = '<div class="loading">Error loading data.</div>';
        return;
    }
    allData = result;

    document.getElementById('playerCount').textContent = `${allData.leaderboard.length} players`;

    const branchSelect = document.getElementById('branchFilter');
    for (const b of allData.branches) {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.name;
        branchSelect.appendChild(opt);
    }

    applyFilters();

    document.getElementById('searchInput').addEventListener('input', applyFilters);
    document.getElementById('branchFilter').addEventListener('change', applyFilters);
})();
