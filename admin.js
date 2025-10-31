// Admin Dashboard JavaScript

// Current filters
let currentFilters = {
    status: 'all',
    branch: 'all',
    coach: 'all',
    level: 'all',
    search: ''
};

function applyAdminTranslations() {
    applyTranslations();
    updateLevelFilterLabels();
    updateResultCount();
}

function updateLevelFilterLabels() {
    const levelOptions = document.querySelectorAll('#levelFilter option[data-level]');
    levelOptions.forEach(option => {
        const level = option.getAttribute('data-level');
        option.textContent = t('admin.filters.level.option', { level });
    });
}

function updateResultCount(count = null) {
    const resultCountEl = document.getElementById('resultCount');
    if (!resultCountEl) return;

    const filteredCount = count !== null ? count : getFilteredStudents().length;
    resultCountEl.textContent = t('common.showingResults', {
        count: filteredCount,
        total: students.length
    });
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    document.title = t('admin.title');
    loadStatistics();
    populateFilterDropdowns();
    populateBranchDropdown();
    populateCoachDropdown();
    applyAdminTranslations();
    loadStudents();
    setupEventListeners();
    lucide.createIcons();
});

document.addEventListener('languagechange', () => {
    document.title = t('admin.title');
    applyAdminTranslations();
    loadStatistics();
    populateFilterDropdowns();
    populateBranchDropdown();
    populateCoachDropdown();
    loadStudents();
    lucide.createIcons();
});

// Load statistics
function loadStatistics() {
    const totalStudents = students.length;
    const totalCoaches = coaches.length;
    const uniqueBranches = [...new Set(branches.map(b => b.name))];
    const totalBranches = uniqueBranches.length;
    const activeStudents = students.filter(s => s.status === 'active').length;

    // Update main stats
    document.getElementById('totalStudents').textContent = totalStudents;
    document.getElementById('totalCoaches').textContent = totalCoaches;
    document.getElementById('totalBranches').textContent = totalBranches;
    document.getElementById('activeStudents').textContent = activeStudents;

    // Update nav badge
    const studentCountBadge = document.getElementById('studentCount');
    if (studentCountBadge) {
        studentCountBadge.textContent = totalStudents;
    }
}

// Alias for loadStatistics (for compatibility)
function updateStats() {
    loadStatistics();
}

// Populate filter dropdowns
function populateFilterDropdowns() {
    // Branch filter
    const branchFilter = document.getElementById('branchFilter');
    const currentBranchValue = branchFilter.value;
    branchFilter.querySelectorAll('option[data-branch]').forEach(option => option.remove());
    const branches = [...new Set(students.map(s => s.branch))];
    branches.forEach(branch => {
        const option = document.createElement('option');
        option.value = branch;
        option.textContent = i18n.translateBranchName(branch);
        option.dataset.branch = branch;
        branchFilter.appendChild(option);
    });
    if (currentBranchValue) {
        branchFilter.value = currentBranchValue;
    }

    // Coach filter
    const coachFilter = document.getElementById('coachFilter');
    const currentCoachValue = coachFilter.value;
    coachFilter.querySelectorAll('option[data-coach]').forEach(option => option.remove());
    const coachNames = [...new Set(students.map(s => s.coach))];
    coachNames.forEach(coach => {
        const option = document.createElement('option');
        option.value = coach;
        option.textContent = coach;
        option.dataset.coach = coach;
        coachFilter.appendChild(option);
    });
    if (currentCoachValue) {
        coachFilter.value = currentCoachValue;
    }
}

// Get filtered students
function getFilteredStudents() {
    return students.filter(student => {
        // Status filter
        if (currentFilters.status !== 'all' && student.status !== currentFilters.status) {
            return false;
        }

        // Branch filter
        if (currentFilters.branch !== 'all' && student.branch !== currentFilters.branch) {
            return false;
        }

        // Coach filter
        if (currentFilters.coach !== 'all' && student.coach !== currentFilters.coach) {
            return false;
        }

        // Level filter
        if (currentFilters.level !== 'all' && student.currentLevel !== parseInt(currentFilters.level)) {
            return false;
        }

        // Search filter
        if (currentFilters.search) {
            const searchTerm = currentFilters.search.toLowerCase();
            const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
            if (!fullName.includes(searchTerm)) {
                return false;
            }
        }

        return true;
    });
}

