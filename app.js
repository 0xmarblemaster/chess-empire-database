const searchInput = document.getElementById('searchInput');
const clearButton = document.getElementById('clearButton');
const dropdown = document.getElementById('dropdown');

let latestResults = { students: [], coaches: [] };
let searchTimeout;

// Search students - uses Supabase if available, otherwise local cache
async function searchStudents(query) {
    if (!query) {
        return [];
    }

    const searchTerm = query.toLowerCase().trim();

    // Try Supabase search first for more efficient queries
    if (window.supabaseData && typeof window.supabaseData.searchStudents === 'function') {
        try {
            const results = await window.supabaseData.searchStudents(searchTerm);
            return results.slice(0, 8);
        } catch (error) {
            console.error('Supabase search error, falling back to local search:', error);
        }
    }

    // Fallback to local search (only if students array is available and has data)
    if (typeof students !== 'undefined' && Array.isArray(students) && students.length > 0) {
        return students
            .filter(student => `${student.firstName} ${student.lastName}`.toLowerCase().includes(searchTerm))
            .slice(0, 8);
    }

    // If no data source is available, return empty array
    console.warn('No student data available for search');
    return [];
}

// Search coaches - uses Supabase if available, otherwise local cache
async function searchCoaches(query) {
    if (!query) {
        return [];
    }

    const searchTerm = query.toLowerCase().trim();

    // Try Supabase search first
    if (window.supabaseData && typeof window.supabaseData.searchCoaches === 'function') {
        try {
            const results = await window.supabaseData.searchCoaches(searchTerm);
            return results.slice(0, 3);
        } catch (error) {
            console.error('Supabase coach search error, falling back to local search:', error);
        }
    }

    // Fallback to local search
    if (typeof coaches !== 'undefined' && Array.isArray(coaches) && coaches.length > 0) {
        return coaches
            .filter(coach => `${coach.firstName} ${coach.lastName}`.toLowerCase().includes(searchTerm))
            .slice(0, 3);
    }

    return [];
}

// Combined search for students and coaches
async function searchAll(query) {
    const [studentResults, coachResults] = await Promise.all([
        searchStudents(query),
        searchCoaches(query)
    ]);

    return { students: studentResults, coaches: coachResults };
}

function renderDropdown(results) {
    latestResults = results;
    const { students: studentResults, coaches: coachResults } = results;

    if (studentResults.length === 0 && coachResults.length === 0) {
        dropdown.innerHTML = `
            <div class="dropdown-item" style="cursor: default; border-left: none;">
                <div style="color: #64748b;">${t('index.noResults') || t('index.noStudents')}</div>
            </div>
        `;
        return;
    }

    let html = '';

    // Render coaches first (if any)
    if (coachResults.length > 0) {
        html += `
            <div class="dropdown-section-header">
                <i data-lucide="award" style="width: 14px; height: 14px; color: #14b8a6;"></i>
                <span>${t('index.coaches') || 'Coaches'}</span>
            </div>
        `;
        html += coachResults.map(coach => `
            <div class="dropdown-item dropdown-item-coach" onclick="viewCoach('${coach.id}')">
                <div class="dropdown-item-avatar coach-avatar-small">
                    ${coach.photoUrl
                        ? `<img src="${coach.photoUrl}" alt="${coach.firstName}">`
                        : `${coach.firstName[0]}${coach.lastName[0]}`
                    }
                </div>
                <div>
                    <div class="student-name">${coach.firstName} ${coach.lastName}</div>
                    <div class="student-meta">
                        <span>${i18n.translateBranchName(coach.branch || coach.branchName)}</span>
                        <span>•</span>
                        <span style="color: #14b8a6; font-weight: 600;">${t('index.coachBadge') || 'Coach'}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Render students
    if (studentResults.length > 0) {
        if (coachResults.length > 0) {
            html += `
                <div class="dropdown-section-header">
                    <i data-lucide="users" style="width: 14px; height: 14px; color: #667eea;"></i>
                    <span>${t('index.students') || 'Students'}</span>
                </div>
            `;
        }
        html += studentResults.map(student => `
            <div class="dropdown-item" onclick="viewStudent('${student.id}')">
                <div>
                    <div class="student-name">${student.firstName} ${student.lastName}</div>
                    <div class="student-meta">
                        <span>${i18n.translateBranchName(student.branch)}</span>
                        <span>•</span>
                        <span>${t('index.coachLabel', { coach: student.coach })}</span>
                    </div>
                </div>
                ${student.razryad ? `
                    <span class="badge">
                        <i data-lucide="award" style="width: 12px; height: 12px;"></i>
                        ${t('index.razryadBadge', { razryad: translateRazryad(student.razryad, { fallback: '' }) })}
                    </span>
                ` : ''}
            </div>
        `).join('');
    }

    dropdown.innerHTML = html;
    lucide.createIcons();
}

searchInput.addEventListener('input', async (e) => {
    const value = e.target.value;

    // Clear any pending search
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    if (value.length > 0) {
        clearButton.classList.add('visible');

        // Show loading state
        dropdown.innerHTML = `
            <div class="dropdown-item" style="cursor: default; border-left: none;">
                <div style="color: #64748b;">${t('common.loading') || 'Searching...'}</div>
            </div>
        `;
        dropdown.classList.add('active');

        // Debounce search for Supabase queries
        searchTimeout = setTimeout(async () => {
            const results = await searchAll(value);
            renderDropdown(results);
        }, 300);
    } else {
        clearButton.classList.remove('visible');
        dropdown.classList.remove('active');
    }
});

clearButton.addEventListener('click', () => {
    searchInput.value = '';
    clearButton.classList.remove('visible');
    dropdown.classList.remove('active');
    searchInput.focus();
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        dropdown.classList.remove('active');
    }
});

function viewStudent(studentId) {
    localStorage.setItem('selectedStudentId', studentId);
    window.location.href = 'student.html';
}

function viewCoach(coachId) {
    localStorage.setItem('selectedCoachId', coachId);
    window.location.href = 'coach.html';
}

document.addEventListener('languagechange', async () => {
    if (searchInput.value.trim().length > 0) {
        if (!latestResults.students?.length && !latestResults.coaches?.length) {
            latestResults = await searchAll(searchInput.value);
        }
        renderDropdown(latestResults);
        dropdown.classList.add('active');
    } else if (dropdown.classList.contains('active')) {
        renderDropdown({ students: [], coaches: [] });
        dropdown.classList.remove('active');
    }
});
