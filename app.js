const searchInput = document.getElementById('searchInput');
const clearButton = document.getElementById('clearButton');
const dropdown = document.getElementById('dropdown');

let latestResults = [];
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
            return results.slice(0, 10);
        } catch (error) {
            console.error('Supabase search error, falling back to local search:', error);
        }
    }

    // Fallback to local search (only if students array is available and has data)
    if (typeof students !== 'undefined' && Array.isArray(students) && students.length > 0) {
        return students
            .filter(student => `${student.firstName} ${student.lastName}`.toLowerCase().includes(searchTerm))
            .slice(0, 10);
    }

    // If no data source is available, return empty array
    console.warn('No student data available for search');
    return [];
}

function renderDropdown(results) {
    latestResults = results;

    if (results.length === 0) {
        dropdown.innerHTML = `
            <div class="dropdown-item" style="cursor: default; border-left: none;">
                <div style="color: #64748b;">${t('index.noStudents')}</div>
            </div>
        `;
        return;
    }

    dropdown.innerHTML = results.map(student => `
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
            const results = await searchStudents(value);
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

document.addEventListener('languagechange', async () => {
    if (searchInput.value.trim().length > 0) {
        if (!latestResults.length) {
            latestResults = await searchStudents(searchInput.value);
        }
        renderDropdown(latestResults);
        dropdown.classList.add('active');
    } else if (dropdown.classList.contains('active')) {
        renderDropdown([]);
        dropdown.classList.remove('active');
    }
});