// Load and display students in table
function loadStudents() {
    const tbody = document.getElementById('studentTableBody');
    const filteredStudents = getFilteredStudents();

    if (filteredStudents.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 3rem; color: #94a3b8;">
                    <i data-lucide="users" style="width: 48px; height: 48px; margin-bottom: 1rem;"></i>
                    <div style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">${t('admin.empty.table')}</div>
                    <div style="font-size: 0.875rem;">${t('admin.empty.hint')}</div>
                </td>
            </tr>
        `;
    } else {
        tbody.innerHTML = filteredStudents.map(student => `
            <tr>
                <td>
                    <div class="student-cell">
                        <div class="student-avatar">${student.firstName[0]}${student.lastName[0]}</div>
                        <div class="student-name">${student.firstName} ${student.lastName}</div>
                    </div>
                </td>
                <td>${student.age}</td>
                <td>
                    <a href="branch.html?branch=${encodeURIComponent(student.branch)}"
                       style="color: #d97706; text-decoration: none; font-weight: 500;"
                       onmouseover="this.style.textDecoration='underline'"
                       onmouseout="this.style.textDecoration='none'">
                        ${i18n.translateBranchName(student.branch)}
                    </a>
                </td>
                <td>${student.coach}</td>
                <td><span class="level-badge">${t('admin.studentCard.level', { level: student.currentLevel })}</span></td>
                <td>${translateRazryad(student.razryad || 'None')}</td>
                <td><span class="status-badge ${student.status}">${translateStatus(student.status)}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="icon-button" onclick="viewStudent(${student.id})" title="${t('admin.studentCard.view')}">
                            <i data-lucide="eye"></i>
                        </button>
                        <button class="icon-button" onclick="editStudent(${student.id})" title="${t('admin.studentCard.edit')}">
                            <i data-lucide="edit"></i>
                        </button>
                        <button class="icon-button" onclick="deleteStudentConfirm(${student.id})" title="Delete Student" style="color: #dc2626;">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    // Update result count
    updateResultCount(filteredStudents.length);

    lucide.createIcons();
}

// Setup event listeners
function setupEventListeners() {
    // Filter change listeners
    document.getElementById('statusFilter').addEventListener('change', (e) => {
        currentFilters.status = e.target.value;
        loadStudents();
    });

    document.getElementById('branchFilter').addEventListener('change', (e) => {
        currentFilters.branch = e.target.value;
        loadStudents();
    });

    document.getElementById('coachFilter').addEventListener('change', (e) => {
        currentFilters.coach = e.target.value;
        loadStudents();
    });

    document.getElementById('levelFilter').addEventListener('change', (e) => {
        currentFilters.level = e.target.value;
        loadStudents();
    });

    // Search input listener with debouncing
    let searchTimeout;
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearch');

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);

        // Show/hide clear button
        if (e.target.value) {
            clearSearchBtn.style.display = 'block';
        } else {
            clearSearchBtn.style.display = 'none';
        }

        searchTimeout = setTimeout(() => {
            currentFilters.search = e.target.value;
            loadStudents();
        }, 300);
    });

    // Clear search button
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.style.display = 'none';
        currentFilters.search = '';
        loadStudents();
    });

    // Mobile menu toggle
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.querySelector('.sidebar');
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
        });
    }

    // Navigation items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            // Remove active class from all items
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            // Add active class to clicked item
            this.classList.add('active');
        });
    });
}

// View student profile
function viewStudent(studentId) {
    localStorage.setItem('selectedStudentId', studentId);
    window.location.href = 'student.html';
}

// Note: editStudent, addNewStudent, and deleteStudentConfirm are defined in crud-handlers.js

// Add new student (placeholder for legacy code)
function addNewStudentLegacy() {
    alert(t('admin.alert.addStudent'));
}

// Export data (placeholder)
function exportData() {
    alert(t('admin.alert.export'));
}

// Reset all filters
function resetFilters() {
    currentFilters = {
        status: 'all',
        branch: 'all',
        coach: 'all',
        level: 'all',
        search: ''
    };

    document.getElementById('statusFilter').value = 'all';
    document.getElementById('branchFilter').value = 'all';
    document.getElementById('coachFilter').value = 'all';
    document.getElementById('levelFilter').value = 'all';
    document.getElementById('searchInput').value = '';

    loadStudents();
}

// Show different sections
function showSection(section) {
    console.log(`Switching to ${section} section...`);

    if (section === 'students') {
        switchToSection('students');
        // Clear branch selection when returning to students
        currentlySelectedBranch = null;
        updateBranchDropdownSelection();
    } else if (section === 'coaches') {
        // Future: Coaches section
        alert(t('admin.alert.coaches'));
    }
}

// Track currently selected branch
let currentlySelectedBranch = null;

