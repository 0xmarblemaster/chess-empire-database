const searchInput = document.getElementById('searchInput');
const clearButton = document.getElementById('clearButton');
const dropdown = document.getElementById('dropdown');

let latestResults = [];

function searchStudents(query) {
    if (!query) {
        return [];
    }

    const searchTerm = query.toLowerCase().trim();
    return students
        .filter(student => `${student.firstName} ${student.lastName}`.toLowerCase().includes(searchTerm))
        .slice(0, 10);
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
        <div class="dropdown-item" onclick="viewStudent(${student.id})">
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

searchInput.addEventListener('input', (e) => {
    const value = e.target.value;

    if (value.length > 0) {
        clearButton.classList.add('visible');
        const results = searchStudents(value);
        renderDropdown(results);
        dropdown.classList.add('active');
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

document.addEventListener('languagechange', () => {
    if (searchInput.value.trim().length > 0) {
        if (!latestResults.length) {
            latestResults = searchStudents(searchInput.value);
        }
        renderDropdown(latestResults);
        dropdown.classList.add('active');
    } else if (dropdown.classList.contains('active')) {
        renderDropdown([]);
        dropdown.classList.remove('active');
    }
});