// View branch inline (replaced redirect)
function viewBranch(branchName) {
    // Find branch data
    const branch = branches.find(b => b.name === branchName);
    if (!branch) return;

    // Switch to branch section
    switchToSection('branch');

    // Load branch data
    loadBranchView(branch);

    // Update selected branch tracking
    currentlySelectedBranch = branchName;

    // Update dropdown item highlighting
    updateBranchDropdownSelection();

    // Keep dropdown open - removed auto-close behavior
    // User can click elsewhere or click Branches button again to close
}

// Populate branch dropdown
function populateBranchDropdown() {
    const dropdown = document.getElementById('branchDropdown');

    const dropdownHTML = branches.map(branch => {
        const studentCount = students.filter(s => s.branch === branch.name).length;
        const displayName = i18n.translateBranchName(branch.name);
        return `
            <div class="dropdown-item" data-branch-name="${branch.name}" onclick="event.stopPropagation(); viewBranch('${branch.name}')">
                <i data-lucide="map-pin" class="dropdown-item-icon"></i>
                <span class="dropdown-item-text">${displayName}</span>
                <span style="font-size: 0.75rem; color: #94a3b8;">${studentCount}</span>
            </div>
        `;
    }).join('');

    dropdown.innerHTML = dropdownHTML;
    lucide.createIcons();
}

// Update branch dropdown selection highlighting
function updateBranchDropdownSelection() {
    // Remove 'selected' class from all dropdown items
    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.classList.remove('selected');
    });

    // Add 'selected' class to current branch
    if (currentlySelectedBranch) {
        const selectedItem = document.querySelector(`.dropdown-item[data-branch-name="${currentlySelectedBranch}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
    }
}

// Toggle branch dropdown
function toggleBranchDropdown(event) {
    event.stopPropagation();

    const navItem = event.currentTarget;
    const dropdown = document.getElementById('branchDropdown');

    // Toggle classes
    navItem.classList.toggle('dropdown-open');
    dropdown.classList.toggle('open');

    // Close dropdown when clicking outside
    if (dropdown.classList.contains('open')) {
        document.addEventListener('click', closeBranchDropdownOutside);
    } else {
        document.removeEventListener('click', closeBranchDropdownOutside);
    }
}

// Close dropdown when clicking outside
function closeBranchDropdownOutside(event) {
    const dropdown = document.getElementById('branchDropdown');
    const navItem = document.querySelector('.nav-item-with-dropdown');

    if (!dropdown.contains(event.target) && !navItem.contains(event.target)) {
        navItem.classList.remove('dropdown-open');
        dropdown.classList.remove('open');
        document.removeEventListener('click', closeBranchDropdownOutside);
    }
}

// Switch between sections with animation
function switchToSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });

    // Show selected section
    const targetSection = document.getElementById(`${sectionName}Section`);
    if (targetSection) {
        // Small delay for smooth transition
        setTimeout(() => {
            targetSection.classList.add('active');
            lucide.createIcons();
        }, 50);
    }

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Clear selections when returning to Students
    if (sectionName === 'students') {
        currentlySelectedBranch = null;
        currentlySelectedCoach = null;
        updateBranchDropdownSelection();
        updateCoachDropdownSelection();
    }
}

// Load branch view with all data
let branchCharts = {};

function loadBranchView(branch) {
    // Get students and coaches for this branch
    const branchStudents = students.filter(s => s.branch === branch.name);
    const branchCoaches = coaches.filter(c => c.branch === branch.name);

    // Update header
    document.getElementById('branchViewName').textContent = i18n.translateBranchName(branch.name);
    document.getElementById('branchViewLocation').textContent = i18n.translateBranchLocation(branch.location);
    document.getElementById('branchViewPhone').textContent = branch.phone;
    document.getElementById('branchViewEmail').textContent = branch.email;

    // Update statistics
    const activeStudents = branchStudents.filter(s => s.status === 'active').length;
    const avgLevel = branchStudents.length > 0
        ? (branchStudents.reduce((sum, s) => sum + s.currentLevel, 0) / branchStudents.length).toFixed(1)
        : 0;

    document.getElementById('branchTotalStudents').textContent = branchStudents.length;
    document.getElementById('branchActiveStudents').textContent = activeStudents;
    document.getElementById('branchTotalCoaches').textContent = branchCoaches.length;
    document.getElementById('branchAvgLevel').textContent = avgLevel;

    // Load coaches list
    loadBranchCoaches(branchCoaches, branchStudents);

    // Load students list
    loadBranchStudents(branchStudents);

    // Load charts
    loadBranchCharts(branchStudents);
}

// Load branch coaches list
function loadBranchCoaches(branchCoaches, branchStudents) {
    const coachesList = document.getElementById('branchCoachesList');

    if (branchCoaches.length === 0) {
        coachesList.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 2rem;">${t('branch.noCoaches')}</div>`;
        return;
    }

    coachesList.innerHTML = branchCoaches.map(coach => {
        const coachStudents = branchStudents.filter(s =>
            s.coach === `${coach.firstName} ${coach.lastName}`
        );
        return `
            <div class="branch-coach-item">
                <div class="branch-coach-avatar">${coach.firstName[0]}${coach.lastName[0]}</div>
                <div class="branch-coach-info">
                    <div class="branch-coach-name">${coach.firstName} ${coach.lastName}</div>
                    <div class="branch-coach-meta">${coach.email}</div>
                </div>
                <div class="branch-coach-count">${t('branch.coachCount', { count: coachStudents.length })}</div>
            </div>
        `;
    }).join('');
}

// Load branch students list
function loadBranchStudents(branchStudents) {
    const studentsList = document.getElementById('branchStudentsList');

    if (branchStudents.length === 0) {
        studentsList.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 2rem;">${t('branch.noStudents')}</div>`;
        return;
    }

    studentsList.innerHTML = branchStudents.map(student => {
        return `
            <div class="branch-student-item" onclick="viewStudent(${student.id})">
                <div class="branch-student-avatar">${student.firstName[0]}${student.lastName[0]}</div>
                <div class="branch-student-info">
                    <div class="branch-student-name">${student.firstName} ${student.lastName}</div>
                    <div class="branch-student-meta">${t('branch.studentMeta', { age: student.age, coach: student.coach })}</div>
                </div>
                <div class="branch-student-level">${t('branch.studentLevel', { level: student.currentLevel })}</div>
            </div>
        `;
    }).join('');
}

// Load branch charts
function loadBranchCharts(branchStudents) {
    // Destroy existing charts
    if (branchCharts.razryad) {
        branchCharts.razryad.destroy();
    }
    if (branchCharts.level) {
        branchCharts.level.destroy();
    }

    // Load Razryad Chart
    const razryadCounts = {
        KMS: 0,
        '1st': 0,
        '2nd': 0,
        '3rd': 0,
        None: 0
    };

    branchStudents.forEach(student => {
        const razryad = student.razryad || 'None';
        if (razryadCounts[razryad] !== undefined) {
            razryadCounts[razryad]++;
        }
    });

    const razryadCtx = document.getElementById('branchRazryadChart');
    const razryadLabels = t('branch.chart.razryadLabels');
    const razryadData = [
        razryadCounts.KMS,
        razryadCounts['1st'],
        razryadCounts['2nd'],
        razryadCounts['3rd'],
        razryadCounts.None
    ];

    branchCharts.razryad = new Chart(razryadCtx, {
        type: 'doughnut',
        data: {
            labels: razryadLabels,
            datasets: [{
                data: razryadData,
                backgroundColor: [
                    '#d97706',
                    '#3b82f6',
                    '#10b981',
                    '#8b5cf6',
                    '#94a3b8'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 12,
                        font: {
                            size: 11,
                            family: "'Inter', sans-serif"
                        },
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const value = context.parsed || 0;
                            const total = razryadData.reduce((sum, val) => sum + val, 0);
                            const percent = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            const label = razryadLabels[context.dataIndex] || '';
                            return t('branch.chart.tooltipWithPercent', {
                                label,
                                value,
                                percent
                            });
                        }
                    }
                }
            }
        }
    });

    // Load Level Chart
    const levelCounts = {
        1: 0, 2: 0, 3: 0, 4: 0,
        5: 0, 6: 0, 7: 0, 8: 0
    };

    branchStudents.forEach(student => {
        if (levelCounts[student.currentLevel] !== undefined) {
            levelCounts[student.currentLevel]++;
        }
    });

    const levelCtx = document.getElementById('branchLevelChart');
    const levelLabels = Array.from({ length: 8 }, (_, index) => t('branch.chart.levelLabel', { level: index + 1 }));
    const levelData = Object.values(levelCounts);

    branchCharts.level = new Chart(levelCtx, {
        type: 'bar',
        data: {
            labels: levelLabels,
            datasets: [{
                label: t('branch.chart.studentsLabel'),
                data: levelData,
                backgroundColor: [
                    '#e0f2fe',
                    '#bfdbfe',
                    '#93c5fd',
                    '#60a5fa',
                    '#3b82f6',
                    '#2563eb',
                    '#1d4ed8',
                    '#1e40af'
                ],
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: (context) => t('branch.chart.tooltip', { count: context.parsed.y })
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        font: {
                            family: "'Inter', sans-serif",
                            size: 11
                        }
                    },
                    grid: {
                        color: '#f1f5f9'
                    }
                },
                x: {
                    ticks: {
                        font: {
                            family: "'Inter', sans-serif",
                            size: 11
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// ============================================
// COACH FUNCTIONS
// ============================================

let currentlySelectedCoach = null;
let coachCharts = {};

// Populate coach dropdown
function populateCoachDropdown() {
    const dropdown = document.getElementById('coachDropdown');

    const dropdownHTML = coaches.map(coach => {
        const coachFullName = `${coach.firstName} ${coach.lastName}`;
        const studentCount = students.filter(s => s.coach === coachFullName).length;
        return `
            <div class="dropdown-item" data-coach-name="${coachFullName}" onclick="event.stopPropagation(); viewCoach('${coachFullName}')">
                <i data-lucide="user" class="dropdown-item-icon"></i>
                <div class="dropdown-item-text" style="display: flex; flex-direction: column; gap: 0.125rem; flex: 1;">
                    <div style="font-weight: 500;">${coach.firstName}</div>
                    <div style="font-weight: 500;">${coach.lastName}</div>
                </div>
                <span style="font-size: 0.75rem; color: #94a3b8; margin-left: auto;">${studentCount}</span>
            </div>
        `;
    }).join('');

    dropdown.innerHTML = dropdownHTML;
    lucide.createIcons();
}

// Toggle coach dropdown
function toggleCoachDropdown(event) {
    event.stopPropagation();

    const navItem = event.currentTarget;
    const dropdown = document.getElementById('coachDropdown');

    navItem.classList.toggle('dropdown-open');
    dropdown.classList.toggle('open');

    if (dropdown.classList.contains('open')) {
        document.addEventListener('click', closeCoachDropdownOutside);
    } else {
        document.removeEventListener('click', closeCoachDropdownOutside);
    }
}

// Close coach dropdown when clicking outside
function closeCoachDropdownOutside(event) {
    const dropdown = document.getElementById('coachDropdown');
    const navItem = document.querySelector('.nav-item-with-dropdown:has(+ #coachDropdown)');

    if (!dropdown.contains(event.target) && !navItem.contains(event.target)) {
        dropdown.classList.remove('open');
        navItem.classList.remove('dropdown-open');
        document.removeEventListener('click', closeCoachDropdownOutside);
    }
}

// Update coach dropdown selection highlighting
function updateCoachDropdownSelection() {
    document.querySelectorAll('#coachDropdown .dropdown-item').forEach(item => {
        item.classList.remove('selected');
    });

    if (currentlySelectedCoach) {
        const selectedItem = document.querySelector(`#coachDropdown .dropdown-item[data-coach-name="${currentlySelectedCoach}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
    }
}

// View coach details
function viewCoach(coachFullName) {
    const coach = coaches.find(c => `${c.firstName} ${c.lastName}` === coachFullName);
    if (!coach) return;

    switchToSection('coach');
    loadCoachView(coach);

    currentlySelectedCoach = coachFullName;
    updateCoachDropdownSelection();
}

// Load coach view with data
function loadCoachView(coach) {
    const coachFullName = `${coach.firstName} ${coach.lastName}`;
    const coachStudents = students.filter(s => s.coach === coachFullName);

    // Update header
    document.getElementById('coachViewName').textContent = coachFullName;
    document.getElementById('coachViewBranch').textContent = coach.branch;
    document.getElementById('coachViewPhone').textContent = coach.phone;
    document.getElementById('coachViewEmail').textContent = coach.email;

    // Calculate statistics
    const activeStudents = coachStudents.filter(s => s.status === 'active').length;
    const avgLevel = coachStudents.length > 0
        ? (coachStudents.reduce((sum, s) => sum + s.currentLevel, 0) / coachStudents.length).toFixed(1)
        : 0;
    const kmsStudents = coachStudents.filter(s => s.razryad === 'KMS').length;

    // Update statistics
    document.getElementById('coachTotalStudents').textContent = coachStudents.length;
    document.getElementById('coachActiveStudents').textContent = activeStudents;
    document.getElementById('coachAvgLevel').textContent = avgLevel;
    document.getElementById('coachKMSStudents').textContent = kmsStudents;

    loadCoachStudents(coachStudents);
    loadCoachCharts(coachStudents);
}

// Load coach students list
function loadCoachStudents(coachStudents) {
    const studentsList = document.getElementById('coachStudentsList');

    if (coachStudents.length === 0) {
        studentsList.innerHTML = `<p style="text-align: center; color: #94a3b8; padding: 2rem;">${t('admin.coach.noStudents')}</p>`;
        return;
    }

    const studentsHTML = coachStudents.map(student => {
        const statusClass = student.status === 'active' ? 'success' : 'danger';
        const razryadDisplay = translateRazryad(student.razryad || 'None');

        return `
            <div class="branch-student-item" onclick="viewStudentProfile(${student.id})">
                <div class="branch-student-info">
                    <div class="branch-student-name">${student.firstName} ${student.lastName}</div>
                    <div class="branch-student-meta">
                        <span>${t('student.age')}: ${student.age}</span>
                        <span>•</span>
                        <span>${t('admin.studentCard.level', { level: student.currentLevel })}</span>
                        <span>•</span>
                        <span>${t('common.razryad')}: ${razryadDisplay}</span>
                    </div>
                </div>
                <span class="badge badge-${statusClass}">${translateStatus(student.status)}</span>
            </div>
        `;
    }).join('');

    studentsList.innerHTML = studentsHTML;
}

// Load coach charts
function loadCoachCharts(coachStudents) {
    // Destroy existing charts
    if (coachCharts.razryad) {
        coachCharts.razryad.destroy();
    }
    if (coachCharts.level) {
        coachCharts.level.destroy();
    }

    // Razryad Chart
    const razryadCounts = {
        KMS: 0, '1st': 0, '2nd': 0, '3rd': 0, None: 0
    };

    coachStudents.forEach(student => {
        const razryad = student.razryad || 'None';
        if (razryadCounts[razryad] !== undefined) {
            razryadCounts[razryad]++;
        }
    });

    const razryadCtx = document.getElementById('coachRazryadChart');
    const razryadLabels = t('branch.chart.razryadLabels');
    const razryadData = [
        razryadCounts.KMS,
        razryadCounts['1st'],
        razryadCounts['2nd'],
        razryadCounts['3rd'],
        razryadCounts.None
    ];

    coachCharts.razryad = new Chart(razryadCtx, {
        type: 'doughnut',
        data: {
            labels: razryadLabels,
            datasets: [{
                data: razryadData,
                backgroundColor: ['#d97706', '#3b82f6', '#10b981', '#8b5cf6', '#94a3b8'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 12,
                        font: {
                            size: 11,
                            family: "'Inter', sans-serif"
                        },
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const value = context.parsed || 0;
                            const total = razryadData.reduce((sum, val) => sum + val, 0);
                            const percent = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            const label = razryadLabels[context.dataIndex] || '';
                            return t('branch.chart.tooltipWithPercent', {
                                label,
                                value,
                                percent
                            });
                        }
                    }
                }
            }
        }
    });

    // Level Chart
    const levelCounts = {};
    for (let i = 1; i <= 8; i++) {
        levelCounts[i] = 0;
    }

    coachStudents.forEach(student => {
        if (student.currentLevel >= 1 && student.currentLevel <= 8) {
            levelCounts[student.currentLevel]++;
        }
    });

    const levelCtx = document.getElementById('coachLevelChart');
    const levelLabels = Array.from({ length: 8 }, (_, index) => t('branch.chart.levelLabel', { level: index + 1 }));
    const levelData = [
        levelCounts[1], levelCounts[2], levelCounts[3], levelCounts[4],
        levelCounts[5], levelCounts[6], levelCounts[7], levelCounts[8]
    ];

    coachCharts.level = new Chart(levelCtx, {
        type: 'bar',
        data: {
            labels: levelLabels,
            datasets: [{
                label: t('branch.chart.studentsLabel'),
                data: levelData,
                backgroundColor: '#d97706'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: (context) => t('branch.chart.tooltip', { count: context.parsed.y })
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        font: {
                            family: "'Inter', sans-serif",
                            size: 11
                        }
                    },
                    grid: {
                        color: '#f1f5f9'
                    }
                },
                x: {
                    ticks: {
                        font: {
                            family: "'Inter', sans-serif",
                            size: 11
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// ========================================
// ADD STUDENT FUNCTIONALITY
// ========================================

// Open Add Student Modal
function addNewStudent() {
    const modal = document.getElementById('addStudentModal');
    modal.classList.add('active');
    
    // Populate branches dropdown
    populateBranchesDropdown();
    
    // Reset form
    document.getElementById('addStudentForm').reset();
    document.getElementById('photoPreview').innerHTML = '<i data-lucide="user" style="width: 64px; height: 64px; color: #94a3b8;"></i>';
    
    // Reinitialize icons
    setTimeout(() => lucide.createIcons(), 100);
}

// Close Add Student Modal
function closeAddStudentModal() {
    const modal = document.getElementById('addStudentModal');
    modal.classList.remove('active');
}

// Populate Branches Dropdown
function populateBranchesDropdown() {
    const branchSelect = document.getElementById('branchSelect');
    const uniqueBranches = [...new Set(branches.map(b => b.name))];
    
    branchSelect.innerHTML = `<option value="">${t('admin.modals.add.branchSelect')}</option>`;
    uniqueBranches.forEach(branchName => {
        const option = document.createElement('option');
        option.value = branchName;
        option.textContent = i18n.translateBranchName(branchName);
        branchSelect.appendChild(option);
    });
}

// Update Coach Options based on selected Branch
function updateCoachOptions() {
    const branchSelect = document.getElementById('branchSelect');
    const coachSelect = document.getElementById('coachSelect');
    const selectedBranch = branchSelect.value;
    
    if (!selectedBranch) {
        coachSelect.innerHTML = `<option value="">${t('admin.modals.add.coachSelect')}</option>`;
        return;
    }
    
    // Filter coaches by selected branch
    const branchCoaches = coaches.filter(coach => coach.branch === selectedBranch);
    
    coachSelect.innerHTML = `<option value="">${t('admin.modals.add.coachSelect')}</option>`;
    branchCoaches.forEach(coach => {
        const coachFullName = `${coach.firstName} ${coach.lastName}`;
        const option = document.createElement('option');
        option.value = coachFullName;
        option.textContent = coachFullName;
        coachSelect.appendChild(option);
    });
}

// Preview Photo Upload
function previewPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
        alert(t('admin.form.fileTooLarge'));
        event.target.value = '';
        return;
    }
    
    // Check file type
    if (!file.type.match('image.*')) {
        alert(t('admin.form.imageRequired'));
        event.target.value = '';
        return;
    }
    
    // Preview image
    const reader = new FileReader();
    reader.onload = function(e) {
        const photoPreview = document.getElementById('photoPreview');
        photoPreview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
    };
    reader.readAsDataURL(file);
}

// Submit Add Student Form
function submitAddStudent(event) {
    event.preventDefault();
    
    // Get form data
    const form = document.getElementById('addStudentForm');
    const formData = new FormData(form);
    
    // Create new student object
    const newStudent = {
        id: students.length > 0 ? Math.max(...students.map(s => s.id)) + 1 : 1,
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        dateOfBirth: formData.get('dateOfBirth'),
        gender: formData.get('gender'),
        branch: formData.get('branch'),
        coach: formData.get('coach'),
        razryad: formData.get('razryad') || null,
        status: formData.get('status'),
        parentName: formData.get('parentName') || null,
        phoneNumber: formData.get('phoneNumber') || null,
        email: formData.get('email') || null
    };
    
    // Validate required fields
    if (!newStudent.firstName || !newStudent.lastName || !newStudent.branch || !newStudent.coach) {
        alert(t('admin.form.requiredFields'));
        return;
    }
    
    // Add to students array
    students.push(newStudent);
    
    // Close modal
    closeAddStudentModal();
    
    // Show success message
    showSuccessMessage(t('admin.form.addSuccess'));
    
    // Refresh the page or update UI
    updateDashboard();
    renderTable();
    updateStats();
}

// Show Success Message
function showSuccessMessage(message) {
    // Create success notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 2rem;
        right: 2rem;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.75rem;
        box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.3);
        font-weight: 600;
        font-size: 0.9375rem;
        z-index: 2000;
        animation: slideInRight 0.3s ease-out;
        display: flex;
        align-items: center;
        gap: 0.75rem;
    `;
    
    notification.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        ${message}
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Close modal when clicking outside
document.addEventListener('click', function(event) {
    const modal = document.getElementById('addStudentModal');
    if (event.target === modal) {
        closeAddStudentModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const modal = document.getElementById('addStudentModal');
        if (modal.classList.contains('active')) {
            closeAddStudentModal();
        }
    }
});


// ========================================
// EDIT STUDENT FUNCTIONALITY
// ========================================

// Open Edit Student Modal
function editStudent(studentId) {
    const student = students.find(s => s.id === studentId);
    if (!student) {
        alert(t('admin.error.studentNotFound'));
        return;
    }

    const modal = document.getElementById('editStudentModal');
    modal.classList.add('active');

    // Populate form with student data
    document.getElementById('editStudentId').value = student.id;
    document.getElementById('editFirstName').value = student.firstName;
    document.getElementById('editLastName').value = student.lastName;
    document.getElementById('editAge').value = student.age;
    document.getElementById('editGender').value = student.gender || '';
    document.getElementById('editRazryadSelect').value = student.razryad || '';
    document.getElementById('editStatusSelect').value = student.status || 'active';
    document.getElementById('editCurrentLevel').value = student.currentLevel || '';
    document.getElementById('editCurrentLesson').value = student.currentLesson || '';

    // Populate branches dropdown
    populateEditBranchesDropdown();

    // Set branch and wait for coaches to load
    setTimeout(() => {
        document.getElementById('editBranchSelect').value = student.branch;
        updateEditCoachOptions();
        
        // Set coach after coaches are loaded
        setTimeout(() => {
            document.getElementById('editCoachSelect').value = student.coach;
        }, 100);
    }, 100);

    // Reinitialize icons
    setTimeout(() => lucide.createIcons(), 150);
}

// Close Edit Student Modal
function closeEditStudentModal() {
    const modal = document.getElementById('editStudentModal');
    modal.classList.remove('active');
}

// Populate Branches Dropdown for Edit Modal
function populateEditBranchesDropdown() {
    const branchSelect = document.getElementById('editBranchSelect');
    const uniqueBranches = [...new Set(branches.map(b => b.name))];
    
    branchSelect.innerHTML = `<option value="">${t('admin.modals.add.branchSelect')}</option>`;
    uniqueBranches.forEach(branchName => {
        const option = document.createElement('option');
        option.value = branchName;
        option.textContent = i18n.translateBranchName(branchName);
        branchSelect.appendChild(option);
    });
}

// Update Coach Options for Edit Modal based on selected Branch
function updateEditCoachOptions() {
    const branchSelect = document.getElementById('editBranchSelect');
    const coachSelect = document.getElementById('editCoachSelect');
    const selectedBranch = branchSelect.value;
    
    if (!selectedBranch) {
        coachSelect.innerHTML = `<option value="">${t('admin.modals.add.coachSelect')}</option>`;
        return;
    }
    
    // Filter coaches by selected branch
    const branchCoaches = coaches.filter(coach => coach.branch === selectedBranch);
    
    coachSelect.innerHTML = `<option value="">${t('admin.modals.add.coachSelect')}</option>`;
    branchCoaches.forEach(coach => {
        const coachFullName = `${coach.firstName} ${coach.lastName}`;
        const option = document.createElement('option');
        option.value = coachFullName;
        option.textContent = coachFullName;
        coachSelect.appendChild(option);
    });
}

// Submit Edit Student Form
function submitEditStudent(event) {
    event.preventDefault();
    
    // Get form data
    const form = document.getElementById('editStudentForm');
    const formData = new FormData(form);
    const studentId = parseInt(document.getElementById('editStudentId').value);
    
    // Find student in array
    const studentIndex = students.findIndex(s => s.id === studentId);
    if (studentIndex === -1) {
        alert(t('admin.error.studentNotFound'));
        return;
    }
    
    // Update student object
    students[studentIndex] = {
        ...students[studentIndex],
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        age: parseInt(formData.get('age')),
        gender: formData.get('gender') || null,
        branch: formData.get('branch'),
        coach: formData.get('coach'),
        razryad: formData.get('razryad') || null,
        status: formData.get('status'),
        currentLevel: parseInt(formData.get('currentLevel')) || students[studentIndex].currentLevel,
        currentLesson: parseInt(formData.get('currentLesson')) || students[studentIndex].currentLesson
    };
    
    // Validate required fields
    if (!students[studentIndex].firstName || !students[studentIndex].lastName || 
        !students[studentIndex].branch || !students[studentIndex].coach) {
        alert(t('admin.form.requiredFields'));
        return;
    }
    
    // Close modal
    closeEditStudentModal();
    
    // Show success message
    showSuccessMessage(t('admin.form.editSuccess'));
    
    // Refresh the UI
    renderTable();
    updateStats();
    
    // If viewing a specific branch or coach, refresh that view
    const branchSection = document.getElementById('branchSection');
    const coachSection = document.getElementById('coachSection');
    
    if (branchSection && branchSection.classList.contains('active')) {
        const currentBranch = document.querySelector('.branch-view-title')?.textContent;
        if (currentBranch) {
            viewBranch(currentBranch);
        }
    }
    
    if (coachSection && coachSection.classList.contains('active')) {
        const currentCoach = document.querySelector('.coach-view-title')?.textContent;
        if (currentCoach) {
            viewCoach(currentCoach);
        }
    }
}

// Close modal when clicking outside
document.addEventListener('click', function(event) {
    const editModal = document.getElementById('editStudentModal');
    if (event.target === editModal) {
        closeEditStudentModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const editModal = document.getElementById('editStudentModal');
        if (editModal && editModal.classList.contains('active')) {
            closeEditStudentModal();
        }
    }
});

