// Admin Dashboard JavaScript

// Pagination state
const STUDENTS_PER_PAGE = 50;
let currentStudentPage = 1;
let totalStudentPages = 1;

// Calculate age from date of birth
function calculateAge(dateOfBirth) {
    if (!dateOfBirth) return null;
    const today = new Date();
    const birth = new Date(dateOfBirth);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

// Update age display when date of birth changes
function updateAgeDisplay(dateInputId, ageDisplayId) {
    const dateInput = document.getElementById(dateInputId);
    const ageDisplay = document.getElementById(ageDisplayId);
    if (!dateInput || !ageDisplay) return;

    const dateOfBirth = dateInput.value;
    if (dateOfBirth) {
        const age = calculateAge(dateOfBirth);
        ageDisplay.textContent = t('student.calculatedAge', { count: age });
        ageDisplay.style.display = 'block';
    } else {
        ageDisplay.textContent = '';
        ageDisplay.style.display = 'none';
    }
}

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

// Update menu visibility based on user permissions
function updateMenuVisibility() {
    const userRole = window.supabaseAuth?.getCurrentUserRole();

    if (!userRole) {
        console.warn('No user role found, hiding all management menus');
        return;
    }

    console.log('User role:', userRole);

    // Show/hide menu items based on permissions
    const menuRatings = document.getElementById('menuRatings');
    const menuAppAccess = document.getElementById('menuAppAccess');
    const menuManageCoaches = document.getElementById('menuManageCoaches');
    const menuManageBranches = document.getElementById('menuManageBranches');
    const menuDataManagement = document.getElementById('menuDataManagement');
    const managementSectionTitle = document.getElementById('managementSectionTitle');

    // Get attendance menu item
    const menuAttendance = document.getElementById('menuAttendance');

    // Admins see everything
    if (userRole.role === 'admin') {
        if (menuRatings) menuRatings.style.display = 'flex';
        if (menuAppAccess) menuAppAccess.style.display = 'flex';
        if (menuManageCoaches) menuManageCoaches.style.display = 'flex';
        if (menuManageBranches) menuManageBranches.style.display = 'flex';
        if (menuDataManagement) menuDataManagement.style.display = 'flex';
        if (menuAttendance) menuAttendance.style.display = 'flex';
        if (managementSectionTitle) managementSectionTitle.style.display = 'block';

        // Analytics - Grant access to specific admin emails
        const userEmail = sessionStorage.getItem('userEmail');
        const analyticsAllowedEmails = [
            '0xmarblemaster@gmail.com',
            'dysonsphere01@proton.me'
        ];

        if (analyticsAllowedEmails.includes(userEmail)) {
            const menuStatusHistory = document.getElementById('menuStatusHistory');
            const menuSessions = document.getElementById('menuSessions');
            const menuUserActivity = document.getElementById('menuUserActivity');
            const menuCoachActivity = document.getElementById('menuCoachActivity');
            const analyticsSectionTitle = document.getElementById('analyticsSectionTitle');
            if (menuStatusHistory) menuStatusHistory.style.display = 'flex';
            if (menuSessions) menuSessions.style.display = 'flex';
            if (menuUserActivity) menuUserActivity.style.display = 'flex';
            if (menuCoachActivity) menuCoachActivity.style.display = 'flex';
            if (analyticsSectionTitle) analyticsSectionTitle.style.display = 'block';
        }

        return;
    }

    // For non-admins (coaches), show User Activity (self-only)
    const menuUserActivityCoach = document.getElementById('menuUserActivity');
    const analyticsSectionTitleCoach = document.getElementById('analyticsSectionTitle');
    if (menuUserActivityCoach) menuUserActivityCoach.style.display = 'flex';
    if (analyticsSectionTitleCoach) analyticsSectionTitleCoach.style.display = 'block';

    // For non-admins, show based on specific permissions
    let hasAnyManagementAccess = false;

    // App Access management
    if (userRole.can_manage_app_access === true) {
        if (menuAppAccess) {
            menuAppAccess.style.display = 'flex';
            hasAnyManagementAccess = true;
        }
    }

    // Coach management
    if (userRole.can_manage_coaches === true) {
        if (menuManageCoaches) {
            menuManageCoaches.style.display = 'flex';
            hasAnyManagementAccess = true;
        }
    }

    // Branch management
    if (userRole.can_manage_branches === true) {
        if (menuManageBranches) {
            menuManageBranches.style.display = 'flex';
            hasAnyManagementAccess = true;
        }
    }

    // Ratings management
    if (userRole.can_manage_ratings === true) {
        if (menuRatings) {
            menuRatings.style.display = 'flex';
            hasAnyManagementAccess = true;
        }
    }

    // Data management
    if (userRole.can_manage_data === true) {
        if (menuDataManagement) {
            menuDataManagement.style.display = 'flex';
            hasAnyManagementAccess = true;
        }
    }

    // Attendance management
    if (userRole.can_manage_attendance === true) {
        if (menuAttendance) {
            menuAttendance.style.display = 'flex';
            hasAnyManagementAccess = true;
        }
    }

    // Show/hide Management section title based on whether user has any management access
    if (managementSectionTitle) {
        managementSectionTitle.style.display = hasAnyManagementAccess ? 'block' : 'none';
    }

}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    document.title = t('admin.title');

    // Wait for data to load from Supabase
    const initFn = (typeof window.initializeData === 'function') ? window.initializeData :
                   (typeof initializeData === 'function') ? initializeData : null;

    if (initFn) {
        await initFn();
        // initializeData() already calls refreshAllUIComponents()
        // which populates dropdowns and loads students
    } else {
        // Fallback if initializeData doesn't exist
        loadStatistics();
        populateFilterDropdowns();
        populateBranchDropdown();
        populateCoachDropdown();
        loadStudents();
    }

    // Update menu visibility based on user permissions
    updateMenuVisibility();

    // Apply translations and setup
    applyAdminTranslations();
    setupEventListeners();
    // Note: lucide.createIcons() is called by loadStudents() - no need to call here

    // Restore section from URL hash (for browser back button support)
    restoreSectionFromHash();
});

// Handle browser back/forward buttons
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.section) {
        navigateToSection(event.state.section);
    } else {
        // Check URL hash as fallback
        restoreSectionFromHash();
    }
});

// Restore section based on URL hash
function restoreSectionFromHash() {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
        navigateToSection(hash);
    }
}

// Navigate to a section without pushing to history (used by popstate)
function navigateToSection(sectionName) {
    switch (sectionName) {
        case 'students':
            switchToSection('students', false);
            break;
        case 'branches':
        case 'branchesList':
            showBranchesListView(false);
            break;
        case 'coaches':
        case 'coachesList':
            showCoachesListView(false);
            break;
        case 'ratings':
            showRatingsManagement(false);
            break;
        case 'attendance':
            showAttendanceManagement(false);
            break;
        case 'manageCoaches':
            showCoachesManagement();
            break;
        case 'manageBranches':
            showBranchesManagement();
            break;
        case 'manageData':
            showDataManagement();
            break;
        case 'appAccess':
            showAppAccessManagement();
            break;
        default:
            // Default to students section
            switchToSection('students', false);
    }
}

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
    const totalStudentsElement = document.getElementById('totalStudents');
    const totalCoachesElement = document.getElementById('totalCoaches');
    const totalBranchesElement = document.getElementById('totalBranches');
    const activeStudentsElement = document.getElementById('activeStudents');

    if (totalStudentsElement) totalStudentsElement.textContent = totalStudents;
    if (totalCoachesElement) totalCoachesElement.textContent = totalCoaches;
    if (totalBranchesElement) totalBranchesElement.textContent = totalBranches;
    if (activeStudentsElement) activeStudentsElement.textContent = activeStudents;

    // Update nav badge (show only active students)
    const studentCountBadge = document.getElementById('studentCount');
    if (studentCountBadge) {
        studentCountBadge.textContent = activeStudents;
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

    // Calculate pagination
    totalStudentPages = Math.ceil(filteredStudents.length / STUDENTS_PER_PAGE);
    if (currentStudentPage > totalStudentPages) currentStudentPage = 1;

    const startIndex = (currentStudentPage - 1) * STUDENTS_PER_PAGE;
    const endIndex = startIndex + STUDENTS_PER_PAGE;
    const paginatedStudents = filteredStudents.slice(startIndex, endIndex);

    if (filteredStudents.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 3rem; color: #94a3b8;">
                    <i data-lucide="users" style="width: 48px; height: 48px; margin-bottom: 1rem;"></i>
                    <div style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">${t('admin.empty.table')}</div>
                    <div style="font-size: 0.875rem;">${t('admin.empty.hint')}</div>
                </td>
            </tr>
        `;
        renderPagination(0);
    } else {
        tbody.innerHTML = paginatedStudents.map((student, index) => {
            // Calculate the actual row number based on pagination
            const rowNumber = startIndex + index + 1;

            // Create avatar HTML - use photo if available, otherwise initials
            const avatarHTML = student.photoUrl
                ? `<div class="student-avatar" style="background: none; padding: 0; overflow: hidden;">
                       <img src="${student.photoUrl}" alt="${student.firstName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">
                   </div>`
                : `<div class="student-avatar">${student.firstName[0]}${student.lastName[0]}</div>`;

            return `
            <tr>
                <td style="text-align: center; font-weight: 500; color: #64748b;">${rowNumber}</td>
                <td>
                    <div class="student-cell">
                        ${avatarHTML}
                        <div class="student-name clickable" onclick="viewStudent('${student.id}')" style="cursor: pointer; color: #d97706;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${student.firstName} ${student.lastName}</div>
                    </div>
                </td>`;
        }).map((rowStart, index) => {
            const student = paginatedStudents[index];
            return rowStart + `
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
                        <button class="icon-button" onclick="viewStudent('${student.id}')" title="${t('admin.studentCard.view')}">
                            <i data-lucide="eye"></i>
                        </button>
                        <button class="icon-button" onclick="editStudent('${student.id}')" title="${t('admin.studentCard.edit')}">
                            <i data-lucide="edit"></i>
                        </button>
                        <button class="icon-button" onclick="deleteStudentConfirm('${student.id}')" title="Delete Student" style="color: #dc2626;">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        // Render pagination controls
        renderPagination(filteredStudents.length);
    }

    // Update result count
    updateResultCount(filteredStudents.length);

    // Only render mobile cards on mobile/tablet devices (performance optimization)
    if (window.innerWidth <= 768) {
        requestAnimationFrame(() => {
            renderMobileStudentCards(paginatedStudents);
        });
    }

    // Initialize icons within the table body only (required after search/filter re-renders)
    if (typeof lucide !== 'undefined' && tbody) {
        lucide.createIcons({ nodes: [tbody] });
    }
}

// Render pagination controls
function renderPagination(totalCount) {
    let paginationContainer = document.getElementById('paginationContainer');

    // Create pagination container if it doesn't exist
    if (!paginationContainer) {
        const tableWrapper = document.querySelector('.students-table-wrapper') || document.querySelector('.table-wrapper');
        if (tableWrapper) {
            paginationContainer = document.createElement('div');
            paginationContainer.id = 'paginationContainer';
            paginationContainer.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 1rem; padding: 1rem; border-top: 1px solid #e5e7eb;';
            tableWrapper.appendChild(paginationContainer);
        }
    }

    if (!paginationContainer) return;

    // Hide pagination if only one page
    if (totalStudentPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }

    paginationContainer.style.display = 'flex';

    const startIndex = (currentStudentPage - 1) * STUDENTS_PER_PAGE + 1;
    const endIndex = Math.min(currentStudentPage * STUDENTS_PER_PAGE, totalCount);

    paginationContainer.innerHTML = `
        <button class="btn-secondary" onclick="goToStudentPage(${currentStudentPage - 1})" ${currentStudentPage === 1 ? 'disabled' : ''} style="padding: 0.5rem 1rem; ${currentStudentPage === 1 ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
            <i data-lucide="chevron-left" style="width: 16px; height: 16px;"></i>
        </button>
        <span style="color: #64748b; font-size: 0.875rem;">
            ${startIndex}-${endIndex} of ${totalCount}
        </span>
        <button class="btn-secondary" onclick="goToStudentPage(${currentStudentPage + 1})" ${currentStudentPage === totalStudentPages ? 'disabled' : ''} style="padding: 0.5rem 1rem; ${currentStudentPage === totalStudentPages ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
            <i data-lucide="chevron-right" style="width: 16px; height: 16px;"></i>
        </button>
    `;
    // Initialize icons only within the pagination container (much faster than full document)
    if (typeof lucide !== 'undefined') {
        lucide.createIcons({ nodes: [paginationContainer] });
    }
}

// Navigate to specific student page
function goToStudentPage(page) {
    if (page < 1 || page > totalStudentPages) return;
    currentStudentPage = page;
    loadStudents();
    // Scroll to top of table
    const tableWrapper = document.querySelector('.students-table-wrapper') || document.querySelector('.table-wrapper');
    if (tableWrapper) {
        tableWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Reset pagination when filters change
function resetPagination() {
    currentStudentPage = 1;
}

// Render mobile student cards
function renderMobileStudentCards(students) {
    const mobileCardsContainer = document.getElementById('mobileStudentCards');
    if (!mobileCardsContainer) return;

    if (students.length === 0) {
        mobileCardsContainer.innerHTML = `
            <div style="text-align: center; padding: 3rem 1rem; color: #94a3b8;">
                <i data-lucide="users" style="width: 48px; height: 48px; margin-bottom: 1rem;"></i>
                <div style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">${t('admin.empty.table')}</div>
                <div style="font-size: 0.875rem;">${t('admin.empty.hint')}</div>
            </div>
        `;
    } else {
        mobileCardsContainer.innerHTML = students.map(student => {
            // Create avatar HTML - use photo if available, otherwise initials
            const mobileAvatarHTML = student.photoUrl
                ? `<div class="mobile-card-avatar" style="background: none; padding: 0; overflow: hidden;">
                       <img src="${student.photoUrl}" alt="${student.firstName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">
                   </div>`
                : `<div class="mobile-card-avatar">${student.firstName[0]}${student.lastName[0]}</div>`;

            return `
            <div class="mobile-student-card">
                <div class="mobile-card-header">
                    ${mobileAvatarHTML}
                    <div class="mobile-card-info">
                        <div class="mobile-card-name clickable" onclick="viewStudent('${student.id}')" style="cursor: pointer; color: #d97706;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${student.firstName} ${student.lastName}</div>
                        <div class="mobile-card-meta">${student.age} ${t('common.years')} • ${student.coach}</div>
                    </div>
                    <span class="mobile-card-status ${student.status}">${translateStatus(student.status)}</span>
                </div>
                
                <div class="mobile-card-details">
                    <div class="mobile-card-detail">
                        <div class="mobile-card-detail-label">${t('admin.table.branch')}</div>
                        <div class="mobile-card-detail-value">${i18n.translateBranchName(student.branch)}</div>
                    </div>
                    <div class="mobile-card-detail">
                        <div class="mobile-card-detail-label">${t('admin.table.level')}</div>
                        <div class="mobile-card-detail-value">${t('admin.studentCard.level', { level: student.currentLevel })}</div>
                    </div>
                    <div class="mobile-card-detail">
                        <div class="mobile-card-detail-label">${t('admin.table.razryad')}</div>
                        <div class="mobile-card-detail-value">${translateRazryad(student.razryad || 'None')}</div>
                    </div>
                    <div class="mobile-card-detail">
                        <div class="mobile-card-detail-label">${t('admin.modals.edit.currentLesson')}</div>
                        <div class="mobile-card-detail-value">${student.currentLesson || '-'}</div>
                    </div>
                </div>
                
                <div class="mobile-card-actions">
                    <button class="mobile-card-action-btn" onclick="viewStudent('${student.id}')">
                        <i data-lucide="eye" style="width: 18px; height: 18px;"></i>
                        ${t('admin.studentCard.view')}
                    </button>
                    <button class="mobile-card-action-btn primary" onclick="editStudent('${student.id}')">
                        <i data-lucide="edit" style="width: 18px; height: 18px;"></i>
                        ${t('admin.studentCard.edit')}
                    </button>
                    <button class="mobile-card-action-btn danger" onclick="deleteStudentConfirm('${student.id}')">
                        <i data-lucide="trash-2" style="width: 18px; height: 18px;"></i>
                    </button>
                </div>
            </div>`;
        }).join('');
    }

    // Note: lucide.createIcons() is called by parent loadStudents() function
    // to avoid duplicate icon initialization
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
    showToast(t('admin.alert.addStudent'), 'info');
}

// Export data (placeholder)
function exportData() {
    showToast(t('admin.alert.export'), 'info');
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
    } else if (section === 'branches') {
        // Show branches list view
        showBranchesListView();
    } else if (section === 'coaches') {
        // Show coaches list view
        showCoachesListView();
    } else if (section === 'attendance') {
        // Show attendance management
        showAttendanceManagement();
    } else if (section === 'statusHistory') {
        // Show status history
        switchToSection('statusHistory');
        loadStatusHistory();
    } else if (section === 'sessions') {
        // Show user sessions
        switchToSection('sessions');
        loadSessionUsers();
        loadSessions();
    } else if (section === 'userActivity') {
        // Show user activity analytics
        switchToSection('userActivity');
        loadUserActivityUsers();
    } else if (section === 'settings' || section === 'moreMenu') {
        switchToSection('moreMenu');
        // Re-initialize lucide icons for the more menu
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    } else if (section === 'ratings') {
        switchToSection('ratings');
    } else if (section === 'coachActivity') {
        switchToSection('coachActivity');
        initCoachActivity();
    }

    // Update mobile bottom nav active state
    updateMobileBottomNav(section);

    // Close mobile menu if open
    closeMobileMenu();
}

// Show branches list view
function showBranchesListView(updateHash = true) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show a temporary branches list view or create one
    let branchesListSection = document.getElementById('branchesListSection');
    
    if (!branchesListSection) {
        // Create branches list section dynamically
        const mainContent = document.querySelector('.main-content');
        const branchesHTML = `
            <div id="branchesListSection" class="content-section">
                <div class="header">
                    <h1 class="header-title" data-i18n="admin.sidebar.branches">Branches</h1>
                </div>
                
                <div class="stats-grid" style="margin-bottom: 2rem;">
                    <div class="stat-card">
                        <div class="stat-header">
                            <div>
                                <div class="stat-value">${branches.length}</div>
                                <div class="stat-label">Total Branches</div>
                            </div>
                            <div class="stat-icon blue">
                                <i data-lucide="building" style="width: 24px; height: 24px;"></i>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="mobile-student-cards" id="mobileBranchCards">
                    ${branches.map(branch => `
                        <div class="mobile-student-card" onclick="viewBranch('${branch.name}')">
                            <div class="mobile-card-header">
                                <div class="mobile-card-avatar" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);">
                                    <i data-lucide="building" style="width: 28px; height: 28px;"></i>
                                </div>
                                <div class="mobile-card-info">
                                    <div class="mobile-card-name">${i18n.translateBranchName(branch.name)}</div>
                                    <div class="mobile-card-meta">${branch.location || 'Almaty'}</div>
                                </div>
                                <span class="mobile-card-status active">${students.filter(s => s.branch === branch.name).length} students</span>
                            </div>
                            
                            <div class="mobile-card-details">
                                <div class="mobile-card-detail">
                                    <div class="mobile-card-detail-label">Phone</div>
                                    <div class="mobile-card-detail-value">${branch.phone || '+7 (700) 123-45-67'}</div>
                                </div>
                                <div class="mobile-card-detail">
                                    <div class="mobile-card-detail-label">Email</div>
                                    <div class="mobile-card-detail-value">${branch.email || 'branch@chessempire.kz'}</div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        mainContent.insertAdjacentHTML('beforeend', branchesHTML);
        branchesListSection = document.getElementById('branchesListSection');
        lucide.createIcons();
    }

    branchesListSection.classList.add('active');

    // Update URL hash for browser history
    if (updateHash) {
        history.pushState({ section: 'branchesList' }, '', '#branchesList');
    }
}

// Show coaches list view
function showCoachesListView(updateHash = true) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });

    // Show a temporary coaches list view or create one
    let coachesListSection = document.getElementById('coachesListSection');

    if (!coachesListSection) {
        // Create coaches list section dynamically
        const mainContent = document.querySelector('.main-content');
        coachesListSection = createCoachesListSection(mainContent);
    }

    // Refresh coaches display with current data
    refreshCoachesListView();
    coachesListSection.classList.add('active');

    // Update URL hash for browser history
    if (updateHash) {
        history.pushState({ section: 'coachesList' }, '', '#coachesList');
    }
}

// Create coaches list section HTML structure
function createCoachesListSection(mainContent) {
    const coachesHTML = `
        <div id="coachesListSection" class="content-section">
            <div class="header">
                <h1 class="header-title" data-i18n="admin.sidebar.coaches">Coaches</h1>
            </div>

            <div class="stats-grid" style="margin-bottom: 2rem;">
                <div class="stat-card">
                    <div class="stat-header">
                        <div>
                            <div class="stat-value" id="coachesListCount">0</div>
                            <div class="stat-label">Total Coaches</div>
                        </div>
                        <div class="stat-icon amber">
                            <i data-lucide="award" style="width: 24px; height: 24px;"></i>
                        </div>
                    </div>
                </div>
            </div>

            <div class="mobile-student-cards" id="mobileCoachCards">
                <!-- Coaches will be loaded here -->
            </div>
        </div>
    `;

    mainContent.insertAdjacentHTML('beforeend', coachesHTML);
    lucide.createIcons();
    return document.getElementById('coachesListSection');
}

// Refresh coaches list view with current data
function refreshCoachesListView() {
    const coachesListCount = document.getElementById('coachesListCount');
    const mobileCoachCards = document.getElementById('mobileCoachCards');

    if (!mobileCoachCards) return;

    // Safely access global arrays
    const coachesArray = window.coaches || [];
    const studentsArray = window.students || [];

    // Update count
    if (coachesListCount) {
        coachesListCount.textContent = coachesArray.length;
    }

    // Render coaches cards
    if (coachesArray.length === 0) {
        mobileCoachCards.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem; color: #94a3b8;">
                <i data-lucide="users" style="width: 64px; height: 64px; margin-bottom: 1rem;"></i>
                <p style="font-size: 1.25rem; font-weight: 500; margin: 0;">${t('admin.coaches.noCoaches') || 'No coaches found'}</p>
                <p style="font-size: 0.95rem; margin: 0.5rem 0 0;">${t('admin.coaches.loadingData') || 'Coaches data is loading...'}</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    mobileCoachCards.innerHTML = `<div class="coach-cards-grid">${coachesArray.map(coach => {
        const coachFullName = `${coach.firstName} ${coach.lastName}`;
        const studentCount = studentsArray.filter(s => s.coach === coachFullName && s.status === 'active').length;

        // Avatar: photo or initials fallback
        const avatarContent = coach.photoUrl
            ? `<img src="${coach.photoUrl}" alt="${coach.firstName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
            : `${coach.firstName[0]}${coach.lastName[0]}`;

        // Bio: truncate or show placeholder
        const bioText = coach.bio
            ? coach.bio
            : t('admin.coaches.defaultBio') || 'Chess coach at Chess Empire';

        // Social links HTML - only show if URLs exist
        let socialsHTML = '';
        if (coach.instagramUrl || coach.whatsappUrl) {
            socialsHTML = `<div class="mobile-coach-socials">`;
            if (coach.instagramUrl) {
                socialsHTML += `
                    <a href="${coach.instagramUrl}" target="_blank" rel="noopener noreferrer"
                       class="mobile-coach-social-btn instagram" onclick="event.stopPropagation();">
                        <i data-lucide="instagram"></i>
                        Instagram
                    </a>`;
            }
            if (coach.whatsappUrl) {
                socialsHTML += `
                    <a href="${coach.whatsappUrl}" target="_blank" rel="noopener noreferrer"
                       class="mobile-coach-social-btn whatsapp" onclick="event.stopPropagation();">
                        <i data-lucide="message-circle"></i>
                        WhatsApp
                    </a>`;
            }
            socialsHTML += `</div>`;
        }

        return `
            <div class="mobile-coach-card" onclick="navigateToCoachProfile('${coach.id}')">
                <div class="mobile-coach-header">
                    <div class="mobile-coach-avatar">
                        ${avatarContent}
                    </div>
                    <div class="mobile-coach-info">
                        <div class="mobile-coach-name">${coachFullName}</div>
                        <div class="mobile-coach-branch-badge">
                            <i data-lucide="map-pin"></i>
                            ${i18n.translateBranchName(coach.branch || t('admin.coaches.unassigned') || 'Unassigned')}
                        </div>
                    </div>
                    <button class="mobile-coach-edit-btn" onclick="event.stopPropagation(); navigateToCoachProfile('${coach.id}', true);" title="${t('coach.edit') || 'Edit'}">
                        <i data-lucide="edit"></i>
                    </button>
                </div>

                <div class="mobile-coach-bio">${bioText}</div>

                <div class="mobile-coach-stats">
                    <div class="mobile-coach-stat">
                        <div class="mobile-coach-stat-value">${studentCount}</div>
                        <div class="mobile-coach-stat-label">${t('admin.coaches.students') || 'Students'}</div>
                    </div>
                </div>

                <div class="mobile-coach-contacts">
                    ${coach.phone ? `
                        <div class="mobile-coach-contact">
                            <i data-lucide="phone"></i>
                            ${coach.phone}
                        </div>
                    ` : ''}
                    ${coach.email ? `
                        <div class="mobile-coach-contact">
                            <i data-lucide="mail"></i>
                            ${coach.email}
                        </div>
                    ` : ''}
                </div>

                ${socialsHTML}
            </div>
        `;
    }).join('')}</div>`;

    lucide.createIcons();
}

// Update mobile bottom navigation active state
function updateMobileBottomNav(activeSection) {
    const moreSubSections = ['userActivity', 'statusHistory', 'sessions', 'ratings', 'coachActivity', 'moreMenu'];
    const effectiveSection = moreSubSections.includes(activeSection) ? 'settings' : activeSection;
    
    const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
    mobileNavItems.forEach(item => {
        const itemSection = item.getAttribute('data-section');
        if (itemSection === effectiveSection) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
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
        const studentCount = students.filter(s => s.branch === branch.name && s.status === 'active').length;
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
function switchToSection(sectionName, updateHash = true) {
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

    // Update URL hash for browser history (allows back button to work correctly)
    if (updateHash) {
        history.pushState({ section: sectionName }, '', `#${sectionName}`);
    }
}

// Load branch view with all data
let branchCharts = {};
let currentBranchStudents = [];
let currentLevelFilter = null;
let currentAgeFilter = null;

// Age groups for Age Distribution chart
const AGE_GROUPS = [
    { label: '5-6', min: 5, max: 6 },
    { label: '7-8', min: 7, max: 8 },
    { label: '9-10', min: 9, max: 10 },
    { label: '11-12', min: 11, max: 12 },
    { label: '13-14', min: 13, max: 14 },
    { label: '15-16', min: 15, max: 16 },
    { label: '17+', min: 17, max: 99 }
];

function loadBranchView(branch) {
    // Reset filters when loading new branch
    currentLevelFilter = null;
    currentAgeFilter = null;

    // Get students and coaches for this branch
    const branchStudents = students.filter(s => s.branch === branch.name);
    const branchCoaches = coaches.filter(c => c.branch === branch.name);

    // Filter for active students only (exclude 'left' and 'frozen' for charts/tables)
    const activeStudentsOnly = branchStudents.filter(s => s.status === 'active');

    // Store active branch students globally for filtering (Level and Age charts)
    currentBranchStudents = activeStudentsOnly;

    // Update header
    document.getElementById('branchViewName').textContent = i18n.translateBranchName(branch.name);
    document.getElementById('branchViewLocation').textContent = i18n.translateBranchLocation(branch.location);
    document.getElementById('branchViewPhone').textContent = branch.phone;
    document.getElementById('branchViewEmail').textContent = branch.email;

    // Update statistics (use all students for total count)
    const activeStudentsCount = branchStudents.filter(s => s.status === 'active').length;
    const avgLevel = branchStudents.length > 0
        ? (branchStudents.reduce((sum, s) => sum + s.currentLevel, 0) / branchStudents.length).toFixed(1)
        : 0;

    document.getElementById('branchTotalStudents').textContent = branchStudents.length;
    document.getElementById('branchActiveStudents').textContent = activeStudentsCount;
    document.getElementById('branchTotalCoaches').textContent = branchCoaches.length;
    document.getElementById('branchAvgLevel').textContent = avgLevel;

    // Load coaches list (show all students per coach)
    loadBranchCoaches(branchCoaches, branchStudents);

    // Load students list (active students only for Level Distribution)
    loadBranchStudents(activeStudentsOnly);

    // Update students list heading with count (active only)
    updateStudentsListHeading(null, activeStudentsOnly.length);

    // Load charts (active students only)
    loadBranchCharts(activeStudentsOnly);

    // Load age students list (active students only)
    loadAgeStudents(activeStudentsOnly);
    updateAgeStudentsHeading(null, activeStudentsOnly.length);

    // Refresh lucide icons for dynamically added elements
    lucide.createIcons();
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
            <div class="branch-student-item" onclick="viewStudent('${student.id}')">
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

// Filter students by level (called when clicking chart bar)
function filterStudentsByLevel(level) {
    if (currentLevelFilter === level) {
        // Click same level again = reset to all students
        currentLevelFilter = null;
        loadBranchStudents(currentBranchStudents);
        updateStudentsListHeading(null, currentBranchStudents.length);
        highlightChartBar(null);
    } else {
        // Filter by selected level
        currentLevelFilter = level;
        const filtered = currentBranchStudents.filter(s => s.currentLevel === level);
        loadBranchStudents(filtered);
        updateStudentsListHeading(level, filtered.length);
        highlightChartBar(level);
    }
}

// Update students list heading based on filter
function updateStudentsListHeading(level, count) {
    // Find the heading span in the same card as branchStudentsList
    const studentsListContainer = document.getElementById('branchStudentsList');
    if (!studentsListContainer) return;

    const parentCard = studentsListContainer.closest('.branch-card');
    if (!parentCard) return;

    const headingSpan = parentCard.querySelector('.card-title-inline span');
    if (headingSpan) {
        const countText = count !== undefined ? ` (${count})` : '';
        if (level === null) {
            headingSpan.textContent = t('branch.students') + countText;
        } else {
            headingSpan.textContent = (t('branch.studentsAtLevel', { level }) || `${t('branch.studentLevel', { level })}`) + countText;
        }
    }
}

// Highlight selected bar in level chart
function highlightChartBar(selectedLevel) {
    if (!branchCharts.level) return;

    const baseColors = [
        '#e0f2fe', '#bfdbfe', '#93c5fd', '#60a5fa',
        '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af'
    ];

    const newColors = baseColors.map((color, index) => {
        if (selectedLevel === null) return color; // Reset all
        return (index + 1 === selectedLevel) ? color : `${color}40`; // Fade unselected
    });

    branchCharts.level.data.datasets[0].backgroundColor = newColors;
    branchCharts.level.update();
}

// Load age students list
function loadAgeStudents(studentsToShow) {
    const container = document.getElementById('ageStudentsList');
    if (!container) return;

    if (studentsToShow.length === 0) {
        container.innerHTML = `<div class="empty-state">${t('branch.noStudents')}</div>`;
        return;
    }

    container.innerHTML = studentsToShow.map(student => {
        const age = calculateAge(student.dateOfBirth) || student.age || '?';
        return `
            <div class="branch-student-item" onclick="viewStudent('${student.id}')">
                <div class="branch-student-avatar">${student.firstName[0]}${student.lastName[0]}</div>
                <div class="branch-student-info">
                    <div class="branch-student-name">${student.firstName} ${student.lastName}</div>
                    <div class="branch-student-meta">${t('branch.studentMeta', { age, coach: student.coach })}</div>
                </div>
                <div class="branch-student-level">${t('branch.studentLevel', { level: student.currentLevel })}</div>
            </div>
        `;
    }).join('');
}

// Filter students by age group (called when clicking age chart bar)
function filterStudentsByAge(groupIndex) {
    const group = AGE_GROUPS[groupIndex];

    if (currentAgeFilter === groupIndex) {
        // Click same age group again = reset to all students
        currentAgeFilter = null;
        loadAgeStudents(currentBranchStudents);
        updateAgeStudentsHeading(null, currentBranchStudents.length);
        highlightAgeChartBar(null);
    } else {
        // Filter by selected age group
        currentAgeFilter = groupIndex;
        const filtered = currentBranchStudents.filter(s => {
            const age = calculateAge(s.dateOfBirth) || s.age;
            return age >= group.min && age <= group.max;
        });
        loadAgeStudents(filtered);
        updateAgeStudentsHeading(group.label, filtered.length);
        highlightAgeChartBar(groupIndex);
    }
}

// Update age students list heading based on filter
function updateAgeStudentsHeading(ageGroup, count) {
    const heading = document.getElementById('ageStudentsHeading');
    if (!heading) return;

    const countText = count !== undefined ? ` (${count})` : '';

    if (ageGroup === null) {
        heading.textContent = t('branch.students') + countText;
    } else {
        heading.textContent = (t('branch.studentsAtAge', { age: ageGroup }) || `Age ${ageGroup} Students`) + countText;
    }
}

// Highlight selected bar in age chart
function highlightAgeChartBar(selectedIndex) {
    if (!branchCharts.age) return;

    const baseColors = [
        '#dcfce7', '#bbf7d0', '#86efac', '#4ade80',
        '#22c55e', '#16a34a', '#15803d'
    ];

    const newColors = baseColors.map((color, index) => {
        if (selectedIndex === null) return color; // Reset all
        return index === selectedIndex ? color : `${color}40`; // Fade unselected
    });

    branchCharts.age.data.datasets[0].backgroundColor = newColors;
    branchCharts.age.update();
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
        '4th': 0,
        None: 0
    };

    branchStudents.forEach(student => {
        const razryad = student.razryad || 'None';
        if (razryadCounts[razryad] !== undefined) {
            razryadCounts[razryad]++;
        }
    });

    // Calculate total students (including all categories)
    const totalStudents = razryadCounts.KMS + razryadCounts['1st'] +
                          razryadCounts['2nd'] + razryadCounts['3rd'] +
                          razryadCounts['4th'] + razryadCounts.None;

    // Update the count display
    const branchRazryadCountElement = document.getElementById('branchRazryadCount');
    if (branchRazryadCountElement) {
        branchRazryadCountElement.textContent = `(${totalStudents})`;
    }

    const razryadCtx = document.getElementById('branchRazryadChart');
    const razryadLabels = t('branch.chart.razryadLabels');
    const razryadData = [
        razryadCounts.KMS,
        razryadCounts['1st'],
        razryadCounts['2nd'],
        razryadCounts['3rd'],
        razryadCounts['4th'],
        razryadCounts.None
    ];

    branchCharts.razryad = new Chart(razryadCtx, {
        type: 'doughnut',
        data: {
            labels: razryadLabels,
            datasets: [{
                data: razryadData,
                backgroundColor: [
                    '#d97706',  // KMS - amber
                    '#3b82f6',  // 1st - blue
                    '#10b981',  // 2nd - green
                    '#8b5cf6',  // 3rd - purple
                    '#ec4899',  // 4th - pink
                    '#94a3b8'   // None - gray
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
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const levelIndex = elements[0].index;
                    const level = levelIndex + 1; // Levels are 1-8
                    filterStudentsByLevel(level);
                }
            },
            onHover: (event, elements) => {
                event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
            },
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

    // Load Age Distribution Chart
    if (branchCharts.age) {
        branchCharts.age.destroy();
    }

    // Count students per age group
    const ageCounts = AGE_GROUPS.map(group => {
        return branchStudents.filter(s => {
            const age = calculateAge(s.dateOfBirth) || s.age;
            return age >= group.min && age <= group.max;
        }).length;
    });

    const ageCtx = document.getElementById('branchAgeChart');
    if (ageCtx) {
        const ageLabels = AGE_GROUPS.map(g => g.label);

        branchCharts.age = new Chart(ageCtx, {
            type: 'bar',
            data: {
                labels: ageLabels,
                datasets: [{
                    label: t('branch.chart.studentsLabel'),
                    data: ageCounts,
                    backgroundColor: [
                        '#dcfce7',
                        '#bbf7d0',
                        '#86efac',
                        '#4ade80',
                        '#22c55e',
                        '#16a34a',
                        '#15803d'
                    ],
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const groupIndex = elements[0].index;
                        filterStudentsByAge(groupIndex);
                    }
                },
                onHover: (event, elements) => {
                    event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                },
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
        const studentCount = students.filter(s => s.coach === coachFullName && s.status === 'active').length;
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

// Navigate to coach profile page
function navigateToCoachProfile(coachId, openEdit = false) {
    if (!coachId) {
        showToast(t('admin.coaches.notFound') || 'Coach not found', 'error');
        return;
    }
    localStorage.setItem('selectedCoachId', coachId);
    if (openEdit) {
        localStorage.setItem('openCoachEdit', 'true');
    }
    window.location.href = 'coach.html';
}

// View coach details (inline view in dashboard)
function viewCoach(coachFullName) {
    const coach = coaches.find(c => `${c.firstName} ${c.lastName}` === coachFullName);
    if (!coach) return;

    switchToSection('coach');
    loadCoachView(coach);
    populateCoachDropdown();  // Refresh sidebar counts to match current data

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
    // Count all students with any razryad (excluding 'none' and null)
    const kmsStudents = coachStudents.filter(s => s.razryad && s.razryad !== 'none' && s.razryad !== 'None').length;

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
        KMS: 0, '1st': 0, '2nd': 0, '3rd': 0, '4th': 0, None: 0
    };

    coachStudents.forEach(student => {
        const razryad = student.razryad || 'None';
        if (razryadCounts[razryad] !== undefined) {
            razryadCounts[razryad]++;
        }
    });

    // Calculate total students (including all categories)
    const totalCoachStudents = razryadCounts.KMS + razryadCounts['1st'] +
                                razryadCounts['2nd'] + razryadCounts['3rd'] +
                                razryadCounts['4th'] + razryadCounts.None;

    // Update the count display
    const coachRazryadCountElement = document.getElementById('coachRazryadCount');
    if (coachRazryadCountElement) {
        coachRazryadCountElement.textContent = `(${totalCoachStudents})`;
    }

    const razryadCtx = document.getElementById('coachRazryadChart');
    const razryadLabels = t('branch.chart.razryadLabels');
    const razryadData = [
        razryadCounts.KMS,
        razryadCounts['1st'],
        razryadCounts['2nd'],
        razryadCounts['3rd'],
        razryadCounts['4th'],
        razryadCounts.None
    ];

    coachCharts.razryad = new Chart(razryadCtx, {
        type: 'doughnut',
        data: {
            labels: razryadLabels,
            datasets: [{
                data: razryadData,
                backgroundColor: ['#d97706', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#94a3b8'],
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

    // Clear stored photo file
    window.addPhotoFile = null;

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
    
    // Filter coaches by selected branch (NEW: check branchNames array)
    const branchCoaches = coaches.filter(coach => {
        return coach.branchNames && coach.branchNames.includes(selectedBranch);
    });
    
    coachSelect.innerHTML = `<option value="">${t('admin.modals.add.coachSelect')}</option>`;
    branchCoaches.forEach(coach => {
        const coachFullName = `${coach.firstName} ${coach.lastName}`;
        const option = document.createElement('option');
        option.value = coachFullName;
        option.textContent = coachFullName;
        coachSelect.appendChild(option);
    });
}

// Compress and resize image before upload
// Returns a Promise that resolves to a compressed File object
async function compressImage(file, maxWidth = 400, maxHeight = 400, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                // Calculate new dimensions while maintaining aspect ratio
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                // Create canvas and draw resized image
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Convert to blob
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error('Canvas to Blob conversion failed'));
                            return;
                        }

                        // Create new File from blob
                        const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });

                        console.log(`📸 Image compressed: ${(file.size / 1024).toFixed(1)}KB → ${(compressedFile.size / 1024).toFixed(1)}KB (${width}x${height})`);
                        resolve(compressedFile);
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

// Preview Photo Upload
async function previewPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Check file size (max 10MB for original, will be compressed)
    if (file.size > 10 * 1024 * 1024) {
        showToast(t('admin.form.fileTooLarge'), 'error');
        event.target.value = '';
        return;
    }

    // Check file type
    if (!file.type.match('image.*')) {
        showToast(t('admin.form.imageRequired'), 'error');
        event.target.value = '';
        return;
    }

    try {
        // Compress the image
        const compressedFile = await compressImage(file);

        // Preview compressed image
        const reader = new FileReader();
        reader.onload = function(e) {
            const photoPreview = document.getElementById('photoPreview');
            photoPreview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
        };
        reader.readAsDataURL(compressedFile);

        // Store compressed file for upload
        window.addPhotoFile = compressedFile;
    } catch (error) {
        console.error('Error compressing image:', error);
        showToast(t('admin.form.imageRequired'), 'error');
        event.target.value = '';
    }
}

// Preview photo for Edit Student Modal
async function previewEditPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Check file size (max 10MB for original, will be compressed)
    if (file.size > 10 * 1024 * 1024) {
        showToast(t('admin.form.fileTooLarge'), 'error');
        event.target.value = '';
        return;
    }

    // Check file type
    if (!file.type.match('image.*')) {
        showToast(t('admin.form.imageRequired'), 'error');
        event.target.value = '';
        return;
    }

    try {
        // Compress the image
        const compressedFile = await compressImage(file);

        // Preview compressed image
        const reader = new FileReader();
        reader.onload = function(e) {
            const photoPreview = document.getElementById('editPhotoPreview');
            photoPreview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;">`;
        };
        reader.readAsDataURL(compressedFile);

        // Store compressed file for upload and show remove button
        window.editPhotoFile = compressedFile;
        window.editPhotoRemoved = false;
        document.getElementById('editRemovePhotoBtn').style.display = 'inline-flex';
        setTimeout(() => lucide.createIcons(), 50);
    } catch (error) {
        console.error('Error compressing image:', error);
        showToast(t('admin.form.imageRequired'), 'error');
        event.target.value = '';
    }
}

// Remove photo in Edit Student Modal
function removeEditPhoto() {
    const photoPreview = document.getElementById('editPhotoPreview');
    photoPreview.innerHTML = '<i data-lucide="user" style="width: 64px; height: 64px; color: #94a3b8;"></i>';

    // Clear file input
    document.getElementById('editPhotoUpload').value = '';
    document.getElementById('editRemovePhotoBtn').style.display = 'none';

    // Mark photo for removal
    window.editPhotoRemoved = true;
    window.editPhotoFile = null;

    setTimeout(() => lucide.createIcons(), 50);
}

// Submit Add Student Form
async function submitAddStudent(event) {
    event.preventDefault();

    // Get form data
    const form = document.getElementById('addStudentForm');
    const formData = new FormData(form);

    // Get branch and coach names
    const branchName = formData.get('branch');
    const coachName = formData.get('coach');

    // Find branch and coach IDs
    const branch = window.branches?.find(b => b.name === branchName);
    const coach = window.coaches?.find(c => `${c.firstName} ${c.lastName}` === coachName);

    if (!branch) {
        showToast('Branch not found', 'error');
        return;
    }

    if (!coach) {
        showToast('Coach not found', 'error');
        return;
    }

    // Create student data object with IDs
    const studentData = {
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        age: parseInt(formData.get('age')) || null,
        dateOfBirth: formData.get('dateOfBirth') || null,
        gender: (formData.get('gender') || '').toLowerCase() || null,
        branch: branchName,
        branchId: branch.id,
        coach: coachName,
        coachId: coach.id,
        razryad: formData.get('razryad') || 'none',
        status: (formData.get('status') || 'active').toLowerCase(),
        currentLevel: parseInt(formData.get('currentLevel')) || 1,
        currentLesson: parseInt(formData.get('currentLesson')) || 1,
        totalLessons: parseInt(formData.get('totalLessons')) || 120,
        parentName: formData.get('parentName') || null,
        parentPhone: formData.get('parentPhone') || null,
        parentEmail: formData.get('parentEmail') || null,
        photoUrl: null // Will be set after upload
    };

    // Validate required fields: Name, Surname, Age, Coach, Branch
    if (!studentData.firstName || !studentData.lastName || !studentData.age || !studentData.branchId || !studentData.coachId) {
        showToast(t('admin.form.requiredFields'), 'error');
        return;
    }

    try {
        // First create the student to get their ID
        const result = await createStudent(studentData);

        if (result.success && result.student) {
            // If a photo was selected, upload it now that we have the student ID
            if (window.addPhotoFile) {
                try {
                    const photoUrl = await window.supabaseData.uploadStudentPhoto(window.addPhotoFile, result.student.id);
                    // Update student with photo URL in database
                    await window.supabaseData.updateStudent(result.student.id, { ...studentData, photoUrl: photoUrl });
                    // Also update local cache immediately
                    const studentIndex = window.students.findIndex(s => String(s.id) === String(result.student.id));
                    if (studentIndex !== -1) {
                        window.students[studentIndex].photoUrl = photoUrl;
                    }
                } catch (photoError) {
                    console.error('⚠️ Photo upload failed, student created without photo:', photoError);
                    showToast(t('admin.form.photoUploadFailed'), 'warning');
                }
                // Clear the stored file
                window.addPhotoFile = null;
            }
        }

        // Continue with original success handling
        const originalResult = result;

        if (result.success) {
            // Close modal
            closeAddStudentModal();

            // Show success message
            showToast(t('admin.form.addSuccess'), 'success');

            // Refresh the UI
            loadStudents();
            updateStats();
        } else {
            throw new Error(result.error || 'Failed to create student');
        }
    } catch (error) {
        console.error('❌ Error adding student:', error);
        showToast(error.message || 'Failed to add student', 'error');
    }
}

// Show Success Message (wrapper for showToast)
function showSuccessMessage(message) {
    showToast(message, 'success');
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
    // Student IDs from Supabase are strings (UUIDs), so compare as strings
    const student = students.find(s => String(s.id) === String(studentId));
    if (!student) {
        console.error('❌ Student not found with ID:', studentId);
        showToast(t('admin.error.studentNotFound'), 'error');
        return;
    }

    const modal = document.getElementById('editStudentModal');
    modal.classList.add('active');

    // Populate form with student data
    document.getElementById('editStudentId').value = student.id;
    document.getElementById('editFirstName').value = student.firstName;
    document.getElementById('editLastName').value = student.lastName;
    // Set date of birth and update age display
    const dateOfBirthInput = document.getElementById('editDateOfBirth');
    if (student.dateOfBirth) {
        dateOfBirthInput.value = student.dateOfBirth;
    } else {
        dateOfBirthInput.value = '';
    }
    updateAgeDisplay('editDateOfBirth', 'editAgeDisplay');

    // Add event listener for date change
    dateOfBirthInput.addEventListener('change', () => updateAgeDisplay('editDateOfBirth', 'editAgeDisplay'));

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

    // Set photo preview
    const photoPreview = document.getElementById('editPhotoPreview');
    const removePhotoBtn = document.getElementById('editRemovePhotoBtn');
    const currentPhotoUrlInput = document.getElementById('editCurrentPhotoUrl');

    if (student.photoUrl) {
        photoPreview.innerHTML = `<img src="${student.photoUrl}" alt="${student.firstName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;">`;
        currentPhotoUrlInput.value = student.photoUrl;
        removePhotoBtn.style.display = 'inline-flex';
    } else {
        photoPreview.innerHTML = '<i data-lucide="user" style="width: 64px; height: 64px; color: #94a3b8;"></i>';
        currentPhotoUrlInput.value = '';
        removePhotoBtn.style.display = 'none';
    }

    // Clear file input
    document.getElementById('editPhotoUpload').value = '';

    // Store flag for photo removal
    window.editPhotoRemoved = false;
    window.editPhotoFile = null;

    // Load and populate bot progress and puzzle rush data
    loadEditStudentProgressData(studentId);

    // Reinitialize icons
    setTimeout(() => lucide.createIcons(), 150);
}

// Close Edit Student Modal
function closeEditStudentModal() {
    const modal = document.getElementById('editStudentModal');
    modal.classList.remove('active');
    // Clear cached progress data
    window.editStudentProgressData = null;
}

// Load student bot progress and puzzle rush data for edit modal
async function loadEditStudentProgressData(studentId) {
    try {
        // Fetch bot progress
        let botProgress = { defeated: [], highestRating: 0 };
        if (window.supabaseData && typeof window.supabaseData.getBotBattles === 'function') {
            const botBattles = await window.supabaseData.getBotBattles(studentId);
            const defeated = botBattles.filter(b => b.result === 'win');
            botProgress = {
                defeated: defeated,
                highestRating: defeated.length > 0 ? Math.max(...defeated.map(b => b.bot_rating || 0)) : 0
            };
        }

        // Fetch survival/puzzle rush data
        let survivalBest = null;
        if (window.supabaseData && typeof window.supabaseData.getSurvivalScores === 'function') {
            const scores = await window.supabaseData.getSurvivalScores(studentId);
            if (scores && scores.length > 0) {
                survivalBest = scores.reduce((best, s) => (!best || s.score > best.score) ? s : best, null);
            }
        }

        // Fetch current chess rating
        let currentRating = { rating: 0 };
        if (window.supabaseData && typeof window.supabaseData.getCurrentRating === 'function') {
            currentRating = await window.supabaseData.getCurrentRating(studentId);
        }

        // Cache the data for saving later
        window.editStudentProgressData = {
            botProgress: botProgress,
            survival: { best: survivalBest },
            rating: currentRating
        };

        // Populate the bot grid
        populateEditBotGrid(botProgress.defeated);

        // Set puzzle rush score
        const scoreInput = document.getElementById('editPuzzleRushScore');
        if (scoreInput) {
            scoreInput.value = survivalBest?.score || '';
        }

        // Set chess rating
        const ratingInput = document.getElementById('editChessRating');
        if (ratingInput) {
            ratingInput.value = currentRating.rating || '';
            ratingInput.dataset.originalRating = currentRating.rating || 0;
        }
    } catch (error) {
        console.error('Error loading student progress data:', error);
        // Still populate empty grid
        populateEditBotGrid([]);
    }
}

// Populate bot grid in edit modal with checkboxes
function populateEditBotGrid(defeatedBots) {
    const bots = window.CHESS_BOTS || [];
    const defeatedSet = new Set((defeatedBots || []).map(b => (b.bot_name || b.botName || '').toLowerCase()));

    const container = document.getElementById('editBotGrid');
    if (!container) return;

    // Group bots by tier
    const tiers = {
        beginner: { label: t('bots.tiers.beginner') || 'Beginner', bots: [] },
        intermediate: { label: t('bots.tiers.intermediate') || 'Intermediate', bots: [] },
        advanced: { label: t('bots.tiers.advanced') || 'Advanced', bots: [] },
        master: { label: t('bots.tiers.master') || 'Master', bots: [] }
    };

    bots.forEach(bot => {
        if (tiers[bot.tier]) {
            tiers[bot.tier].bots.push(bot);
        }
    });

    let html = '';

    Object.entries(tiers).forEach(([tierKey, tierData]) => {
        if (tierData.bots.length === 0) return;

        html += `<div class="edit-bot-tier">
            <div class="edit-bot-tier-label" style="color: ${tierData.bots[0]?.color || '#64748b'}">${tierData.label}</div>
            <div class="edit-bot-tier-bots">`;

        tierData.bots.forEach(bot => {
            const isDefeated = defeatedSet.has(bot.name.toLowerCase());
            html += `
                <label class="edit-bot-checkbox ${isDefeated ? 'checked' : ''}">
                    <input type="checkbox"
                           name="bot_${bot.name}"
                           value="${bot.name}"
                           data-rating="${bot.rating}"
                           ${isDefeated ? 'checked' : ''}>
                    <span class="edit-bot-avatar" style="background: ${bot.color}">${bot.avatar}</span>
                    <span class="edit-bot-name">${bot.name}</span>
                    <span class="edit-bot-rating">${bot.rating}</span>
                </label>`;
        });

        html += `</div></div>`;
    });

    container.innerHTML = html;

    // Add change listeners to update visual state
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            this.closest('.edit-bot-checkbox').classList.toggle('checked', this.checked);
        });
    });
}

// Save bot progress changes from edit modal
async function saveBotProgressFromModal(studentId) {
    const container = document.getElementById('editBotGrid');
    if (!container || !window.supabaseData) return;

    const defeatedBots = window.editStudentProgressData?.botProgress?.defeated || [];
    const previouslyDefeatedSet = new Set(defeatedBots.map(b => (b.bot_name || b.botName || '').toLowerCase()));

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');

    for (const checkbox of checkboxes) {
        const botName = checkbox.value;
        const botRating = parseInt(checkbox.dataset.rating) || 0;
        const isChecked = checkbox.checked;
        const wasDefeated = previouslyDefeatedSet.has(botName.toLowerCase());

        // If state changed, update in database
        if (isChecked && !wasDefeated) {
            // Add bot win
            try {
                await window.supabaseData.addBotBattleWin(studentId, botName, botRating);
            } catch (error) {
                console.error(`Error adding bot win for ${botName}:`, error);
            }
        } else if (!isChecked && wasDefeated) {
            // Remove bot win
            try {
                await window.supabaseData.removeBotBattleWin(studentId, botName);
            } catch (error) {
                console.error(`Error removing bot win for ${botName}:`, error);
            }
        }
    }
}

// Save puzzle rush score from edit modal
async function savePuzzleRushFromModal(studentId) {
    const scoreInput = document.getElementById('editPuzzleRushScore');
    if (!scoreInput || !window.supabaseData) return;

    const newScore = parseInt(scoreInput.value) || 0;
    const currentBestScore = window.editStudentProgressData?.survival?.best?.score || 0;

    // Only save if score is greater than current best (or if there's no current score)
    if (newScore > 0 && newScore !== currentBestScore) {
        try {
            await window.supabaseData.addSurvivalScore(studentId, newScore, 'puzzle_rush', 'Updated via admin edit form');
        } catch (error) {
            console.error('Error saving puzzle rush score:', error);
        }
    }
}

// Save chess rating from edit modal
async function saveChessRatingFromModal(studentId) {
    const ratingInput = document.getElementById('editChessRating');
    if (!ratingInput || !window.supabaseData) return;

    const newRating = parseInt(ratingInput.value) || 0;
    const originalRating = parseInt(ratingInput.dataset.originalRating) || 0;

    // Only save if rating changed and is valid
    if (newRating > 0 && newRating !== originalRating) {
        try {
            await window.supabaseData.addStudentRating(studentId, newRating, 'manual');
        } catch (error) {
            console.error('Error saving chess rating:', error);
        }
    }
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
    
    // Filter coaches by selected branch (NEW: check branchNames array)
    const branchCoaches = coaches.filter(coach => {
        return coach.branchNames && coach.branchNames.includes(selectedBranch);
    });
    
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
async function submitEditStudent(event) {
    event.preventDefault();

    // Get form data
    const form = document.getElementById('editStudentForm');
    const formData = new FormData(form);
    // Student IDs from Supabase are strings (UUIDs), keep as string - don't use parseInt!
    const studentId = document.getElementById('editStudentId').value;

    // Validate student exists
    const student = window.students.find(s => String(s.id) === String(studentId));
    if (!student) {
        console.error('❌ Student not found with ID:', studentId);
        showToast(t('admin.error.studentNotFound'), 'error');
        return;
    }

    // Get branch and coach names from form
    const branchName = formData.get('branch');
    const coachName = formData.get('coach');

    // Convert branch name to ID
    const branch = window.branches.find(b => b.name === branchName);
    const branchId = branch ? branch.id : null;

    // Convert coach name to ID
    const coach = window.coaches.find(c => `${c.firstName} ${c.lastName}` === coachName);
    const coachId = coach ? coach.id : null;

    // Get date of birth and calculate age
    const dateOfBirth = formData.get('dateOfBirth') || null;
    const calculatedAge = dateOfBirth ? calculateAge(dateOfBirth) : null;

    // Prepare student data with IDs (Supabase format)
    const studentData = {
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        dateOfBirth: dateOfBirth,
        age: calculatedAge,
        gender: formData.get('gender') || null,
        branchId: branchId,
        coachId: coachId,
        razryad: formData.get('razryad') || 'none',
        status: formData.get('status') || 'active',
        currentLevel: parseInt(formData.get('currentLevel')) || student.currentLevel,
        currentLesson: parseInt(formData.get('currentLesson')) || student.currentLesson,
        parentName: formData.get('parentName') || null,
        parentPhone: formData.get('parentPhone') || null,
        parentEmail: formData.get('parentEmail') || null,
        photoUrl: student.photoUrl // Keep existing photo by default
    };

    // Validate required fields
    if (!studentData.firstName || !studentData.lastName) {
        showToast(t('admin.form.requiredFields'), 'error');
        return;
    }

    try {
        // Handle photo upload/removal
        const currentPhotoUrl = document.getElementById('editCurrentPhotoUrl').value;

        // If photo was removed
        if (window.editPhotoRemoved) {
            // Delete old photo from storage
            if (currentPhotoUrl) {
                await window.supabaseData.deleteStudentPhoto(currentPhotoUrl);
            }
            studentData.photoUrl = null;
        }
        // If new photo was selected
        else if (window.editPhotoFile) {
            // Delete old photo first
            if (currentPhotoUrl) {
                await window.supabaseData.deleteStudentPhoto(currentPhotoUrl);
            }
            // Upload new photo
            const newPhotoUrl = await window.supabaseData.uploadStudentPhoto(window.editPhotoFile, studentId);
            studentData.photoUrl = newPhotoUrl;
        }

        // Update student in Supabase
        const result = await updateStudent(studentId, studentData);

        if (result.success) {
            // Save bot progress changes
            await saveBotProgressFromModal(studentId);

            // Save puzzle rush score if changed
            await savePuzzleRushFromModal(studentId);

            // Save chess rating if changed
            await saveChessRatingFromModal(studentId);

            // Close modal
            closeEditStudentModal();

            // Show success message
            showSuccessMessage(t('admin.form.editSuccess'));

            // Refresh the UI
            loadStudents();
            loadStatistics();

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
        } else {
            // Show error message
            showToast(result.error || t('admin.error.updateFailed'), 'error');
        }
    } catch (error) {
        console.error('❌ Error updating student:', error);
        showToast(t('admin.error.updateFailed') + ': ' + error.message, 'error');
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

// ========================================
// MOBILE NAVIGATION & UI FUNCTIONS
// ========================================

// Mobile section titles for header
const mobileSectionTitles = {
    students: 'admin.header.students',
    coaches: 'admin.header.coaches',
    attendance: 'admin.header.attendance',
    settings: 'admin.header.settings',
    userActivity: 'admin.userActivity.title',
    statusHistory: 'admin.statusHistory.title',
    sessions: 'admin.sessions.title',
    ratings: 'admin.ratings.title',
    coachActivity: 'admin.coachActivity.title'
};

// Show mobile section (called from bottom nav)
function showMobileSection(section, event) {
    if (event) {
        event.preventDefault();
    }

    // Update mobile header title
    updateMobileHeaderTitle(section);

    // Update mobile bottom nav active state
    const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
    mobileNavItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-section') === section) {
            item.classList.add('active');
        }
    });

    // Show/hide mobile search based on section
    const mobileSearchContainer = document.getElementById('mobileSearchContainer');
    if (mobileSearchContainer) {
        if (section === 'students' || section === 'coaches') {
            mobileSearchContainer.style.display = 'block';
        } else {
            mobileSearchContainer.style.display = 'none';
        }
    }

    // Hide filters when switching sections
    const filters = document.querySelector('.filters');
    if (filters) {
        filters.classList.remove('mobile-expanded');
    }

    // Call the existing showSection function
    showSection(section);

    // For sub-sections of More, keep More tab highlighted
    const moreSubSections = ['userActivity', 'statusHistory', 'sessions', 'ratings', 'coachActivity', 'moreMenu', 'settings'];
    if (moreSubSections.includes(section)) {
        const moreBtn = document.querySelector('.mobile-nav-item[data-section="settings"]');
        if (moreBtn) {
            document.querySelectorAll('.mobile-nav-item').forEach(i => i.classList.remove('active'));
            moreBtn.classList.add('active');
        }
    }
}

// Update mobile header title
function updateMobileHeaderTitle(section) {
    const mobileHeaderTitle = document.getElementById('mobileHeaderTitle');
    if (mobileHeaderTitle) {
        const titleKey = mobileSectionTitles[section] || 'admin.header.students';
        mobileHeaderTitle.textContent = t(titleKey);
        mobileHeaderTitle.setAttribute('data-i18n', titleKey);
    }
}

// Toggle mobile filters visibility
function toggleMobileFilters() {
    const filters = document.querySelector('.filters');
    const filterBtn = document.getElementById('mobileFilterBtn');

    if (filters) {
        filters.classList.toggle('mobile-expanded');

        // Update button state
        if (filterBtn) {
            if (filters.classList.contains('mobile-expanded')) {
                filterBtn.classList.add('active');
            } else {
                filterBtn.classList.remove('active');
            }
        }
    }
}

// Toggle mobile language menu
function toggleMobileLanguageMenu(event) {
    if (event) {
        event.stopPropagation();
    }
    const menu = document.getElementById('mobileLanguageMenu');
    if (menu) {
        menu.classList.toggle('open');

        // Update active state based on current language
        const currentLang = localStorage.getItem('ce_language') || localStorage.getItem('chess-empire-language') || localStorage.getItem('language') || 'en';
        menu.querySelectorAll('.language-option').forEach(btn => {
            btn.classList.remove('active');
            const lang = btn.getAttribute('data-lang') || btn.getAttribute('onclick')?.match(/'(\w+)'/)?.[1] || '';
            if (lang === currentLang) {
                btn.classList.add('active');
            } else if ((!lang) && (
                (currentLang === 'en' && btn.textContent.includes('English')) ||
                (currentLang === 'ru' && btn.textContent.includes('Русский')) ||
                (currentLang === 'kk' && btn.textContent.includes('Қазақ'))
            )) {
                btn.classList.add('active');
            }
        });
    }
}

// Close mobile language menu
function closeMobileLanguageMenu() {
    const menu = document.getElementById('mobileLanguageMenu');
    if (menu) {
        menu.classList.remove('open');
    }
}

// Close mobile language menu when clicking outside
document.addEventListener('click', function(event) {
    const menu = document.getElementById('mobileLanguageMenu');
    const btn = document.getElementById('mobileLanguageBtn');
    if (menu && menu.classList.contains('open')) {
        if (!menu.contains(event.target) && event.target !== btn && !btn.contains(event.target)) {
            closeMobileLanguageMenu();
        }
    }
});

// Close mobile menu (legacy sidebar)
function closeMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.mobile-overlay');

    if (sidebar) {
        sidebar.classList.remove('mobile-open');
    }
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// Sync mobile search with desktop search
function initMobileSearch() {
    const mobileSearchInput = document.getElementById('mobileSearchInput');
    const desktopSearchInput = document.getElementById('searchInput');

    if (mobileSearchInput && desktopSearchInput) {
        // Sync mobile search to desktop
        mobileSearchInput.addEventListener('input', (e) => {
            const value = e.target.value;
            desktopSearchInput.value = value;

            // Trigger the search
            clearTimeout(window.mobileSearchTimeout);
            window.mobileSearchTimeout = setTimeout(() => {
                currentFilters.search = value.toLowerCase();
                loadStudents();
            }, 300);
        });

        // Sync desktop search to mobile
        desktopSearchInput.addEventListener('input', () => {
            mobileSearchInput.value = desktopSearchInput.value;
        });
    }
}

// Initialize mobile UI on page load
function initMobileUI() {
    // Check if on mobile
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        // Set initial header title
        updateMobileHeaderTitle('students');

        // Hide mobile search initially (will show for students)
        const mobileSearchContainer = document.getElementById('mobileSearchContainer');
        if (mobileSearchContainer) {
            mobileSearchContainer.style.display = 'block';
        }
    }

    // Initialize mobile search sync
    initMobileSearch();

    // Refresh Lucide icons for mobile nav
    if (typeof lucide !== 'undefined') {
        setTimeout(() => lucide.createIcons(), 100);
    }
}

// Call initMobileUI when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initMobileUI();
});

// Also initialize on window resize (in case user rotates device)
window.addEventListener('resize', function() {
    const isMobile = window.innerWidth <= 768;
    const mobileBottomNav = document.getElementById('mobileBottomNav');
    const mobileHeader = document.getElementById('mobileHeader');

    if (mobileBottomNav) {
        mobileBottomNav.style.display = isMobile ? 'block' : 'none';
    }
    if (mobileHeader) {
        mobileHeader.style.display = isMobile ? 'flex' : 'none';
    }
});

// ========================================
// RATINGS MANAGEMENT FUNCTIONALITY
// ========================================

// CSV/Excel data storage for import
let csvParsedData = null;
let unmatchedStudentsData = [];

// Fuzzy name matching function for Excel/CSV import
function fuzzyMatchStudent(excelName, students) {
    if (!excelName || !students || students.length === 0) {
        return { matched: false, student: null, confidence: 0 };
    }

    const normalizedExcel = excelName.trim().toLowerCase();
    const parts = normalizedExcel.split(/\s+/).filter(p => p.length > 0);

    // Try exact match first (lastName firstName or firstName lastName)
    for (const student of students) {
        const firstName = (student.firstName || '').toLowerCase();
        const lastName = (student.lastName || '').toLowerCase();
        const fullName1 = `${lastName} ${firstName}`;
        const fullName2 = `${firstName} ${lastName}`;

        if (normalizedExcel === fullName1 || normalizedExcel === fullName2) {
            return { matched: true, student, confidence: 100 };
        }
    }

    // Try partial match with improved validation (80% confidence)
    // Configuration constants
    const MIN_SUBSTRING_LENGTH = 4;        // Prevent "ali" (3 chars) matches
    const MIN_TOKEN_SIMILARITY = 0.75;     // 75% for spelling variations
    const MIN_WHOLE_NAME_SIMILARITY = 0.80; // 80% overall similarity

    for (const student of students) {
        const firstName = (student.firstName || '').toLowerCase();
        const lastName = (student.lastName || '').toLowerCase();
        const studentParts = [firstName, lastName];

        let matchedTokens = 0;

        // Check each CSV name part against student name parts
        for (const part of parts) {
            let tokenMatched = false;

            for (const sp of studentParts) {
                if (!sp || sp.length === 0) continue;

                // Case 1: Exact token match
                if (part === sp) {
                    tokenMatched = true;
                    break;
                }

                // Case 2: Substring match WITH length threshold
                if (part.length >= MIN_SUBSTRING_LENGTH && sp.includes(part)) {
                    tokenMatched = true;
                    break;
                } else if (sp.length >= MIN_SUBSTRING_LENGTH && part.includes(sp)) {
                    tokenMatched = true;
                    break;
                }

                // Case 3: Levenshtein similarity for spelling variations
                const distance = levenshteinDistance(part, sp);
                const maxLen = Math.max(part.length, sp.length);
                const similarity = (maxLen - distance) / maxLen;

                if (similarity >= MIN_TOKEN_SIMILARITY && maxLen >= MIN_SUBSTRING_LENGTH) {
                    tokenMatched = true;
                    break;
                }
            }

            if (tokenMatched) matchedTokens++;
        }

        // Require ALL tokens matched + whole-name validation
        if (matchedTokens === parts.length && parts.length >= 2) {
            // Final validation: Check whole-name similarity
            const fullName1 = `${firstName} ${lastName}`;
            const fullName2 = `${lastName} ${firstName}`;

            const dist1 = levenshteinDistance(normalizedExcel, fullName1);
            const dist2 = levenshteinDistance(normalizedExcel, fullName2);
            const minDist = Math.min(dist1, dist2);
            const maxLen = Math.max(normalizedExcel.length, fullName1.length);
            const wholeSimilarity = (maxLen - minDist) / maxLen;

            // Accept only if overall similarity is high
            if (wholeSimilarity >= MIN_WHOLE_NAME_SIMILARITY) {
                return { matched: true, student, confidence: 80 };
            }
        }
    }

    // Try matching with slight variations (first or last name matches exactly)
    for (const student of students) {
        const firstName = (student.firstName || '').toLowerCase();
        const lastName = (student.lastName || '').toLowerCase();

        if (parts.some(p => p === firstName) || parts.some(p => p === lastName)) {
            // Check if other parts are similar
            const otherParts = parts.filter(p => p !== firstName && p !== lastName);
            if (otherParts.length === 0 || otherParts.some(p =>
                firstName.includes(p) || lastName.includes(p) || p.includes(firstName) || p.includes(lastName)
            )) {
                return { matched: true, student, confidence: 60 };
            }
        }
    }

    return { matched: false, student: null, confidence: 0 };
}

// Show Ratings Management section
function showRatingsManagement(updateHash = true) {
    // Switch to ratings section
    switchToSection('ratings', updateHash);

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const ratingsMenuItem = document.getElementById('menuRatings');
    if (ratingsMenuItem) {
        ratingsMenuItem.classList.add('active');
    }

    // Load ratings data
    loadRatingsData();

    // Populate student dropdown
    populateRatingStudentDropdown();

    // Set default date to today
    const dateInput = document.getElementById('ratingDate');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    lucide.createIcons();
}

// Load ratings data and populate table
async function loadRatingsData() {
    try {
        // Get all current ratings in one efficient query
        let ratingsMap = new Map();
        if (window.supabaseData && typeof window.supabaseData.getAllCurrentRatings === 'function') {
            ratingsMap = await window.supabaseData.getAllCurrentRatings();
        }

        // Build students with ratings list
        const studentsWithRatings = [];
        let ratedCount = 0;
        let totalRating = 0;
        let leagueACount = 0;
        let recentUpdates = 0;
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        for (const student of window.students) {
            let currentRating = null;
            let lastUpdated = null;
            let leagueName = t('rankings.beginner');
            let leagueTier = 'none';

            // Look up rating from the pre-fetched map
            const ratingData = ratingsMap.get(student.id);
            if (ratingData && ratingData.rating > 0) {
                currentRating = ratingData.rating;
                lastUpdated = ratingData.ratingDate;

                // Get league info
                const leagueInfo = getLeagueFromRating(currentRating);
                leagueName = leagueInfo.name;
                leagueTier = leagueInfo.tier;
            }

            studentsWithRatings.push({
                ...student,
                currentRating,
                lastUpdated,
                leagueName,
                leagueTier
            });

            if (currentRating !== null && currentRating > 0) {
                ratedCount++;
                totalRating += currentRating;

                // Check if League A or A+
                if (currentRating >= 900) {
                    leagueACount++;
                }

                // Check recent updates
                if (lastUpdated && new Date(lastUpdated) >= oneWeekAgo) {
                    recentUpdates++;
                }
            }
        }

        // Update stats
        document.getElementById('ratedStudentsCount').textContent = ratedCount;
        document.getElementById('avgRating').textContent = ratedCount > 0 ? Math.round(totalRating / ratedCount) : 0;
        document.getElementById('leagueACount').textContent = leagueACount;
        document.getElementById('recentUpdates').textContent = recentUpdates;

        // Populate table
        renderRatingsTable(studentsWithRatings);

        // Setup search
        setupRatingsSearch(studentsWithRatings);

    } catch (error) {
        console.error('Error loading ratings data:', error);
    }
}

// Get league info from rating
function getLeagueFromRating(rating) {
    if (!rating || rating < 400) {
        return { name: t('rankings.beginner'), tier: 'none', color: '#94a3b8' };
    } else if (rating < 900) {
        return { name: t('leagues.leagueC'), tier: 'bronze', color: '#cd7f32' };
    } else if (rating < 1200) {
        return { name: t('leagues.leagueB'), tier: 'silver', color: '#c0c0c0' };
    } else if (rating < 1500) {
        return { name: t('leagues.leagueA'), tier: 'gold', color: '#ffd700' };
    } else {
        return { name: t('leagues.leagueAPlus'), tier: 'diamond', color: '#0ea5e9' };
    }
}

// Render ratings table
function renderRatingsTable(studentsWithRatings) {
    const tbody = document.getElementById('ratingsTableBody');
    if (!tbody) return;

    // Filter to only students with ratings, then sort by rating (highest first)
    const sorted = [...studentsWithRatings]
        .filter(s => s.currentRating !== null && s.currentRating > 0)
        .sort((a, b) => b.currentRating - a.currentRating);

    // Show empty state if no students have ratings
    if (sorted.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 3rem 1rem; color: #64748b;">
                    <i data-lucide="trophy" style="width: 48px; height: 48px; margin: 0 auto 1rem; display: block; opacity: 0.3;"></i>
                    <p style="font-size: 1rem; margin-bottom: 0.5rem;">${t('admin.ratings.noRatingsYet') || 'No students with ratings yet'}</p>
                    <p style="font-size: 0.875rem;">${t('admin.ratings.importHint') || 'Import ratings from Excel/CSV or add them manually above'}</p>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }

    const htmlContent = sorted.map((student, index) => {
        const rank = index + 1;
        const leagueInfo = getLeagueFromRating(student.currentRating);
        const branchName = i18n.translateBranchName(student.branch || '');

        return `
            <tr>
                <td style="font-weight: 600; color: #64748b; text-align: center;">${rank}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div class="student-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                            ${student.photoUrl
                                ? `<img src="${student.photoUrl}" alt="" style="width: 100%; height: 100%; object-fit: cover;">`
                                : `<i data-lucide="user" style="width: 18px; height: 18px; color: #94a3b8;"></i>`
                            }
                        </div>
                        <div>
                            <div style="font-weight: 500; color: #1e293b;">${student.firstName} ${student.lastName}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span style="font-weight: 600; color: ${student.currentRating ? '#1e293b' : '#94a3b8'};">
                        ${student.currentRating || '-'}
                    </span>
                </td>
                <td>
                    <span class="league-badge league-badge--${leagueInfo.tier}" style="display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.25rem 0.5rem; border-radius: 0.5rem; font-size: 0.75rem; font-weight: 500; background: ${leagueInfo.tier !== 'none' ? leagueInfo.color + '20' : '#f1f5f9'}; color: ${leagueInfo.tier !== 'none' ? leagueInfo.color : '#64748b'}; border: 1px solid ${leagueInfo.tier !== 'none' ? leagueInfo.color + '40' : '#e2e8f0'};">
                        ${leagueInfo.name}
                    </span>
                </td>
                <td style="color: #64748b; font-size: 0.875rem;">
                    ${student.lastUpdated ? formatDate(student.lastUpdated) : '-'}
                </td>
                <td style="color: #64748b;">
                    ${branchName}
                </td>
                <td>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn-icon" onclick="viewRatingHistory('${student.id}')" title="${t('admin.ratings.viewHistory')}">
                            <i data-lucide="history" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button class="btn-icon" onclick="quickEditRating('${student.id}', '${student.firstName} ${student.lastName}', ${student.currentRating || 0})" title="${t('admin.ratings.edit')}">
                            <i data-lucide="edit-2" style="width: 16px; height: 16px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = htmlContent;
    lucide.createIcons();
}

// Format date for display
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const lang = (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) ? i18n.getCurrentLanguage() : 'en';
    return date.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Setup ratings search
function setupRatingsSearch(studentsWithRatings) {
    const searchInput = document.getElementById('ratingsSearchInput');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = studentsWithRatings.filter(s =>
            `${s.firstName} ${s.lastName}`.toLowerCase().includes(query) ||
            (s.branch && s.branch.toLowerCase().includes(query))
        );
        renderRatingsTable(filtered);
    });
}

// Populate student dropdown for rating entry
function populateRatingStudentDropdown() {
    const select = document.getElementById('ratingStudentSelect');
    if (!select) return;

    // Sort students by name
    const sortedStudents = [...window.students].sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    );

    select.innerHTML = `
        <option value="">${t('admin.ratings.selectStudentPlaceholder')}</option>
        ${sortedStudents.map(s => `
            <option value="${s.id}">${s.firstName} ${s.lastName}</option>
        `).join('')}
    `;
}

// Handle student selection change
async function onRatingStudentChange() {
    const studentId = document.getElementById('ratingStudentSelect').value;
    const display = document.getElementById('currentRatingDisplay');

    if (!studentId) {
        display.style.display = 'none';
        return;
    }

    // Try to get current rating
    if (window.supabaseData && typeof window.supabaseData.getCurrentRating === 'function') {
        try {
            const ratingData = await window.supabaseData.getCurrentRating(studentId);
            if (ratingData && ratingData.rating) {
                const leagueInfo = getLeagueFromRating(ratingData.rating);

                document.getElementById('currentRatingValue').textContent = `${t('admin.ratings.currentRating')}: ${ratingData.rating}`;
                document.getElementById('currentRatingDate').textContent = `${t('admin.ratings.lastUpdated')}: ${formatDate(ratingData.rating_date)}`;
                document.getElementById('currentRatingBadge').textContent = leagueInfo.name;
                document.getElementById('currentRatingBadge').style.cssText = `
                    display: inline-flex;
                    padding: 0.25rem 0.75rem;
                    border-radius: 0.5rem;
                    font-size: 0.875rem;
                    font-weight: 500;
                    background: ${leagueInfo.color}20;
                    color: ${leagueInfo.color};
                    border: 1px solid ${leagueInfo.color}40;
                `;

                display.style.display = 'block';
            } else {
                document.getElementById('currentRatingValue').textContent = t('admin.ratings.noRatingYet');
                document.getElementById('currentRatingDate').textContent = '';
                document.getElementById('currentRatingBadge').textContent = t('rankings.beginner');
                document.getElementById('currentRatingBadge').style.cssText = `
                    display: inline-flex;
                    padding: 0.25rem 0.75rem;
                    border-radius: 0.5rem;
                    font-size: 0.875rem;
                    font-weight: 500;
                    background: #f1f5f9;
                    color: #64748b;
                    border: 1px solid #e2e8f0;
                `;
                display.style.display = 'block';
            }
        } catch (e) {
            console.warn('Error fetching current rating:', e);
            display.style.display = 'none';
        }
    }
}

// Submit new rating
async function submitRating() {
    const studentId = document.getElementById('ratingStudentSelect').value;
    const rating = parseInt(document.getElementById('ratingValue').value);
    const date = document.getElementById('ratingDate').value;

    if (!studentId) {
        showToast(t('admin.ratings.selectStudentError'), 'error');
        return;
    }

    if (!rating || rating < 100 || rating > 3000) {
        showToast(t('admin.ratings.invalidRating'), 'error');
        return;
    }

    if (!date) {
        showToast(t('admin.ratings.selectDateError'), 'error');
        return;
    }

    try {
        if (window.supabaseData && typeof window.supabaseData.addStudentRating === 'function') {
            await window.supabaseData.addStudentRating(studentId, rating, date);
            showToast(t('admin.ratings.ratingAdded'), 'success');

            // Reset form
            document.getElementById('ratingStudentSelect').value = '';
            document.getElementById('ratingValue').value = '';
            document.getElementById('currentRatingDisplay').style.display = 'none';

            // Reload ratings data
            loadRatingsData();
        } else {
            showToast(t('admin.ratings.functionNotAvailable'), 'error');
        }
    } catch (error) {
        console.error('Error adding rating:', error);
        showToast(t('admin.ratings.addError') + ': ' + error.message, 'error');
    }
}

// Quick edit rating (from table action)
function quickEditRating(studentId, studentName, currentRating) {
    document.getElementById('ratingStudentSelect').value = studentId;
    document.getElementById('ratingValue').value = currentRating || '';

    // Scroll to the form
    document.querySelector('.branch-card')?.scrollIntoView({ behavior: 'smooth' });

    // Trigger change to show current rating
    onRatingStudentChange();
}

// View rating history
async function viewRatingHistory(studentId) {
    const student = window.students.find(s => String(s.id) === String(studentId));
    if (!student) return;

    const modal = document.getElementById('ratingHistoryModal');
    const title = document.getElementById('ratingHistoryTitle');
    const content = document.getElementById('ratingHistoryContent');

    title.textContent = `${student.firstName} ${student.lastName} - ${t('admin.ratings.ratingHistory')}`;
    content.innerHTML = '<div style="text-align: center; padding: 2rem;"><i data-lucide="loader" class="spin" style="width: 24px; height: 24px;"></i></div>';

    modal.classList.add('active');
    lucide.createIcons();

    try {
        const changes = await window.supabaseData.getStudentRatingChanges(studentId);
        const trendSummary = await window.supabaseData.getRatingTrendSummary(studentId, 30);

        if (changes && changes.length > 0) {
            content.innerHTML = `
                <!-- Trend Summary Card -->
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; color: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h3 style="margin: 0; font-size: 1.25rem;">30-Day Trend</h3>
                        <button onclick="exportRatingHistory('${studentId}')"
                                style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3);
                                       padding: 0.5rem 1rem; border-radius: 6px;
                                       color: white; cursor: pointer; font-weight: 600; font-size: 0.875rem;
                                       display: flex; align-items: center; gap: 0.5rem;">
                            <i data-lucide="download" style="width: 16px; height: 16px;"></i> Export
                        </button>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
                        <div>
                            <div style="font-size: 0.85rem; opacity: 0.9;">Net Change</div>
                            <div style="font-size: 1.8rem; font-weight: 700;">
                                ${trendSummary.netChange > 0 ? '+' : ''}${trendSummary.netChange}
                            </div>
                        </div>
                        <div>
                            <div style="font-size: 0.85rem; opacity: 0.9;">Increases</div>
                            <div style="font-size: 1.8rem; font-weight: 700; color: #4ade80;">
                                ${trendSummary.increases}
                            </div>
                        </div>
                        <div>
                            <div style="font-size: 0.85rem; opacity: 0.9;">Decreases</div>
                            <div style="font-size: 1.8rem; font-weight: 700; color: #f87171;">
                                ${trendSummary.decreases}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Rating History Table -->
                <div style="max-height: 400px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead style="position: sticky; top: 0; background: white; z-index: 1;">
                            <tr style="background: #f8fafc;">
                                <th style="padding: 0.75rem; text-align: left; border-bottom: 2px solid #e2e8f0;">${t('admin.ratings.date')}</th>
                                <th style="padding: 0.75rem; text-align: left; border-bottom: 2px solid #e2e8f0;">${t('admin.ratings.rating')}</th>
                                <th style="padding: 0.75rem; text-align: left; border-bottom: 2px solid #e2e8f0;">Change</th>
                                <th style="padding: 0.75rem; text-align: left; border-bottom: 2px solid #e2e8f0;">${t('admin.ratings.league')}</th>
                                <th style="padding: 0.75rem; text-align: left; border-bottom: 2px solid #e2e8f0;">${t('admin.ratings.source')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${changes.map(r => {
                                const leagueInfo = getLeagueFromRating(r.currentRating);
                                const changeDisplay = r.changeType === 'initial'
                                    ? '<span style="color: #94a3b8; font-style: italic;">Initial</span>'
                                    : r.ratingChange > 0
                                        ? `<span style="color: #22c55e; font-weight: 700;">+${r.ratingChange}</span>`
                                        : r.ratingChange < 0
                                            ? `<span style="color: #ef4444; font-weight: 700;">${r.ratingChange}</span>`
                                            : '<span style="color: #94a3b8;">0</span>';

                                return `
                                    <tr>
                                        <td style="padding: 0.75rem; border-bottom: 1px solid #f1f5f9; color: #64748b;">
                                            ${formatDate(r.changeDate)}
                                        </td>
                                        <td style="padding: 0.75rem; border-bottom: 1px solid #f1f5f9; font-weight: 600;">
                                            ${r.currentRating}
                                        </td>
                                        <td style="padding: 0.75rem; border-bottom: 1px solid #f1f5f9;">
                                            ${changeDisplay}
                                        </td>
                                        <td style="padding: 0.75rem; border-bottom: 1px solid #f1f5f9;">
                                            <span style="padding: 0.125rem 0.5rem; border-radius: 0.25rem;
                                                         font-size: 0.75rem; background: ${leagueInfo.color}20;
                                                         color: ${leagueInfo.color};">
                                                ${leagueInfo.name}
                                            </span>
                                        </td>
                                        <td style="padding: 0.75rem; border-bottom: 1px solid #f1f5f9; color: #94a3b8; font-size: 0.875rem;">
                                            ${r.source || 'manual'}
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            lucide.createIcons();
        } else {
            content.innerHTML = `<p style="text-align: center; color: #94a3b8; padding: 2rem;">${t('admin.ratings.noHistory')}</p>`;
        }
    } catch (error) {
        console.error('Error loading rating history:', error);
        content.innerHTML = `<p style="text-align: center; color: #ef4444; padding: 2rem;">${t('admin.ratings.loadError')}</p>`;
    }
}

// Export rating history to CSV
async function exportRatingHistory(studentId) {
    const student = window.students.find(s => String(s.id) === String(studentId));
    if (!student) {
        showToast('Student not found', 'error');
        return;
    }

    try {
        const changes = await window.supabaseData.getStudentRatingChanges(studentId);

        if (!changes || changes.length === 0) {
            showToast('No rating history to export', 'warning');
            return;
        }

        // CSV Headers
        const headers = ['Date', 'Rating', 'Previous Rating', 'Change', 'League', 'Source'];

        // CSV Rows
        const rows = changes.map(r => {
            const leagueInfo = getLeagueFromRating(r.currentRating);
            return [
                r.changeDate,
                r.currentRating,
                r.previousRating || '-',
                r.changeType === 'initial' ? 'Initial' : r.ratingChange,
                leagueInfo.name,
                r.source || 'manual'
            ];
        });

        // Build CSV
        const csvContent = [
            `Rating History - ${student.firstName} ${student.lastName}`,
            `Exported: ${new Date().toISOString().split('T')[0]}`,
            '',
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        // Download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download',
            `rating_history_${student.firstName}_${student.lastName}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('Rating history exported successfully', 'success');
    } catch (error) {
        console.error('Error exporting rating history:', error);
        showToast('Export failed: ' + error.message, 'error');
    }
}

// Close rating history modal
function closeRatingHistoryModal() {
    const modal = document.getElementById('ratingHistoryModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// ========================================
// CSV IMPORT FUNCTIONALITY
// ========================================

// Open CSV import modal
function openCSVImportModal() {
    const modal = document.getElementById('csvImportModal');
    if (modal) {
        modal.classList.add('active');
        // Reset state
        csvParsedData = null;
        document.getElementById('csvFileInput').value = '';
        document.getElementById('csvFileName').textContent = 'No file selected';
        document.getElementById('csvPreviewSection').style.display = 'none';
        document.getElementById('importCSVBtn').disabled = true;
    }
    lucide.createIcons();
}

// Close CSV import modal
function closeCSVImportModal() {
    const modal = document.getElementById('csvImportModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Preview Rating file (Excel or CSV)
async function previewRatingFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('csvFileName').textContent = file.name;

    try {
        const fileExt = file.name.split('.').pop().toLowerCase();
        let rows = [];

        if (fileExt === 'xlsx' || fileExt === 'xls') {
            // Parse Excel file using SheetJS
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            // Excel format: Column A = Name, Column B = Rating
            // Skip header row (row 0)
            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (row && row[0]) {
                    rows.push({
                        name: String(row[0] || '').trim(),
                        rating: parseInt(row[1]) || 0,
                        rowNum: i + 1
                    });
                }
            }
        } else {
            // Parse CSV file
            const text = await file.text();
            const lines = text.split('\n').filter(line => line.trim());

            if (lines.length < 2) {
                showToast(t('admin.ratings.csvEmpty'), 'error');
                return;
            }

            // Parse header
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            const nameIndex = headers.findIndex(h => h === 'student_name' || h === 'name');
            const firstNameIndex = headers.findIndex(h => h === 'first_name' || h === 'firstname');
            const lastNameIndex = headers.findIndex(h => h === 'last_name' || h === 'lastname');
            const ratingIndex = headers.findIndex(h => h === 'rating');

            if (ratingIndex === -1) {
                showToast(t('admin.ratings.csvMissingRating'), 'error');
                return;
            }

            if (nameIndex === -1 && (firstNameIndex === -1 || lastNameIndex === -1)) {
                showToast(t('admin.ratings.csvMissingName'), 'error');
                return;
            }

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                let studentName;
                if (nameIndex !== -1) {
                    studentName = values[nameIndex];
                } else {
                    studentName = `${values[firstNameIndex]} ${values[lastNameIndex]}`;
                }
                rows.push({
                    name: studentName,
                    rating: parseInt(values[ratingIndex]) || 0,
                    rowNum: i + 1
                });
            }
        }

        if (rows.length === 0) {
            showToast(t('admin.ratings.csvEmpty'), 'error');
            return;
        }

        // Process rows with fuzzy matching
        csvParsedData = [];
        unmatchedStudentsData = [];
        let validCount = 0;
        let warningCount = 0;
        let errorCount = 0;

        const previewRows = [];
        const today = new Date().toISOString().split('T')[0];

        for (const row of rows) {
            if (!row.name) continue;

            // Use fuzzy matching to find student
            const matchResult = fuzzyMatchStudent(row.name, window.students);

            let statusText = '';
            let statusColor = '#10b981';
            let statusIcon = '✓';

            if (!matchResult.matched) {
                statusText = t('admin.ratings.unmatched');
                statusColor = '#ef4444';
                statusIcon = '✗';
                errorCount++;
                unmatchedStudentsData.push({
                    rowNum: row.rowNum,
                    name: row.name,
                    rating: row.rating
                });
            } else if (isNaN(row.rating) || row.rating < 0 || row.rating > 3000) {
                statusText = t('admin.ratings.invalidRating');
                statusColor = '#f59e0b';
                statusIcon = '⚠';
                warningCount++;
            } else {
                statusText = t('admin.ratings.matched');
                if (matchResult.confidence < 100) {
                    statusText += ` (${matchResult.confidence}%)`;
                    statusColor = '#22c55e';
                }
                validCount++;
                csvParsedData.push({
                    studentId: matchResult.student.id,
                    studentName: row.name,
                    matchedName: `${matchResult.student.firstName} ${matchResult.student.lastName}`,
                    rating: row.rating,
                    date: today
                });
            }

            previewRows.push(`
                <tr>
                    <td style="padding: 0.5rem; border-bottom: 1px solid #f1f5f9;">${row.name}</td>
                    <td style="padding: 0.5rem; border-bottom: 1px solid #f1f5f9;">${row.rating || '-'}</td>
                    <td style="padding: 0.5rem; border-bottom: 1px solid #f1f5f9;">${today}</td>
                    <td style="padding: 0.5rem; border-bottom: 1px solid #f1f5f9; color: ${statusColor};">
                        <span style="font-weight: 600;">${statusIcon}</span> ${statusText}
                    </td>
                </tr>
            `);
        }

        // Update preview
        document.getElementById('csvPreviewBody').innerHTML = previewRows.join('');
        document.getElementById('csvValidCount').textContent = validCount;
        document.getElementById('csvWarningCount').textContent = warningCount;
        document.getElementById('csvErrorCount').textContent = errorCount;
        document.getElementById('csvPreviewSection').style.display = 'block';

        // Enable import button if we have valid data
        document.getElementById('importCSVBtn').disabled = validCount === 0;

    } catch (error) {
        console.error('Error parsing file:', error);
        showToast(t('admin.ratings.csvParseError'), 'error');
    }
}

// Legacy function name for backward compatibility
async function previewCSVFile(event) {
    return previewRatingFile(event);
}

// Process rating file (extracted for reuse by file upload and Google Sheets loader)
async function processRatingFile(file, fileName = null) {
    const displayName = fileName || file.name;
    document.getElementById('csvFileName').textContent = displayName;

    try {
        const fileExt = displayName.split('.').pop().toLowerCase();
        let rows = [];

        if (fileExt === 'xlsx' || fileExt === 'xls') {
            // Parse Excel file using SheetJS
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            // Excel format: Column A = Name, Column B = Rating
            // Skip header row (row 0)
            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (row && row[0]) {
                    rows.push({
                        name: String(row[0] || '').trim(),
                        rating: parseInt(row[1]) || 0,
                        rowNum: i + 1
                    });
                }
            }
        } else {
            // Parse CSV file
            const text = await file.text();
            const lines = text.split('\n').filter(line => line.trim());

            if (lines.length < 2) {
                showToast(t('admin.ratings.csvEmpty'), 'error');
                return false;
            }

            // Parse header
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            const nameIndex = headers.findIndex(h => h === 'student_name' || h === 'name');
            const firstNameIndex = headers.findIndex(h => h === 'first_name' || h === 'firstname');
            const lastNameIndex = headers.findIndex(h => h === 'last_name' || h === 'lastname');
            const ratingIndex = headers.findIndex(h => h === 'rating');

            if (ratingIndex === -1) {
                showToast(t('admin.ratings.csvMissingRating'), 'error');
                return false;
            }

            if (nameIndex === -1 && (firstNameIndex === -1 || lastNameIndex === -1)) {
                showToast(t('admin.ratings.csvMissingName'), 'error');
                return false;
            }

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                let studentName;
                if (nameIndex !== -1) {
                    studentName = values[nameIndex];
                } else {
                    studentName = `${values[firstNameIndex]} ${values[lastNameIndex]}`;
                }
                rows.push({
                    name: studentName,
                    rating: parseInt(values[ratingIndex]) || 0,
                    rowNum: i + 1
                });
            }
        }

        if (rows.length === 0) {
            showToast(t('admin.ratings.csvEmpty'), 'error');
            return false;
        }

        // Process rows with fuzzy matching
        csvParsedData = [];
        unmatchedStudentsData = [];
        let validCount = 0;
        let warningCount = 0;
        let errorCount = 0;

        const previewRows = [];
        const today = new Date().toISOString().split('T')[0];

        for (const row of rows) {
            if (!row.name) continue;

            // Use fuzzy matching to find student
            const matchResult = fuzzyMatchStudent(row.name, window.students);

            let statusText = '';
            let statusColor = '#10b981';
            let statusIcon = '✓';

            if (!matchResult.matched) {
                statusText = t('admin.ratings.unmatched');
                statusColor = '#ef4444';
                statusIcon = '✗';
                errorCount++;
                unmatchedStudentsData.push({
                    rowNum: row.rowNum,
                    name: row.name,
                    rating: row.rating
                });
            } else if (isNaN(row.rating) || row.rating < 0 || row.rating > 3000) {
                statusText = t('admin.ratings.invalidRating');
                statusColor = '#f59e0b';
                statusIcon = '⚠';
                warningCount++;
            } else {
                statusText = t('admin.ratings.matched');
                if (matchResult.confidence < 100) {
                    statusText += ` (${matchResult.confidence}%)`;
                    statusColor = '#22c55e';
                }
                validCount++;
                csvParsedData.push({
                    studentId: matchResult.student.id,
                    studentName: row.name,
                    matchedName: `${matchResult.student.firstName} ${matchResult.student.lastName}`,
                    rating: row.rating,
                    date: today
                });
            }

            previewRows.push(`
                <tr>
                    <td style="padding: 0.5rem; border-bottom: 1px solid #f1f5f9;">${row.name}</td>
                    <td style="padding: 0.5rem; border-bottom: 1px solid #f1f5f9;">${row.rating || '-'}</td>
                    <td style="padding: 0.5rem; border-bottom: 1px solid #f1f5f9;">${today}</td>
                    <td style="padding: 0.5rem; border-bottom: 1px solid #f1f5f9; color: ${statusColor};">
                        <span style="font-weight: 600;">${statusIcon}</span> ${statusText}
                    </td>
                </tr>
            `);
        }

        // Update preview
        document.getElementById('csvPreviewBody').innerHTML = previewRows.join('');
        document.getElementById('csvValidCount').textContent = validCount;
        document.getElementById('csvWarningCount').textContent = warningCount;
        document.getElementById('csvErrorCount').textContent = errorCount;
        document.getElementById('csvPreviewSection').style.display = 'block';

        // Enable import button if we have valid data
        document.getElementById('importCSVBtn').disabled = validCount === 0;

        return true;

    } catch (error) {
        console.error('Error parsing file:', error);
        showToast(t('admin.ratings.csvParseError'), 'error');
        return false;
    }
}

// Parse Google Sheets URL and extract spreadsheet ID and gid
function parseGoogleSheetsUrl(url) {
    // Match patterns like:
    // https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit?gid=SHEET_GID#gid=SHEET_GID
    // https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=SHEET_GID
    const spreadsheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const gidMatch = url.match(/gid=(\d+)/);

    if (!spreadsheetMatch) {
        return null;
    }

    return {
        spreadsheetId: spreadsheetMatch[1],
        gid: gidMatch ? gidMatch[1] : '0' // Default to first sheet
    };
}

// Load Google Sheet and process it
async function loadGoogleSheet() {
    const urlInput = document.getElementById('googleSheetUrl');
    const url = urlInput.value.trim();

    if (!url) {
        showToast(t('admin.ratings.enterUrl') || 'Please enter a Google Sheets URL', 'error');
        return;
    }

    const parsed = parseGoogleSheetsUrl(url);
    if (!parsed) {
        showToast(t('admin.ratings.invalidUrl') || 'Invalid Google Sheets URL', 'error');
        return;
    }

    // Construct export URL
    const exportUrl = `https://docs.google.com/spreadsheets/d/${parsed.spreadsheetId}/export?format=xlsx&gid=${parsed.gid}`;

    // Show loading state on button
    const loadBtn = document.getElementById('loadGoogleSheetBtn');
    const originalContent = loadBtn.innerHTML;
    loadBtn.disabled = true;
    loadBtn.innerHTML = '<i data-lucide="loader" class="spin" style="width: 18px; height: 18px;"></i>';
    if (typeof lucide !== 'undefined') lucide.createIcons();

    try {
        // Show loading toast
        showToast(t('admin.ratings.loading') || 'Loading spreadsheet...', 'info');

        // Fetch the XLSX file
        const response = await fetch(exportUrl);
        if (!response.ok) {
            throw new Error(t('admin.ratings.fetchFailed') || 'Failed to fetch spreadsheet. Make sure it is publicly accessible.');
        }

        const blob = await response.blob();

        // Create a File object from the blob
        const file = new File([blob], 'google-sheet.xlsx', {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });

        // Use the reusable processing function
        // Pass null to use the file's actual name (google-sheet.xlsx) for extension detection
        // The display name is set separately
        document.getElementById('csvFileName').textContent = 'Google Sheet';
        const success = await processRatingFile(file, null);

        if (success) {
            showToast(t('admin.ratings.loadSuccess') || 'Spreadsheet loaded successfully', 'success');
        }

    } catch (error) {
        console.error('Error loading Google Sheet:', error);
        showToast(error.message || t('admin.ratings.loadFailed') || 'Failed to load spreadsheet', 'error');
    } finally {
        // Restore button state
        loadBtn.disabled = false;
        loadBtn.innerHTML = originalContent;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

// Import CSV/Excel ratings
async function importCSVRatings() {
    console.log('=== IMPORT RATINGS START ===');
    console.log('csvParsedData:', csvParsedData);
    console.log('csvParsedData length:', csvParsedData ? csvParsedData.length : 'null');

    if (!csvParsedData || csvParsedData.length === 0) {
        console.error('NO VALID DATA TO IMPORT');
        showToast(t('admin.ratings.noValidData'), 'error');
        return;
    }

    const importBtn = document.getElementById('importCSVBtn');
    const cancelBtn = document.querySelector('#csvImportModal .btn-secondary');
    importBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    importBtn.innerHTML = '<i data-lucide="loader" class="spin" style="width: 18px; height: 18px;"></i> Importing...';

    // Show progress indicator
    const progressContainer = document.getElementById('importProgressContainer');
    const progressBar = document.getElementById('importProgressBar');
    const progressPercent = document.getElementById('importProgressPercent');
    const progressCount = document.getElementById('importProgressCount');
    const progressStatus = document.getElementById('importProgressStatus');
    const progressText = document.getElementById('importProgressText');

    if (progressContainer) {
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        progressPercent.textContent = '0%';
        progressCount.textContent = `0 / ${csvParsedData.length}`;
        progressStatus.textContent = t('admin.ratings.processing') || 'Processing...';
        progressText.textContent = t('admin.ratings.importingRatings') || 'Importing ratings...';
    }

    console.log('supabaseData available:', !!window.supabaseData);
    console.log('addStudentRating function:', typeof window.supabaseData?.addStudentRating);

    try {
        let successCount = 0;
        let errorCount = 0;
        const total = csvParsedData.length;

        for (let i = 0; i < csvParsedData.length; i++) {
            const item = csvParsedData[i];
            try {
                console.log(`[${i+1}/${csvParsedData.length}] Importing: ${item.studentName}, ID: ${item.studentId}, Rating: ${item.rating}`);

                if (window.supabaseData && typeof window.supabaseData.addStudentRating === 'function') {
                    const result = await window.supabaseData.addStudentRating(item.studentId, item.rating, 'csv_import');
                    console.log(`[${i+1}] SUCCESS:`, result);
                    successCount++;
                } else {
                    console.error(`[${i+1}] supabaseData.addStudentRating not available!`);
                    errorCount++;
                }
            } catch (e) {
                console.error(`[${i+1}] ERROR importing rating for ${item.studentName}:`, e);
                errorCount++;
            }

            // Update progress indicator
            const progress = Math.round(((i + 1) / total) * 100);
            if (progressContainer) {
                progressBar.style.width = `${progress}%`;
                progressPercent.textContent = `${progress}%`;
                progressCount.textContent = `${i + 1} / ${total}`;
                progressStatus.textContent = `✓ ${successCount} | ✗ ${errorCount}`;
            }

            // Log progress every 50 items
            if ((i + 1) % 50 === 0) {
                console.log(`Progress: ${i+1}/${csvParsedData.length} (${successCount} success, ${errorCount} errors)`);
            }
        }

        console.log('=== IMPORT COMPLETE ===');
        console.log(`Total: ${successCount} success, ${errorCount} errors`);

        // Update progress to complete state
        if (progressContainer) {
            progressBar.style.background = 'linear-gradient(90deg, #10b981, #059669)';
            progressText.textContent = t('admin.ratings.importComplete') || 'Import complete!';
            progressStatus.textContent = `✓ ${successCount} imported | ✗ ${errorCount} failed`;
        }

        // Show success message with summary
        const unmatchedCount = unmatchedStudentsData.length;
        showToast(t('admin.ratings.importSummary', { matched: successCount, unmatched: unmatchedCount }), 'success');

        // Delay closing to show completion status
        setTimeout(() => {
            closeCSVImportModal();
            loadRatingsData();

            // Show unmatched students popup if there are any
            if (unmatchedStudentsData.length > 0) {
                showUnmatchedStudentsModal();
            }
        }, 1500);

    } catch (error) {
        console.error('=== IMPORT FAILED ===', error);
        showToast(t('admin.ratings.importError'), 'error');

        // Update progress to error state
        if (progressContainer) {
            progressBar.style.background = '#ef4444';
            progressText.textContent = t('admin.ratings.importFailed') || 'Import failed!';
        }
    } finally {
        importBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
        importBtn.innerHTML = `<i data-lucide="upload" style="width: 18px; height: 18px;"></i> ${t('admin.ratings.import')}`;
        lucide.createIcons();
    }
}

// Show unmatched students modal
function showUnmatchedStudentsModal() {
    const modal = document.getElementById('unmatchedStudentsModal');
    if (!modal) return;

    const listContainer = document.getElementById('unmatchedStudentsList');
    const countElement = document.getElementById('unmatchedCount');

    // Build the list HTML
    let listHtml = '<table style="width: 100%; border-collapse: collapse;">';
    listHtml += `
        <thead>
            <tr style="background: #f8fafc;">
                <th style="padding: 0.75rem; text-align: left; border-bottom: 2px solid #e2e8f0; font-weight: 600;">#</th>
                <th style="padding: 0.75rem; text-align: left; border-bottom: 2px solid #e2e8f0; font-weight: 600;">Name</th>
                <th style="padding: 0.75rem; text-align: right; border-bottom: 2px solid #e2e8f0; font-weight: 600;">Rating</th>
            </tr>
        </thead>
        <tbody>
    `;

    for (const student of unmatchedStudentsData) {
        listHtml += `
            <tr>
                <td style="padding: 0.5rem 0.75rem; border-bottom: 1px solid #f1f5f9; color: #64748b;">${student.rowNum}</td>
                <td style="padding: 0.5rem 0.75rem; border-bottom: 1px solid #f1f5f9;">${student.name}</td>
                <td style="padding: 0.5rem 0.75rem; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 500;">${student.rating}</td>
            </tr>
        `;
    }

    listHtml += '</tbody></table>';

    listContainer.innerHTML = listHtml;
    countElement.textContent = unmatchedStudentsData.length;

    modal.classList.add('active');
    lucide.createIcons();
}

// Close unmatched students modal
function closeUnmatchedModal() {
    const modal = document.getElementById('unmatchedStudentsModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Copy unmatched students list to clipboard
function copyUnmatchedList() {
    if (!unmatchedStudentsData || unmatchedStudentsData.length === 0) return;

    const text = unmatchedStudentsData
        .map(s => `${s.rowNum}. ${s.name} - ${s.rating}`)
        .join('\n');

    navigator.clipboard.writeText(text).then(() => {
        showToast(t('admin.ratings.listCopied'), 'success');
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

// ========================================
// ATTENDANCE MANAGEMENT
// ========================================

// Attendance state variables
let attendanceCurrentBranch = null;
let attendanceCurrentSchedule = 'mon_wed';
let attendanceCurrentYear = new Date().getFullYear();
let attendanceCurrentMonth = new Date().getMonth(); // 0-indexed
let attendanceCurrentTimeSlot = 'all';
let attendanceCurrentCoach = 'all'; // 'all', coachId UUID, or 'unassigned'
let attendanceCurrentCoachName = null; // Full coach name for coach-specific time slot logic
let attendanceCalendarData = [];
let attendanceStudentAliases = [];
let attendanceExcelParsedData = null;
let attendanceImportCurrentStep = 1;
let attendanceMatchedNames = [];
let attendanceSearchQuery = ''; // Search filter for student names
let attendanceStudentScheduleAssignments = {}; // { studentId: 'mon_wed' | 'tue_thu' | 'sat_sun' | null }
let attendanceCurrentScheduleStudents = new Set(); // Students with time slot assignments in CURRENT schedule
let attendanceHideEmptyRows = true; // Hide empty placeholder rows by default
let attendanceCurrentMode = 'present'; // Current attendance marking mode: 'present', 'excused', or 'absent'
let mobileCalendarOffset = 0; // Mobile: tracks which 4-day chunk (0, 4, 8, 12...)

// Save attendance filter state to localStorage
function saveAttendanceFilterState() {
    try {
        const state = {
            branch: attendanceCurrentBranch,
            schedule: attendanceCurrentSchedule,
            timeSlot: attendanceCurrentTimeSlot,
            coach: attendanceCurrentCoach,
            year: attendanceCurrentYear,
            month: attendanceCurrentMonth
        };
        localStorage.setItem('attendanceFilterState', JSON.stringify(state));
    } catch (error) {
        console.error('Error saving attendance filter state:', error);
    }
}

// Load attendance filter state from localStorage
function loadAttendanceFilterState() {
    try {
        const savedState = localStorage.getItem('attendanceFilterState');
        if (savedState) {
            const state = JSON.parse(savedState);
            return state;
        }
    } catch (error) {
        console.error('Error loading attendance filter state:', error);
    }
    return null;
}

// Time slot configuration: 8 slots, 10 students per slot
// Default slots for all branches (9:00 - 18:00)
const ATTENDANCE_TIME_SLOTS_DEFAULT = [
    '9:00-10:00',
    '10:00-11:00',
    '11:00-12:00',
    '12:00-13:00',
    '14:00-15:00',
    '15:00-16:00',
    '16:00-17:00',
    '17:00-18:00'
];

// Halyk Arena has different slots (10:00 - 19:00, no 9am, has 18-19pm)
const ATTENDANCE_TIME_SLOTS_HALYK = [
    '10:00-11:00',
    '11:00-12:00',
    '12:00-13:00',
    '14:00-15:00',
    '15:00-16:00',
    '16:00-17:00',
    '17:00-18:00',
    '18:00-19:00'
];

// Debut branch has extended slots including 18:00-19:30 for coach Asyklhan Agbaevich
const ATTENDANCE_TIME_SLOTS_DEBUT = [
    '9:00-10:00',
    '10:00-11:00',
    '11:00-12:00',
    '12:00-13:00',
    '14:00-15:00',
    '15:00-16:30',
    '16:30-17:30',
    '17:30-18:30',
    '18:30-19:30'
];

// Debut branch Mon-Wed schedule: extended midday slot (11:00-12:30) for coach Asylkhan Agbaevich
const ATTENDANCE_TIME_SLOTS_DEBUT_MON_WED = [
    '9:00-10:00',
    '10:00-11:00',
    '11:00-12:30',  // Extended from 11:00-12:00 to 11:00-12:30 for Mon-Wed
    '12:00-13:00',
    '14:00-15:00',
    '15:00-16:30',
    '16:30-17:30',
    '17:30-18:30',
    '18:30-19:30'
];

// Debut branch Mon-Wed-Fri schedule: regular slots for coach Nail Ildusovich and others
const ATTENDANCE_TIME_SLOTS_DEBUT_MON_WED_FRI = [
    '9:00-10:00',
    '10:00-11:00',
    '11:00-12:00',  // Regular 1-hour slot (not extended like Mon-Wed)
    '12:00-13:00',
    '14:00-15:00',
    '15:00-16:30',
    '16:30-17:30',
    '17:30-18:30',
    '18:30-19:30'
];

// Saturday-Sunday slots (9:00 - 14:00, shorter day - last slot ends at 14:00)
const ATTENDANCE_TIME_SLOTS_SAT_SUN = [
    '9:00-10:00',
    '10:00-11:00',
    '11:00-12:00',
    '12:00-13:00',
    '13:00-14:00'
];

// Debut branch Saturday-Sunday schedule: extended slots for coach Asylkhan Agbaevich
const ATTENDANCE_TIME_SLOTS_DEBUT_SAT_SUN_ASYLKHAN = [
    '9:00-10:30',   // Extended from 9:00-10:00
    '10:30-12:00',  // Replaces 10:00-11:00 and 11:00-12:00
    '12:00-13:00',
    '13:00-14:00'
];

// Gagarin Park Saturday-Sunday schedule (сб-вс)
const ATTENDANCE_TIME_SLOTS_GAGARIN_SAT_SUN = [
    '9:00-10:30',
    '10:30-12:00',
    '12:00-13:00',
    '13:00-14:00'
];

// Gagarin Park Tuesday-Thursday schedule (вт-чт)
const ATTENDANCE_TIME_SLOTS_GAGARIN_TUE_THU = [
    '9:00-10:00',
    '10:00-11:30',
    '11:30-12:30',
    '12:30-13:30',
    '14:00-15:00',
    '15:00-16:00',
    '16:00-17:30',
    '17:30-19:00'
];

// Gagarin Park Monday-Wednesday schedule (пн-ср)
const ATTENDANCE_TIME_SLOTS_GAGARIN_MON_WED = [
    '9:00-10:00',
    '10:00-11:00',
    '11:00-12:00',
    '12:00-13:00',
    '13:00-14:00',
    '15:00-16:00',
    '16:00-17:00',
    '17:00-18:00',
    '18:00-19:00'
];

const DEFAULT_TIME_SLOT_ROWS = 10;      // Default visible rows
const MAX_TIME_SLOT_CAPACITY = 15;      // Maximum students per slot

// Initialize time slot indices for all students
// Students without a time_slot_index get assigned based on their array position
// skipStudentIds: Set of student IDs that already have saved assignments (don't override them)
function initializeStudentTimeSlots(skipStudentIds = new Set()) {
    // Only auto-assign for Halyk Arena
    // All other branches require manual assignment via "Add Student" button
    if (attendanceCurrentBranch !== 'Halyk Arena') {
        // For non-Halyk Arena branches, leave students unassigned
        // They will not appear in any time slot until manually assigned
        return;
    }

    const timeSlots = getTimeSlotsForBranch(attendanceCurrentBranch, attendanceCurrentSchedule, attendanceCurrentCoachName);
    const numSlots = timeSlots.length;

    // For students without a slot, assign them sequentially (Halyk Arena only)
    let unassignedCount = 0;
    attendanceCalendarData.forEach((student, index) => {
        // Skip students who already have a saved assignment from the database
        if (skipStudentIds.has(student.id)) {
            return;
        }

        if (student.time_slot_index === null || student.time_slot_index === undefined) {
            // Assign based on position: first 10 to slot 0, next 10 to slot 1, etc.
            student.time_slot_index = Math.floor(index / DEFAULT_TIME_SLOT_ROWS);
            // Clamp to available slots (last slot gets overflow)
            if (student.time_slot_index >= numSlots) {
                student.time_slot_index = numSlots - 1;
            }
            unassignedCount++;
        }
    });

    if (unassignedCount > 0) {
        console.log(`Initialized time_slot_index for ${unassignedCount} students`);
    }
}

// Get students assigned to a specific time slot index
function getStudentsForTimeSlot(slotIndex, filteredData) {
    return filteredData.filter(student => student.time_slot_index === slotIndex);
}

// Get time slots for a specific branch, schedule type, and coach
// Saturday-Sunday has shorter hours (last slot 13:00-14:00) for ALL branches
function getTimeSlotsForBranch(branchName, scheduleType = null, coachName = null) {
    if (!branchName) return ATTENDANCE_TIME_SLOTS_DEFAULT;
    const normalizedName = branchName.toLowerCase().trim();

    if (normalizedName.includes('halyk') || normalizedName.includes('khalyk')) {
        return ATTENDANCE_TIME_SLOTS_HALYK;
    }

    if (normalizedName.includes('gagarin') || normalizedName.includes('гагарин')) {
        // Gagarin Park has different schedules for Mon-Wed, Tue-Thu, and Sat-Sun
        if (scheduleType === 'mon_wed') {
            return ATTENDANCE_TIME_SLOTS_GAGARIN_MON_WED;
        }
        if (scheduleType === 'tue_thu') {
            return ATTENDANCE_TIME_SLOTS_GAGARIN_TUE_THU;
        }
        if (scheduleType === 'sat_sun') {
            return ATTENDANCE_TIME_SLOTS_GAGARIN_SAT_SUN;
        }
        // Fallback to default if schedule type not specified
        return ATTENDANCE_TIME_SLOTS_DEFAULT;
    }

    if (normalizedName.includes('debut') || normalizedName.includes('дебют')) {
        // Coach-specific handling for Debut branch
        const normalizedCoach = coachName ? coachName.toLowerCase().trim() : '';

        // Coach Asylkhan Agbaevich has custom time slots for multiple schedules
        if (normalizedCoach.includes('asylkhan') || normalizedCoach.includes('асылхан')) {
            // Sat-Sun: Extended slots (9:00-10:30, 10:30-12:00)
            if (scheduleType === 'sat_sun') {
                return ATTENDANCE_TIME_SLOTS_DEBUT_SAT_SUN_ASYLKHAN;
            }
            // Mon-Wed: Extended midday slot (11:00-12:30)
            if (scheduleType === 'mon_wed') {
                return ATTENDANCE_TIME_SLOTS_DEBUT_MON_WED;
            }
        }

        // Coach Nail Ildusovich and others use Mon-Wed-Fri (3-day) with regular 11:00-12:00
        if (scheduleType === 'mon_wed_fri') {
            return ATTENDANCE_TIME_SLOTS_DEBUT_MON_WED_FRI;
        }

        // Default Debut slots (for other schedules like tue_thu, or sat_sun for other coaches)
        if (scheduleType === 'sat_sun') {
            return ATTENDANCE_TIME_SLOTS_SAT_SUN;
        }
        return ATTENDANCE_TIME_SLOTS_DEBUT;
    }

    // Saturday-Sunday schedule: use shorter time slots (9:00-14:00) for all other branches
    if (scheduleType === 'sat_sun') {
        return ATTENDANCE_TIME_SLOTS_SAT_SUN;
    }

    return ATTENDANCE_TIME_SLOTS_DEFAULT;
}

// Russian-to-English transliteration map
const CYRILLIC_TO_LATIN = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
    'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
    'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
    'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch',
    'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
};

// Show Attendance Management section
function showAttendanceManagement(updateHash = true) {
    // Switch to attendance section
    switchToSection('attendance', updateHash);

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const attendanceMenuItem = document.getElementById('menuAttendance');
    if (attendanceMenuItem) {
        attendanceMenuItem.classList.add('active');
    }

    // Load saved filter state from localStorage
    const savedState = loadAttendanceFilterState();
    if (savedState) {
        // Restore saved state
        if (savedState.branch) attendanceCurrentBranch = savedState.branch;
        if (savedState.schedule) attendanceCurrentSchedule = savedState.schedule;
        if (savedState.timeSlot) attendanceCurrentTimeSlot = savedState.timeSlot;
        if (savedState.coach) attendanceCurrentCoach = savedState.coach;
        if (savedState.year !== undefined) attendanceCurrentYear = savedState.year;
        if (savedState.month !== undefined) attendanceCurrentMonth = savedState.month;
    }

    // Populate branch dropdown (both desktop and mobile)
    populateAttendanceBranchDropdown();
    populateMobileBranchFilter();

    // Populate schedule dropdown based on branch
    populateAttendanceScheduleDropdown();

    // Apply saved schedule selection to dropdown
    const scheduleSelect = document.getElementById('attendanceScheduleFilter');
    if (scheduleSelect) {
        if (attendanceCurrentSchedule) {
            scheduleSelect.value = attendanceCurrentSchedule;
        } else {
            attendanceCurrentSchedule = scheduleSelect.value || '';
        }
    }

    // Populate coach dropdown based on branch
    populateAttendanceCoachDropdown();

    // Apply saved coach selection to dropdown
    const coachSelect = document.getElementById('attendanceCoachFilter');
    if (coachSelect && attendanceCurrentCoach) {
        coachSelect.value = attendanceCurrentCoach;
    }

    // Populate time slots based on schedule
    populateAttendanceTimeSlots();

    // Apply saved time slot selection to dropdown
    const timeSlotSelect = document.getElementById('attendanceTimeSlotFilter');
    if (timeSlotSelect) {
        if (attendanceCurrentTimeSlot) {
            timeSlotSelect.value = attendanceCurrentTimeSlot;
        } else {
            attendanceCurrentTimeSlot = timeSlotSelect.value || '';
        }
    }

    // Update month display with saved year/month
    updateAttendanceMonthDisplay();

    // Load student aliases for name matching
    loadStudentAliases();

    // Update month display
    updateAttendanceMonthDisplay();

    // Populate time slot dropdown
    populateAttendanceTimeSlots();

    // Load attendance data if branch is selected
    if (attendanceCurrentBranch) {
        loadAttendanceData();
    }

    lucide.createIcons();
}

// Populate branch dropdown for attendance
function populateAttendanceBranchDropdown() {
    const select = document.getElementById('attendanceBranchFilter');
    if (!select) return;

    // Get unique branches from students
    const uniqueBranches = [...new Set(window.students.map(s => s.branch))].filter(Boolean);

    select.innerHTML = `
        <option value="">${t('admin.attendance.selectBranch')}</option>
        ${uniqueBranches.map(branch => `
            <option value="${branch}" ${attendanceCurrentBranch === branch ? 'selected' : ''}>
                ${i18n.translateBranchName(branch)}
            </option>
        `).join('')}
    `;

    // If no branch selected and we have branches, select the first one
    if (!attendanceCurrentBranch && uniqueBranches.length > 0) {
        attendanceCurrentBranch = uniqueBranches[0];
        select.value = attendanceCurrentBranch;
    }
}

// Populate coach dropdown for attendance
function populateAttendanceCoachDropdown() {
    const select = document.getElementById('attendanceCoachFilter');
    const filterGroup = document.getElementById('attendanceCoachFilterGroup');
    if (!select) return;

    // Clear dropdown
    select.innerHTML = `<option value="all">${t('admin.attendance.allCoaches')}</option>`;

    // Hide and disable if no branch selected
    if (!attendanceCurrentBranch) {
        select.disabled = true;
        if (filterGroup) filterGroup.style.display = 'none';
        return;
    }

    // Get branch object
    const branchObj = window.branches.find(b => b.name === attendanceCurrentBranch);
    if (!branchObj) {
        select.disabled = true;
        if (filterGroup) filterGroup.style.display = 'none';
        return;
    }

    // Get coaches for selected branch
    const branchCoaches = window.coaches.filter(c =>
        c.branchIds && c.branchIds.includes(branchObj.id)
    );

    // Hide filter if only 0-1 coaches
    if (branchCoaches.length <= 1) {
        if (filterGroup) filterGroup.style.display = 'none';
        select.disabled = true;
        return;
    }

    // Show and enable filter for multiple coaches
    if (filterGroup) filterGroup.style.display = 'flex';
    select.disabled = false;

    // Add coach options
    branchCoaches.forEach(coach => {
        const option = document.createElement('option');
        option.value = coach.id;
        option.textContent = `${coach.firstName} ${coach.lastName}`;
        if (attendanceCurrentCoach === coach.id) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    // Add "Unassigned" option if any students lack coach
    const hasUnassignedStudents = window.students.some(
        s => s.branchId === branchObj.id && !s.coachId && s.status === 'active'
    );
    if (hasUnassignedStudents) {
        const option = document.createElement('option');
        option.value = 'unassigned';
        option.textContent = t('admin.attendance.unassignedCoach') || 'Unassigned';
        select.appendChild(option);
    }

    // Sync mobile filter
    syncMobileCoachFilter();
}

// Load student name aliases
async function loadStudentAliases() {
    if (window.supabaseData && typeof window.supabaseData.getStudentNameAliases === 'function') {
        try {
            attendanceStudentAliases = await window.supabaseData.getStudentNameAliases();
        } catch (e) {
            console.warn('Could not load student aliases:', e);
            attendanceStudentAliases = [];
        }
    }
}

// Populate schedule dropdown based on selected branch
function populateAttendanceScheduleDropdown() {
    const desktopSelect = document.getElementById('attendanceScheduleFilter');
    const mobileSelect = document.getElementById('mobileScheduleFilter');
    const addStudentSelect = document.getElementById('addStudentScheduleSelect');

    // Determine which schedule types to show based on branch
    const isDebutBranch = attendanceCurrentBranch && attendanceCurrentBranch.toLowerCase().includes('debut');
    const isNishBranch = attendanceCurrentBranch && (
        attendanceCurrentBranch.toLowerCase().includes('ниш') ||
        attendanceCurrentBranch.toLowerCase().includes('nish')
    );

    // Update desktop dropdown
    if (desktopSelect) {
        const currentValue = desktopSelect.value;

        if (isDebutBranch) {
            // Debut branch offers BOTH mon_wed (Asylkhan) and mon_wed_fri (Nail)
            desktopSelect.innerHTML = `
                <option value="" data-i18n="admin.attendance.allSchedules">All Schedules</option>
                <option value="mon_wed" data-i18n="admin.attendance.monWed">${t('admin.attendance.monWed')}</option>
                <option value="mon_wed_fri" data-i18n="admin.attendance.monWedFri">${t('admin.attendance.monWedFri')}</option>
                <option value="tue_thu" data-i18n="admin.attendance.tueThu">${t('admin.attendance.tueThu')}</option>
                <option value="sat_sun" data-i18n="admin.attendance.satSun">${t('admin.attendance.satSun')}</option>
            `;
        } else if (isNishBranch) {
            // НИШ branch: mon_wed (Arman) and wed_fri (Assylbek)
            desktopSelect.innerHTML = `
                <option value="" data-i18n="admin.attendance.allSchedules">All Schedules</option>
                <option value="mon_wed" data-i18n="admin.attendance.monWed">${t('admin.attendance.monWed')}</option>
                <option value="wed_fri" data-i18n="admin.attendance.wedFri">${t('admin.attendance.wedFri')}</option>
                <option value="tue_thu" data-i18n="admin.attendance.tueThu">${t('admin.attendance.tueThu')}</option>
                <option value="sat_sun" data-i18n="admin.attendance.satSun">${t('admin.attendance.satSun')}</option>
            `;
        } else {
            // Other branches use mon_wed as the 2-day schedule
            desktopSelect.innerHTML = `
                <option value="" data-i18n="admin.attendance.allSchedules">All Schedules</option>
                <option value="mon_wed" data-i18n="admin.attendance.monWed">${t('admin.attendance.monWed')}</option>
                <option value="tue_thu" data-i18n="admin.attendance.tueThu">${t('admin.attendance.tueThu')}</option>
                <option value="sat_sun" data-i18n="admin.attendance.satSun">${t('admin.attendance.satSun')}</option>
            `;
        }

        // Restore previous selection if valid
        if (currentValue) {
            desktopSelect.value = currentValue;
        }
    }

    // Update mobile dropdown
    if (mobileSelect) {
        const currentValue = mobileSelect.value;

        if (isDebutBranch) {
            // Debut branch offers BOTH mon_wed (Asylkhan) and mon_wed_fri (Nail)
            mobileSelect.innerHTML = `
                <option value="" data-i18n="admin.attendance.allSchedules">All Schedules</option>
                <option value="mon_wed" data-i18n="admin.attendance.monWed">${t('admin.attendance.monWed')}</option>
                <option value="mon_wed_fri" data-i18n="admin.attendance.monWedFri">${t('admin.attendance.monWedFri')}</option>
                <option value="tue_thu" data-i18n="admin.attendance.tueThu">${t('admin.attendance.tueThu')}</option>
                <option value="sat_sun" data-i18n="admin.attendance.satSun">${t('admin.attendance.satSun')}</option>
            `;
        } else if (isNishBranch) {
            // НИШ branch: mon_wed (Arman) and wed_fri (Assylbek)
            mobileSelect.innerHTML = `
                <option value="" data-i18n="admin.attendance.allSchedules">All Schedules</option>
                <option value="mon_wed" data-i18n="admin.attendance.monWed">${t('admin.attendance.monWed')}</option>
                <option value="wed_fri" data-i18n="admin.attendance.wedFri">${t('admin.attendance.wedFri')}</option>
                <option value="tue_thu" data-i18n="admin.attendance.tueThu">${t('admin.attendance.tueThu')}</option>
                <option value="sat_sun" data-i18n="admin.attendance.satSun">${t('admin.attendance.satSun')}</option>
            `;
        } else {
            // Other branches use mon_wed as the 2-day schedule
            mobileSelect.innerHTML = `
                <option value="" data-i18n="admin.attendance.allSchedules">All Schedules</option>
                <option value="mon_wed" data-i18n="admin.attendance.monWed">${t('admin.attendance.monWed')}</option>
                <option value="tue_thu" data-i18n="admin.attendance.tueThu">${t('admin.attendance.tueThu')}</option>
                <option value="sat_sun" data-i18n="admin.attendance.satSun">${t('admin.attendance.satSun')}</option>
            `;
        }

        // Restore previous selection if valid
        if (currentValue) {
            mobileSelect.value = currentValue;
        }
    }

    // Update add student modal dropdown
    if (addStudentSelect) {
        const currentValue = addStudentSelect.value;

        if (isDebutBranch) {
            // Debut branch offers BOTH mon_wed (Asylkhan) and mon_wed_fri (Nail)
            addStudentSelect.innerHTML = `
                <option value="mon_wed" data-i18n="admin.attendance.monWed">${t('admin.attendance.monWed')}</option>
                <option value="mon_wed_fri" data-i18n="admin.attendance.monWedFri">${t('admin.attendance.monWedFri')}</option>
                <option value="tue_thu" data-i18n="admin.attendance.tueThu">${t('admin.attendance.tueThu')}</option>
                <option value="sat_sun" data-i18n="admin.attendance.satSun">${t('admin.attendance.satSun')}</option>
            `;
        } else if (isNishBranch) {
            // НИШ branch: mon_wed (Arman) and wed_fri (Assylbek)
            addStudentSelect.innerHTML = `
                <option value="mon_wed" data-i18n="admin.attendance.monWed">${t('admin.attendance.monWed')}</option>
                <option value="wed_fri" data-i18n="admin.attendance.wedFri">${t('admin.attendance.wedFri')}</option>
                <option value="tue_thu" data-i18n="admin.attendance.tueThu">${t('admin.attendance.tueThu')}</option>
                <option value="sat_sun" data-i18n="admin.attendance.satSun">${t('admin.attendance.satSun')}</option>
            `;
        } else {
            // Other branches use mon_wed as the 2-day schedule
            addStudentSelect.innerHTML = `
                <option value="mon_wed" data-i18n="admin.attendance.monWed">${t('admin.attendance.monWed')}</option>
                <option value="tue_thu" data-i18n="admin.attendance.tueThu">${t('admin.attendance.tueThu')}</option>
                <option value="sat_sun" data-i18n="admin.attendance.satSun">${t('admin.attendance.satSun')}</option>
            `;
        }

        // Restore previous selection if valid
        if (currentValue) {
            addStudentSelect.value = currentValue;
        }
    }
}

// Handle branch filter change
function onAttendanceBranchChange() {
    const select = document.getElementById('attendanceBranchFilter');
    attendanceCurrentBranch = select.value;

    // Reset coach filter to 'all' (new branch = new coaches)
    attendanceCurrentCoach = 'all';

    // Reset mobile calendar offset to first chunk
    mobileCalendarOffset = 0;

    // Save filter state
    saveAttendanceFilterState();

    // Populate schedule dropdown based on branch
    populateAttendanceScheduleDropdown();

    // Populate coach dropdown for new branch
    populateAttendanceCoachDropdown();

    populateAttendanceTimeSlots();
    loadAttendanceData();
}

// Handle schedule filter change
function onAttendanceScheduleChange() {
    const select = document.getElementById('attendanceScheduleFilter');
    attendanceCurrentSchedule = select.value;

    // Reset mobile calendar offset to first chunk
    mobileCalendarOffset = 0;

    // Save filter state
    saveAttendanceFilterState();

    populateAttendanceTimeSlots();
    loadAttendanceData();
}

// Handle time slot filter change
function onAttendanceTimeSlotChange() {
    const select = document.getElementById('attendanceTimeSlotFilter');
    attendanceCurrentTimeSlot = select.value;

    // Save filter state
    saveAttendanceFilterState();

    loadAttendanceData();
}

// Handle coach filter change
function onAttendanceCoachChange() {
    const select = document.getElementById('attendanceCoachFilter');
    attendanceCurrentCoach = select.value;

    // Get coach name for time slot logic
    if (attendanceCurrentCoach && attendanceCurrentCoach !== 'all' && attendanceCurrentCoach !== 'unassigned') {
        const coach = window.coaches.find(c => c.id === attendanceCurrentCoach);
        attendanceCurrentCoachName = coach ? `${coach.firstName} ${coach.lastName}` : null;
    } else {
        attendanceCurrentCoachName = null;
    }

    // Reset time slot filter (different coaches may have different slots)
    attendanceCurrentTimeSlot = 'all';
    const timeSlotSelect = document.getElementById('attendanceTimeSlotFilter');
    if (timeSlotSelect) {
        timeSlotSelect.value = 'all';
    }

    // Sync mobile filter
    const mobileSelect = document.getElementById('mobileCoachFilter');
    if (mobileSelect) {
        mobileSelect.value = attendanceCurrentCoach;
    }

    // Repopulate time slots with coach-specific slots
    populateAttendanceTimeSlots();

    // Save filter state
    saveAttendanceFilterState();

    // Reload data
    loadAttendanceData();
}

// Mobile filter handlers - sync with desktop filters
function onMobileAttendanceBranchChange() {
    const mobileSelect = document.getElementById('mobileBranchFilter');
    const desktopSelect = document.getElementById('attendanceBranchFilter');

    attendanceCurrentBranch = mobileSelect.value;
    if (desktopSelect) desktopSelect.value = mobileSelect.value;

    // Reset coach filter to 'all' (new branch = new coaches)
    attendanceCurrentCoach = 'all';

    // Reset mobile calendar offset to first chunk
    mobileCalendarOffset = 0;

    // Save filter state
    saveAttendanceFilterState();

    // Populate schedule dropdown based on branch
    populateAttendanceScheduleDropdown();

    // Populate coach dropdown for new branch
    populateAttendanceCoachDropdown();

    // Also populate mobile schedule filter if needed
    populateMobileAttendanceSchedules();
    populateAttendanceTimeSlots();
    loadAttendanceData();
}

function onMobileAttendanceScheduleChange() {
    const mobileSelect = document.getElementById('mobileScheduleFilter');
    const desktopSelect = document.getElementById('attendanceScheduleFilter');

    attendanceCurrentSchedule = mobileSelect.value;
    if (desktopSelect) desktopSelect.value = mobileSelect.value;

    // Reset mobile calendar offset to first chunk
    mobileCalendarOffset = 0;

    // Save filter state
    saveAttendanceFilterState();

    populateAttendanceTimeSlots();
    loadAttendanceData();
}

function onMobileAttendanceCoachChange() {
    const mobileSelect = document.getElementById('mobileCoachFilter');
    const desktopSelect = document.getElementById('attendanceCoachFilter');

    attendanceCurrentCoach = mobileSelect.value;
    if (desktopSelect) desktopSelect.value = mobileSelect.value;

    // Reset time slot filter
    attendanceCurrentTimeSlot = 'all';
    const timeSlotSelect = document.getElementById('attendanceTimeSlotFilter');
    if (timeSlotSelect) {
        timeSlotSelect.value = 'all';
    }

    // Save filter state
    saveAttendanceFilterState();

    loadAttendanceData();
}

// Sync mobile coach filter with desktop
function syncMobileCoachFilter() {
    const mobileSelect = document.getElementById('mobileCoachFilter');
    const desktopSelect = document.getElementById('attendanceCoachFilter');
    const mobileCard = document.getElementById('mobileCoachFilterCard');

    if (!mobileSelect || !desktopSelect) return;

    // Copy options from desktop to mobile
    mobileSelect.innerHTML = desktopSelect.innerHTML;
    mobileSelect.value = attendanceCurrentCoach;

    // Show/hide mobile card based on desktop visibility
    if (mobileCard) {
        const filterGroup = document.getElementById('attendanceCoachFilterGroup');
        // Use 'block' for mobile cards (not 'flex' like desktop)
        const isVisible = filterGroup?.style.display === 'flex';
        mobileCard.style.display = isVisible ? 'block' : 'none';
    }
}

// Populate mobile branch filter
function populateMobileBranchFilter() {
    const select = document.getElementById('mobileBranchFilter');
    if (!select) return;

    // Get unique branches from students (same as desktop)
    const uniqueBranches = [...new Set(window.students.map(s => s.branch))].filter(Boolean);

    select.innerHTML = `
        <option value="">${t('admin.attendance.selectBranch')}</option>
        ${uniqueBranches.map(branch => `
            <option value="${branch}" ${attendanceCurrentBranch === branch ? 'selected' : ''}>
                ${i18n.translateBranchName(branch)}
            </option>
        `).join('')}
    `;

    // Sync with desktop dropdown
    if (attendanceCurrentBranch) {
        select.value = attendanceCurrentBranch;
    }
}

// Populate mobile schedule filter (no changes needed, options are static in HTML)
function populateMobileAttendanceSchedules() {
    // Schedules are already in HTML, no need to populate
}

// Populate time slots dropdown based on current branch and schedule
async function populateAttendanceTimeSlots() {
    const select = document.getElementById('attendanceTimeSlotFilter');
    if (!select || !attendanceCurrentBranch) return;

    select.innerHTML = `<option value="all">${t('admin.attendance.allTimeSlots')}</option>`;

    // Use client-side time slot logic with coach-specific handling
    const timeSlots = getTimeSlotsForBranch(attendanceCurrentBranch, attendanceCurrentSchedule, attendanceCurrentCoachName);
    timeSlots.forEach(slot => {
        if (slot) {
            select.innerHTML += `<option value="${slot}">${slot}</option>`;
        }
    });
}

// Navigate month backward
function attendancePrevMonth() {
    attendanceCurrentMonth--;
    if (attendanceCurrentMonth < 0) {
        attendanceCurrentMonth = 11;
        attendanceCurrentYear--;
    }

    // Save filter state
    saveAttendanceFilterState();

    updateAttendanceMonthDisplay();
    loadAttendanceData();
}

// Navigate month forward
function attendanceNextMonth() {
    attendanceCurrentMonth++;
    if (attendanceCurrentMonth > 11) {
        attendanceCurrentMonth = 0;
        attendanceCurrentYear++;
    }

    // Save filter state
    saveAttendanceFilterState();

    updateAttendanceMonthDisplay();
    loadAttendanceData();
}

// Navigate attendance month (called from HTML onclick)
function navigateAttendanceMonth(direction) {
    if (direction < 0) {
        attendancePrevMonth();
    } else {
        attendanceNextMonth();
    }
}

// Navigate mobile calendar by 4-day chunks
function navigateMobileCalendar(direction) {
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) {
        // Desktop: use old month-switching behavior
        navigateAttendanceMonth(direction);
        return;
    }

    // Get all matching dates for current month
    const targetDays = getScheduleDaysOfWeek(attendanceCurrentSchedule);
    const allDates = getAllMatchingDatesInMonth(
        attendanceCurrentYear,
        attendanceCurrentMonth,
        targetDays
    );

    if (direction > 0) {
        // Next: advance by 4
        mobileCalendarOffset += 4;

        // If offset exceeds available dates, go to next month
        if (mobileCalendarOffset >= allDates.length) {
            attendanceCurrentMonth++;
            if (attendanceCurrentMonth > 11) {
                attendanceCurrentMonth = 0;
                attendanceCurrentYear++;
            }
            mobileCalendarOffset = 0;

            // Save filter state
            saveAttendanceFilterState();

            updateAttendanceMonthDisplay();
            loadAttendanceData();
        } else {
            // Stay in same month, just re-render with new offset
            renderAttendanceCalendar();
        }
    } else {
        // Previous: go back by 4
        mobileCalendarOffset -= 4;

        // If offset is negative, go to previous month's last chunk
        if (mobileCalendarOffset < 0) {
            attendanceCurrentMonth--;
            if (attendanceCurrentMonth < 0) {
                attendanceCurrentMonth = 11;
                attendanceCurrentYear--;
            }

            // Calculate offset for last 4-day chunk of previous month
            const prevMonthDates = getAllMatchingDatesInMonth(
                attendanceCurrentYear,
                attendanceCurrentMonth,
                targetDays
            );
            const chunks = Math.ceil(prevMonthDates.length / 4);
            mobileCalendarOffset = (chunks - 1) * 4;

            // Save filter state
            saveAttendanceFilterState();

            updateAttendanceMonthDisplay();
            loadAttendanceData();
        } else {
            // Stay in same month, just re-render with new offset
            renderAttendanceCalendar();
        }
    }
}

// Update month display
function updateAttendanceMonthDisplay() {
    // Try both possible element IDs
    const display = document.getElementById('attendanceMonthTitle') || document.getElementById('attendanceMonthDisplay');
    if (!display) return;

    const lang = getLanguage();
    const monthNames = lang === 'ru'
        ? ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
        : lang === 'kk'
        ? ['Қаңтар', 'Ақпан', 'Наурыз', 'Сәуір', 'Мамыр', 'Маусым', 'Шілде', 'Тамыз', 'Қыркүйек', 'Қазан', 'Қараша', 'Желтоқсан']
        : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    display.textContent = `${monthNames[attendanceCurrentMonth]} ${attendanceCurrentYear}`;
}

// Load attendance data
async function loadAttendanceData() {
    if (!attendanceCurrentBranch) {
        renderEmptyAttendanceCalendar();
        return;
    }

    // Find branch ID
    const branchObj = window.branches.find(b => b.name === attendanceCurrentBranch);
    if (!branchObj) {
        console.error('Branch not found:', attendanceCurrentBranch);
        return;
    }

    try {
        // Pass null for schedule if "all" or empty string
        const scheduleFilter = attendanceCurrentSchedule && attendanceCurrentSchedule !== 'all' && attendanceCurrentSchedule !== ''
            ? attendanceCurrentSchedule
            : null;

        // Run all independent API calls in parallel for faster loading
        const [scheduleAssignmentsResult, calendarDataResult, timeSlotAssignmentsResult, statsResult, alertsResult] = await Promise.allSettled([
            loadStudentScheduleAssignments(branchObj.id),
            window.supabaseData?.getAttendanceCalendarData?.(
                branchObj.id,
                scheduleFilter,
                attendanceCurrentYear,
                attendanceCurrentMonth + 1,
                attendanceCurrentCoach === 'all' ? null : attendanceCurrentCoach
            ),
            // Load saved time slot assignments from database
            scheduleFilter ? window.supabaseData?.getTimeSlotAssignments?.(branchObj.id, scheduleFilter) : Promise.resolve([]),
            loadAttendanceStats(branchObj.id),
            loadLowAttendanceAlerts(branchObj.id)
        ]);

        // Process calendar data result
        if (calendarDataResult.status === 'fulfilled' && calendarDataResult.value) {
            const rawData = calendarDataResult.value;
            console.log('Calendar data: got', rawData?.students?.length || 0, 'students from branch');
            // Transform data: merge students with their attendance records
            // rawData = { students: [...], attendance: { studentId: { date: {...} } } }
            if (rawData && rawData.students) {
                attendanceCalendarData = rawData.students.map(student => {
                    const studentAttendance = rawData.attendance[student.id] || {};
                    // Convert attendance map to array for the student
                    const attendanceArray = Object.entries(studentAttendance).map(([dateKey, record]) => ({
                        attendance_date: dateKey.split('_')[0], // Handle date_timeSlot keys
                        status: record.status,
                        time_slot: record.timeSlot,
                        notes: record.notes,
                        id: record.id
                    }));

                    return {
                        id: student.id,
                        first_name: student.firstName,
                        last_name: student.lastName,
                        attendance: attendanceArray,
                        time_slot_index: null // Will be assigned from database or initialized
                    };
                });
            } else {
                attendanceCalendarData = [];
            }
        } else {
            attendanceCalendarData = [];
        }

        // Apply saved time slot assignments from database
        // Track which students have been explicitly assigned (from database)
        const assignedStudentIds = new Set();
        // Track students that have been explicitly deleted (time_slot_index = -1)
        const deletedStudentIds = new Set();
        // Reset the global set for current schedule students
        attendanceCurrentScheduleStudents = new Set();

        if (timeSlotAssignmentsResult.status === 'fulfilled' && timeSlotAssignmentsResult.value) {
            const savedAssignments = timeSlotAssignmentsResult.value;

            // Create a map for quick lookup
            const assignmentMap = new Map(savedAssignments.map(a => [a.studentId, a.timeSlotIndex]));

            // Apply saved assignments to students
            attendanceCalendarData.forEach(student => {
                if (assignmentMap.has(student.id)) {
                    const savedSlot = assignmentMap.get(student.id);
                    if (savedSlot === -1) {
                        // Student was explicitly deleted from this schedule
                        deletedStudentIds.add(student.id);
                    } else {
                        student.time_slot_index = savedSlot;
                        // Track that this student has a time slot in the CURRENT schedule
                        attendanceCurrentScheduleStudents.add(student.id);
                    }
                    assignedStudentIds.add(student.id);
                }
            });

            // Filter out deleted students
            if (deletedStudentIds.size > 0) {
                attendanceCalendarData = attendanceCalendarData.filter(s => !deletedStudentIds.has(s.id));
                console.log(`Filtered out ${deletedStudentIds.size} deleted students`);
            }

            console.log(`Applied ${savedAssignments.length - deletedStudentIds.size} saved time slot assignments`);
        }

        // Initialize time slot indices for students that don't have a saved assignment
        // This ensures new students and students without explicit assignments get auto-assigned
        initializeStudentTimeSlots(assignedStudentIds);

        // Render calendar (only after calendar data is processed)
        renderAttendanceCalendar();

    } catch (error) {
        console.error('Error loading attendance data:', error);
        showToast(t('admin.attendance.loadError'), 'error');
    }
}

// Load student schedule assignments (determine which schedule each student belongs to)
// This is based on attendance records - students are assigned to the schedule they attend most
async function loadStudentScheduleAssignments(branchId) {
    try {
        // Query attendance records to determine schedule assignments
        const { data, error } = await window.supabaseClient
            .from('attendance')
            .select('student_id, schedule_type')
            .eq('branch_id', branchId)
            .eq('status', 'present');

        if (error) {
            console.error('Error loading schedule assignments:', error);
            return;
        }

        // Build assignment map: track how many records per schedule per student
        attendanceStudentScheduleAssignments = {};
        const studentScheduleCounts = {};

        data.forEach(record => {
            const studentId = record.student_id;
            const scheduleType = record.schedule_type;

            if (!studentScheduleCounts[studentId]) {
                studentScheduleCounts[studentId] = {};
            }
            studentScheduleCounts[studentId][scheduleType] = (studentScheduleCounts[studentId][scheduleType] || 0) + 1;
        });

        // Assign each student to their most used schedule (or first one if tied)
        Object.entries(studentScheduleCounts).forEach(([studentId, schedules]) => {
            let maxCount = 0;
            let assignedSchedule = null;

            Object.entries(schedules).forEach(([schedule, count]) => {
                if (count > maxCount) {
                    maxCount = count;
                    assignedSchedule = schedule;
                }
            });

            if (assignedSchedule) {
                attendanceStudentScheduleAssignments[studentId] = assignedSchedule;
            }
        });

        console.log('Loaded schedule assignments for', Object.keys(attendanceStudentScheduleAssignments).length, 'students');
    } catch (error) {
        console.error('Error in loadStudentScheduleAssignments:', error);
    }
}

// Load attendance statistics
async function loadAttendanceStats(branchId) {
    try {
        // Get DOM elements with null checks
        const totalSessionsEl = document.getElementById('attendanceTotalSessions');
        const avgRateEl = document.getElementById('attendanceAvgRate');
        const lowCountEl = document.getElementById('attendanceLowCount');
        const studentsCountEl = document.getElementById('attendanceStudentsCount');

        // Try to get summary from database function (may not exist yet)
        if (window.supabaseData && typeof window.supabaseData.getBranchAttendanceSummary === 'function') {
            try {
                const summary = await window.supabaseData.getBranchAttendanceSummary(
                    branchId,
                    attendanceCurrentYear,
                    attendanceCurrentMonth + 1
                );

                if (summary) {
                    if (totalSessionsEl) totalSessionsEl.textContent = summary.totalSessions || 0;
                    if (avgRateEl) avgRateEl.textContent = summary.avgAttendanceRate ? `${Math.round(summary.avgAttendanceRate)}%` : '0%';
                    if (lowCountEl) lowCountEl.textContent = summary.studentsBelow70 || 0;
                    if (studentsCountEl) studentsCountEl.textContent = summary.totalStudents || 0;
                }
            } catch (dbError) {
                // Database function may not exist yet - use fallback
                console.warn('getBranchAttendanceSummary not available, using fallback');
                if (totalSessionsEl) totalSessionsEl.textContent = '0';
                if (avgRateEl) avgRateEl.textContent = '0%';
                if (lowCountEl) lowCountEl.textContent = '0';
                if (studentsCountEl) studentsCountEl.textContent = '0';
            }
        }
    } catch (e) {
        console.warn('Could not load attendance stats:', e);
    }
}

// Load low attendance alerts
async function loadLowAttendanceAlerts(branchId) {
    const container = document.getElementById('lowAttendanceAlerts');
    if (!container) return;

    try {
        if (window.supabaseData && typeof window.supabaseData.getLowAttendanceAlerts === 'function') {
            const alerts = await window.supabaseData.getLowAttendanceAlerts(branchId, 70);

            if (alerts.length === 0) {
                container.innerHTML = `
                    <div style="color: #64748b; font-size: 0.875rem;">
                        ${t('admin.attendance.noLowAttendance')}
                    </div>
                `;
            } else {
                container.innerHTML = alerts.map(alert => `
                    <div class="low-attendance-alert">
                        <i data-lucide="alert-triangle" style="width: 16px; height: 16px; color: #f59e0b;"></i>
                        <span>${alert.first_name} ${alert.last_name}</span>
                        <span class="attendance-rate-badge low">${Math.round(alert.attendance_rate)}%</span>
                    </div>
                `).join('');
                lucide.createIcons();
            }
        }
    } catch (e) {
        console.warn('Could not load low attendance alerts:', e);
    }
}

// Helper function to get all matching dates in a month for given days of week
function getAllMatchingDatesInMonth(year, month, targetDays) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dates = [];
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        if (targetDays.includes(date.getDay())) {
            dates.push(day);
        }
    }
    return dates;
}

// Helper function to get day-of-week numbers for a schedule type
function getScheduleDaysOfWeek(scheduleType) {
    switch (scheduleType) {
        case 'mon_wed': return [1, 3]; // Monday, Wednesday
        case 'mon_wed_fri': return [1, 3, 5]; // Monday, Wednesday, Friday (Debut only)
        case 'tue_thu': return [2, 4]; // Tuesday, Thursday
        case 'sat_sun': return [0, 6]; // Saturday, Sunday
        default: return [];
    }
}

// Helper function to get dates for a specific schedule type in a given month
function getScheduleDates(year, month, scheduleType, offset = 0) {
    const isMobile = window.innerWidth <= 768;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Define which days of week correspond to each schedule
    // 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday
    let targetDays = [];

    switch (scheduleType) {
        case 'mon_wed':
            targetDays = [1, 3]; // Monday, Wednesday
            break;
        case 'mon_wed_fri':
            targetDays = [1, 3, 5]; // Monday, Wednesday, Friday (Debut only)
            break;
        case 'tue_thu':
            targetDays = [2, 4]; // Tuesday, Thursday
            break;
        case 'sat_sun':
            targetDays = [0, 6]; // Saturday, Sunday
            break;
        default:
            // If no schedule selected, return all days (or limited on mobile with offset)
            const allDays = [];
            for (let day = 1; day <= daysInMonth; day++) {
                allDays.push(day);
            }
            // On mobile, return 4-date window based on offset
            if (isMobile) {
                return allDays.slice(offset, offset + 4);
            }
            return allDays;
    }

    // Collect ALL matching dates for the month
    const allMatchingDates = [];
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        if (targetDays.includes(date.getDay())) {
            allMatchingDates.push(day);
        }
    }

    // On mobile, return 4-date window based on offset
    if (isMobile) {
        return allMatchingDates.slice(offset, offset + 4);
    }

    return allMatchingDates; // Desktop: all dates
}

// Render empty attendance calendar
function renderEmptyAttendanceCalendar() {
    const placeholder = document.getElementById('attendanceCalendarPlaceholder');
    const table = document.getElementById('attendanceCalendarTable');

    if (placeholder) {
        placeholder.style.display = 'block';
    }
    if (table) {
        table.style.display = 'none';
    }
}

// Render attendance calendar
function renderAttendanceCalendar(preFilteredData = null) {
    const placeholder = document.getElementById('attendanceCalendarPlaceholder');
    const table = document.getElementById('attendanceCalendarTable');
    const thead = document.getElementById('attendanceCalendarHead');
    const tbody = document.getElementById('attendanceCalendarBody');

    if (!table || !thead || !tbody) {
        console.error('Attendance calendar elements not found');
        return;
    }

    // Get dates filtered by schedule type
    const scheduleDates = getScheduleDates(attendanceCurrentYear, attendanceCurrentMonth, attendanceCurrentSchedule, mobileCalendarOffset);

    // If pre-filtered data is provided (e.g., after drag-and-drop), use it directly
    // and skip re-filtering to preserve the drag-and-drop order
    let filteredData;
    const skipFiltering = preFilteredData !== null;

    if (skipFiltering) {
        // Use the pre-filtered data directly (order already modified by drag-and-drop)
        filteredData = preFilteredData;
    } else {
        // Apply standard filtering from source data
        filteredData = attendanceCalendarData;

        if (attendanceCurrentTimeSlot && attendanceCurrentTimeSlot !== 'all' && attendanceCurrentTimeSlot !== '') {
            filteredData = filteredData.filter(s =>
                s.attendance.some(a => a.time_slot === attendanceCurrentTimeSlot) ||
                s.attendance.length === 0
            );
        }

        // Filter by schedule assignment: only show students who are assigned to current schedule OR unassigned
        // This ensures students only appear in their assigned schedule slot
        if (attendanceCurrentSchedule && attendanceCurrentSchedule !== 'all' && attendanceCurrentSchedule !== '') {
            const beforeFilter = filteredData.length;
            filteredData = filteredData.filter(student => {
                // Always show students who have a time slot assignment in the CURRENT schedule
                // This ensures newly-added students appear even before they have attendance records
                if (attendanceCurrentScheduleStudents.has(student.id)) {
                    return true;
                }
                const assignedSchedule = attendanceStudentScheduleAssignments[student.id];
                // Show student if: not assigned to any schedule yet, OR assigned to current schedule
                return !assignedSchedule || assignedSchedule === attendanceCurrentSchedule;
            });
            console.log('Schedule filter:', attendanceCurrentSchedule, '- kept', filteredData.length, 'of', beforeFilter, 'students');
        }

        // Search query no longer filters table - dropdown navigation is used instead
        // See handleAttendanceSearchDropdown() for search functionality
    }

    // Store filtered data globally for drag-and-drop access
    window.attendanceFilteredData = filteredData;

    if (filteredData.length === 0) {
        // Show placeholder with "no students" message
        if (placeholder) {
            placeholder.innerHTML = `
                <i data-lucide="users" style="width: 48px; height: 48px; margin-bottom: 1rem; opacity: 0.5;"></i>
                <p>${t('admin.attendance.noStudents')}</p>
            `;
            placeholder.style.display = 'block';
        }
        table.style.display = 'none';
        lucide.createIcons();
        return;
    }

    // Hide placeholder, show table
    if (placeholder) {
        placeholder.style.display = 'none';
    }
    table.style.display = 'table';

    // Get day names for header
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayNamesRu = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const dayNamesKk = ['Жс', 'Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сб'];

    // Build header row with only filtered dates - include Add Student button in student column
    let headerHtml = `
        <tr>
            <th class="attendance-student-header">
                <button class="attendance-add-student-btn" onclick="openAddStudentToCalendarModal()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <line x1="19" y1="8" x2="19" y2="14"></line>
                        <line x1="22" y1="11" x2="16" y2="11"></line>
                    </svg>
                    ${t('admin.attendance.addStudent') || 'Add Student'}
                </button>
            </th>
    `;

    // Add day headers only for filtered dates
    scheduleDates.forEach(day => {
        const date = new Date(attendanceCurrentYear, attendanceCurrentMonth, day);
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        // Get localized day name
        let dayName = dayNames[dayOfWeek];
        const currentLang = getLanguage();
        if (currentLang === 'ru') {
            dayName = dayNamesRu[dayOfWeek];
        } else if (currentLang === 'kk') {
            dayName = dayNamesKk[dayOfWeek];
        }

        headerHtml += `
            <th class="attendance-day-header ${isWeekend ? 'weekend' : ''}">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
                    <span style="font-size: 0.65rem; color: #94a3b8; font-weight: 500;">${dayName}</span>
                    <span>${day}</span>
                </div>
            </th>
        `;
    });

    headerHtml += `
        </tr>
    `;
    thead.innerHTML = headerHtml;

    // Build body rows grouped by time slots
    let bodyHtml = '';

    // Get time slots for current branch and schedule type (Sat-Sun has different slots)
    const timeSlots = getTimeSlotsForBranch(attendanceCurrentBranch, attendanceCurrentSchedule, attendanceCurrentCoachName);
    const totalColumns = scheduleDates.length + 1; // Student column + date columns

    // Group students into time slot sections by their time_slot_index property
    // Always show ALL time slots, even if empty
    timeSlots.forEach((timeSlot, slotIndex) => {
        // Get students assigned to this time slot by their time_slot_index
        const slotStudents = getStudentsForTimeSlot(slotIndex, filteredData);

        // Create a unique slot ID for collapse functionality
        const slotId = `time-slot-${slotIndex}`;
        const isExpanded = attendanceExpandedSlots[slotId] !== false; // Default to expanded

        // Always add time slot header row (even for empty slots)
        const studentCount = slotStudents.length;

        // Build time slot header row with sticky label cell + individual date cells
        bodyHtml += `
            <tr class="attendance-time-slot-header"
                data-slot-id="${slotId}"
                data-slot-index="${slotIndex}"
                ondragover="handleSlotDragOver(event, '${slotId}')"
                ondragleave="handleSlotDragLeave(event)"
                ondrop="handleSlotDrop(event, '${slotId}', ${slotIndex})"
                style="cursor: pointer;">
                <td class="attendance-time-slot-cell attendance-time-slot-label-cell"
                    onclick="toggleTimeSlotExpanded('${slotId}')">
                    <div class="time-slot-label">
                        <svg class="time-slot-chevron ${isExpanded ? 'expanded' : ''}" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span>${timeSlot}</span>
                        <span class="time-slot-count">(${studentCount}/${MAX_TIME_SLOT_CAPACITY})</span>
                    </div>
                </td>
        `;

        // Add empty cells for each date column
        scheduleDates.forEach(() => {
            bodyHtml += `<td class="attendance-time-slot-cell attendance-time-slot-date-cell"></td>`;
        });

        bodyHtml += `</tr>`;


        // Calculate how many rows to render for this slot
        const actualStudentCount = slotStudents.length;
        const rowsToRender = Math.max(DEFAULT_TIME_SLOT_ROWS, Math.min(actualStudentCount, MAX_TIME_SLOT_CAPACITY));

        // Render student slots (filled with actual students or empty placeholders)
        for (let rowIndex = 0; rowIndex < rowsToRender; rowIndex++) {
            const student = slotStudents[rowIndex];

            if (student) {
                // Render actual student row
                const firstName = student.first_name || '';
                const lastName = student.last_name || '';
                const initials = (firstName[0] || '?') + (lastName[0] || '?');

                bodyHtml += `
                    <tr class="time-slot-student-row"
                        data-slot-id="${slotId}"
                        data-slot-index="${slotIndex}"
                        data-student-id="${student.id}"
                        draggable="true"
                        ondragstart="handleStudentDragStart(event, '${student.id}', '${slotId}')"
                        ondragend="handleStudentDragEnd(event)"
                        ondragover="handleStudentRowDragOver(event, '${slotId}')"
                        ondragleave="handleStudentRowDragLeave(event)"
                        ondrop="handleSlotDrop(event, '${slotId}', ${slotIndex})"
                        style="${isExpanded ? '' : 'display: none;'}">
                        <td class="attendance-student-cell">
                            <div style="display: flex; align-items: center; gap: 0.5rem; width: 100%;">
                                <span style="min-width: 20px; text-align: right; font-size: 0.75rem; color: #94a3b8; font-weight: 500;">${rowIndex + 1}</span>
                                <div class="drag-handle-container" style="position: relative;">
                                    <div class="drag-handle"
                                         style="cursor: grab; color: #94a3b8; display: flex; align-items: center;"
                                         onclick="event.stopPropagation(); toggleStudentMenu(event, '${student.id}', '${firstName} ${lastName}')">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="9" cy="5" r="1"></circle>
                                            <circle cx="9" cy="12" r="1"></circle>
                                            <circle cx="9" cy="19" r="1"></circle>
                                            <circle cx="15" cy="5" r="1"></circle>
                                            <circle cx="15" cy="12" r="1"></circle>
                                            <circle cx="15" cy="19" r="1"></circle>
                                        </svg>
                                    </div>
                                    <div id="student-menu-${student.id}" class="student-action-menu" style="display: none;">
                                        <button onclick="event.stopPropagation(); deleteStudentFromCalendar('${student.id}', '${firstName} ${lastName}'); closeStudentMenu('${student.id}')">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                <path d="M3 6h18"></path>
                                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                                <line x1="14" y1="11" x2="14" y2="17"></line>
                                            </svg>
                                            <span>${t('admin.attendance.deleteFromCalendar') || 'Delete'}</span>
                                        </button>
                                    </div>
                                </div>
                                <div class="student-avatar" style="width: 28px; height: 28px; font-size: 0.75rem;">
                                    ${initials}
                                </div>
                                <span class="student-name-text" style="flex: 1;"><span class="first-name">${firstName}</span> <span class="last-name">${lastName}</span></span>
                            </div>
                        </td>
                `;

                let presentCount = 0;
                const LESSONS_PER_MONTH = 8; // Fixed: every student is eligible for 8 lessons per month

                // Add day cells only for filtered dates
                scheduleDates.forEach(day => {
                    const dateStr = `${attendanceCurrentYear}-${String(attendanceCurrentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const attendance = student.attendance.find(a => a.attendance_date === dateStr);

                    const status = attendance?.status || '';

                    // Count present for attendance rate
                    if (status === 'present') {
                        presentCount++;
                    }

                    // Determine checkbox state class and icon
                    let checkboxClass = '';
                    let checkboxIcon = '';

                    if (status === 'present') {
                        checkboxClass = 'checked';
                        checkboxIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                    } else if (status === 'excused') {
                        checkboxClass = 'excused';
                        checkboxIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                    } else if (status === 'absent') {
                        checkboxClass = 'absent';
                        checkboxIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
                    }

                    bodyHtml += `
                        <td class="attendance-checkbox-cell"
                            data-student-id="${student.id}"
                            data-date="${dateStr}"
                            data-time-slot="${timeSlot}"
                            onclick="toggleAttendanceCheckbox('${student.id}', '${dateStr}', this)">
                            <div class="attendance-checkbox ${checkboxClass}">
                                ${checkboxIcon}
                            </div>
                        </td>
                    `;
                });

                bodyHtml += `
                    </tr>
                `;
            } else {
                // Skip rendering empty placeholder rows if hideEmptyRows is enabled
                if (attendanceHideEmptyRows) {
                    continue;
                }

                // Render empty placeholder row - also a drop target
                bodyHtml += `
                    <tr class="time-slot-student-row time-slot-empty-row"
                        data-slot-id="${slotId}"
                        data-slot-index="${slotIndex}"
                        ondragover="handleEmptyRowDragOver(event, '${slotId}')"
                        ondragleave="handleEmptyRowDragLeave(event)"
                        ondrop="handleSlotDrop(event, '${slotId}', ${slotIndex})"
                        style="${isExpanded ? '' : 'display: none;'}">
                        <td class="attendance-student-cell">
                            <div style="display: flex; align-items: center; gap: 0.5rem; opacity: 0.4;">
                                <span style="min-width: 20px; text-align: right; font-size: 0.75rem; color: #94a3b8; font-weight: 500;">${rowIndex + 1}</span>
                                <div class="student-avatar" style="width: 28px; height: 28px; font-size: 0.75rem; background: #e2e8f0; color: #94a3b8;">
                                    --
                                </div>
                                <span style="color: #94a3b8; font-style: italic;">Empty slot</span>
                            </div>
                        </td>
                `;

                // Add empty day cells for placeholder
                scheduleDates.forEach(day => {
                    bodyHtml += `
                        <td class="attendance-checkbox-cell" style="opacity: 0.3;">
                            <div class="attendance-checkbox" style="background: #f1f5f9; border-color: #e2e8f0;"></div>
                        </td>
                    `;
                });

                bodyHtml += `
                    </tr>
                `;
            }
        }
    });

    tbody.innerHTML = bodyHtml;
}

// Track which time slots are expanded/collapsed
let attendanceExpandedSlots = {};

// ============================================
// DRAG AND DROP FOR STUDENT TIME SLOT ASSIGNMENT
// ============================================

// Drag state
let draggedStudentRow = null;
let draggedStudentId = null;
let draggedFromSlotId = null;

// Handle drag start on student row
function handleStudentDragStart(event, studentId, slotId) {
    draggedStudentRow = event.target.closest('tr');
    draggedStudentId = studentId;
    draggedFromSlotId = slotId;

    // Set drag data
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', studentId);

    // Add dragging class for visual feedback
    setTimeout(() => {
        draggedStudentRow.classList.add('dragging');
    }, 0);

    // Highlight all drop targets (time slot headers, empty rows, and student rows in other slots)
    document.querySelectorAll('.attendance-time-slot-header').forEach(header => {
        header.classList.add('drop-target-available');
    });
    document.querySelectorAll('.time-slot-empty-row').forEach(row => {
        row.classList.add('drop-target-available');
    });
    // Highlight student rows in OTHER time slots (not the source slot)
    document.querySelectorAll('.time-slot-student-row').forEach(row => {
        if (row.dataset.slotId !== slotId && row.dataset.studentId !== studentId) {
            row.classList.add('drop-target-available');
        }
    });
}

// Handle drag end
function handleStudentDragEnd(event) {
    if (draggedStudentRow) {
        draggedStudentRow.classList.remove('dragging');
    }

    // Remove all drop target highlights from headers
    document.querySelectorAll('.attendance-time-slot-header').forEach(header => {
        header.classList.remove('drop-target-available', 'drop-target-hover');
    });

    // Remove all drop target highlights from empty rows
    document.querySelectorAll('.time-slot-empty-row').forEach(row => {
        row.classList.remove('drop-target-available', 'drop-target-hover');
    });

    // Remove all drop target highlights from student rows
    document.querySelectorAll('.time-slot-student-row').forEach(row => {
        row.classList.remove('drop-target-available', 'drop-target-hover');
    });

    // Reset drag state
    draggedStudentRow = null;
    draggedStudentId = null;
    draggedFromSlotId = null;
}

// Handle drag over on time slot header (allow drop)
function handleSlotDragOver(event, slotId) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    // Don't highlight if dropping on same slot
    if (slotId !== draggedFromSlotId) {
        event.target.closest('.attendance-time-slot-header')?.classList.add('drop-target-hover');
    }
}

// Handle drag leave on time slot header
function handleSlotDragLeave(event) {
    event.target.closest('.attendance-time-slot-header')?.classList.remove('drop-target-hover');
}

// Handle drag over on empty row (allow drop)
function handleEmptyRowDragOver(event, slotId) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    // Don't highlight if dropping on same slot
    if (slotId !== draggedFromSlotId) {
        const emptyRow = event.target.closest('.time-slot-empty-row');
        if (emptyRow) {
            emptyRow.classList.add('drop-target-hover');
        }
    }
}

// Handle drag leave on empty row
function handleEmptyRowDragLeave(event) {
    event.target.closest('.time-slot-empty-row')?.classList.remove('drop-target-hover');
}

// Handle drag over on student row (allow drop to transfer to same time slot)
function handleStudentRowDragOver(event, slotId) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    // Don't highlight if dropping on same slot or on the dragged row itself
    if (slotId !== draggedFromSlotId) {
        const studentRow = event.target.closest('.time-slot-student-row');
        if (studentRow && studentRow.dataset.studentId !== draggedStudentId) {
            studentRow.classList.add('drop-target-hover');
        }
    }
}

// Handle drag leave on student row
function handleStudentRowDragLeave(event) {
    event.target.closest('.time-slot-student-row')?.classList.remove('drop-target-hover');
}

// Handle drop on time slot header, empty row, or student row
function handleSlotDrop(event, targetSlotId, targetSlotIndex) {
    event.preventDefault();
    event.stopPropagation();

    // Remove hover class from header
    const header = event.target.closest('.attendance-time-slot-header');
    if (header) {
        header.classList.remove('drop-target-hover');
    }

    // Remove hover class from empty row
    const emptyRow = event.target.closest('.time-slot-empty-row');
    if (emptyRow) {
        emptyRow.classList.remove('drop-target-hover');
    }

    // Remove hover class from student row (when dropped on another student's row)
    const studentRow = event.target.closest('.time-slot-student-row');
    if (studentRow) {
        studentRow.classList.remove('drop-target-hover');
    }

    // Don't do anything if dropping on same slot
    if (targetSlotId === draggedFromSlotId) {
        return;
    }

    if (!draggedStudentId) {
        return;
    }

    // Move student to new time slot
    moveStudentToTimeSlot(draggedStudentId, draggedFromSlotId, targetSlotId, targetSlotIndex);
}

// Move student from one time slot to another
async function moveStudentToTimeSlot(studentId, fromSlotId, toSlotId, toSlotIndex) {
    // Find the student in the source data (attendanceCalendarData)
    const student = attendanceCalendarData.find(s => s.id === studentId);
    if (!student) {
        console.error('Student not found in calendar data:', studentId);
        return;
    }

    // Get the student's current slot index
    const currentSlotIndex = student.time_slot_index;
    const studentName = `${student.first_name} ${student.last_name}`;

    // If dropping on the same slot, no action needed
    if (currentSlotIndex === toSlotIndex) {
        console.log('Student already in target slot, no move needed');
        return;
    }

    // Check if target slot has room (max 15 students per slot)
    const timeSlots = getTimeSlotsForBranch(attendanceCurrentBranch, attendanceCurrentSchedule, attendanceCurrentCoachName);
    const filteredData = window.attendanceFilteredData || [];
    const targetSlotStudents = getStudentsForTimeSlot(toSlotIndex, filteredData);

    if (targetSlotStudents.length >= MAX_TIME_SLOT_CAPACITY) {
        showToast(
            (t('admin.attendance.slotFull') || 'Time slot {slot} is full (15 students max)')
                .replace('{slot}', timeSlots[toSlotIndex] || `Slot ${toSlotIndex + 1}`)
                .replace('10', MAX_TIME_SLOT_CAPACITY.toString()),
            'error'
        );
        return;
    }

    // Update the student's time_slot_index locally
    student.time_slot_index = toSlotIndex;

    // Also update in filtered data if the student exists there
    const filteredStudent = filteredData.find(s => s.id === studentId);
    if (filteredStudent) {
        filteredStudent.time_slot_index = toSlotIndex;
    }

    console.log(`Moving ${studentName}: slot ${currentSlotIndex} → slot ${toSlotIndex}`);

    // Re-render the calendar to reflect changes immediately
    renderAttendanceCalendar(filteredData);

    // Save to database in the background
    const branchObj = window.branches?.find(b => b.name === attendanceCurrentBranch);
    const branchId = branchObj?.id;
    const scheduleType = attendanceCurrentSchedule;

    if (branchId && scheduleType) {
        try {
            await supabaseData.upsertTimeSlotAssignment(studentId, branchId, scheduleType, toSlotIndex);
            console.log(`Saved time slot assignment to database: ${studentName} → slot ${toSlotIndex}`);
        } catch (error) {
            console.error('Failed to save time slot assignment to database:', error);
            // Still show success since the UI has already updated
            // The assignment will work for this session but may not persist
            showToast(
                (t('admin.attendance.saveFailed') || 'Warning: Could not save to database. Changes may not persist.'),
                'warning'
            );
        }
    }

    // Show success notification
    const targetTimeSlot = timeSlots[toSlotIndex] || `Slot ${toSlotIndex + 1}`;
    showToast(
        (t('admin.attendance.studentMoved') || 'Moved {name} to {slot}')
            .replace('{name}', studentName)
            .replace('{slot}', targetTimeSlot),
        'success'
    );

    console.log(`Moved ${studentName} from slot ${currentSlotIndex} to slot ${toSlotIndex}`);
}

// Toggle hide/show empty rows in time slots
function toggleHideEmptyRows() {
    const toggle = document.getElementById('hideEmptyRowsToggle');
    attendanceHideEmptyRows = toggle ? toggle.checked : !attendanceHideEmptyRows;

    // Re-render the calendar with the new setting
    const filteredData = window.attendanceFilteredData || [];
    renderAttendanceCalendar(filteredData);
}

// Toggle time slot expand/collapse
function toggleTimeSlotExpanded(slotId) {
    // Toggle the state (default is expanded = true)
    attendanceExpandedSlots[slotId] = attendanceExpandedSlots[slotId] === false ? true : false;
    const isExpanded = attendanceExpandedSlots[slotId];

    // Find all student rows for this slot and show/hide them
    const rows = document.querySelectorAll(`tr.time-slot-student-row[data-slot-id="${slotId}"]`);
    rows.forEach(row => {
        row.style.display = isExpanded ? '' : 'none';
    });

    // Update the chevron icon
    const headers = document.querySelectorAll('.attendance-time-slot-header');
    headers.forEach(header => {
        const chevron = header.querySelector('.time-slot-chevron');
        if (chevron && header.getAttribute('onclick')?.includes(slotId)) {
            if (isExpanded) {
                chevron.classList.add('expanded');
            } else {
                chevron.classList.remove('expanded');
            }
        }
    });
}

// Toggle attendance status on cell click
async function toggleAttendanceStatus(studentId, dateStr, cell) {
    if (!attendanceCurrentBranch) return;

    // Find branch ID
    const branchObj = window.branches.find(b => b.name === attendanceCurrentBranch);
    if (!branchObj) return;

    // Status cycle: empty -> present -> absent -> late -> excused -> empty
    const statusCycle = ['', 'present', 'absent', 'late', 'excused'];
    const charMap = { '': '', 'present': 'V', 'absent': 'X', 'late': 'L', 'excused': 'E' };

    // Get current status from cell
    const currentChar = cell.textContent.trim();
    let currentIndex = statusCycle.findIndex(s => charMap[s] === currentChar);
    if (currentIndex === -1) currentIndex = 0;

    // Move to next status
    const nextIndex = (currentIndex + 1) % statusCycle.length;
    const newStatus = statusCycle[nextIndex];

    // Update cell immediately for responsiveness
    cell.textContent = charMap[newStatus];
    cell.className = `attendance-cell ${newStatus}`;

    // Save to database
    try {
        if (newStatus === '') {
            // Delete attendance record
            if (window.supabaseData && typeof window.supabaseData.deleteAttendance === 'function') {
                await window.supabaseData.deleteAttendance(studentId, dateStr, attendanceCurrentSchedule);
            }
        } else {
            // Upsert attendance record
            if (window.supabaseData && typeof window.supabaseData.upsertAttendance === 'function') {
                await window.supabaseData.upsertAttendance({
                    student_id: studentId,
                    branch_id: branchObj.id,
                    attendance_date: dateStr,
                    schedule_type: attendanceCurrentSchedule,
                    time_slot: attendanceCurrentTimeSlot !== 'all' ? attendanceCurrentTimeSlot : null,
                    status: newStatus
                });
            }
        }

        // Update local data
        const studentData = attendanceCalendarData.find(s => s.id === studentId);
        if (studentData) {
            const existingIndex = studentData.attendance.findIndex(a => a.attendance_date === dateStr);
            if (newStatus === '') {
                if (existingIndex !== -1) {
                    studentData.attendance.splice(existingIndex, 1);
                }
            } else {
                if (existingIndex !== -1) {
                    studentData.attendance[existingIndex].status = newStatus;
                } else {
                    studentData.attendance.push({
                        attendance_date: dateStr,
                        status: newStatus,
                        time_slot: attendanceCurrentTimeSlot !== 'all' ? attendanceCurrentTimeSlot : null
                    });
                }
            }
        }

    } catch (error) {
        console.error('Error saving attendance:', error);
        showToast(t('admin.attendance.saveError'), 'error');
        // Revert cell on error
        cell.textContent = currentChar;
        cell.className = `attendance-cell ${statusCycle[currentIndex]}`;
    }
}

/**
 * Set the current attendance marking mode
 * @param {string} mode - The mode to set: 'present', 'excused', or 'absent'
 */
function setAttendanceMode(mode) {
    // Validate mode
    const validModes = ['present', 'excused', 'absent'];
    if (!validModes.includes(mode)) {
        console.error('Invalid attendance mode:', mode);
        return;
    }

    // Update mode
    attendanceCurrentMode = mode;

    // Update button states
    document.querySelectorAll('.attendance-mode-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
    });

    const activeBtn = document.getElementById(`attendanceMode${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.setAttribute('aria-pressed', 'true');
    }

    console.log('Attendance mode set to:', mode);
}

/**
 * Helper function to update checkbox UI based on status
 * @param {HTMLElement} checkbox - The checkbox div element
 * @param {string} status - The status: '', 'present', 'excused', or 'absent'
 */
function updateCheckboxUI(checkbox, status) {
    // Remove all status classes
    checkbox.classList.remove('checked', 'excused', 'absent');

    if (status === '') {
        // Unchecked state
        checkbox.innerHTML = '';
    } else if (status === 'present') {
        // Green checkmark
        checkbox.classList.add('checked');
        checkbox.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (status === 'excused') {
        // Blue checkmark
        checkbox.classList.add('excused');
        checkbox.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (status === 'absent') {
        // Red X
        checkbox.classList.add('absent');
        checkbox.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    }
}

// Toggle attendance checkbox (simplified present/absent toggle)
async function toggleAttendanceCheckbox(studentId, dateStr, cell) {
    if (!attendanceCurrentBranch) return;

    // Find branch ID
    const branchObj = window.branches.find(b => b.name === attendanceCurrentBranch);
    if (!branchObj) return;

    // Get the checkbox div inside the cell
    const checkbox = cell.querySelector('.attendance-checkbox');
    if (!checkbox) return;

    // Check current state from data (not CSS class)
    const studentData = attendanceCalendarData.find(s => s.id === studentId);
    const attendanceRecord = studentData?.attendance.find(a => a.attendance_date === dateStr);
    const currentStatus = attendanceRecord?.status || '';

    // Determine new status based on current mode and current status
    let newStatus;
    if (currentStatus === attendanceCurrentMode) {
        // If clicking the same status, clear it (uncheck)
        newStatus = '';
    } else {
        // Otherwise, set to current mode
        newStatus = attendanceCurrentMode;
    }

    // Update UI immediately for responsiveness
    updateCheckboxUI(checkbox, newStatus);

    // Save to database
    try {
        if (newStatus === '') {
            // Delete attendance record
            if (window.supabaseData) {
                try {
                    // Primary method: Delete by ID if available
                    if (attendanceRecord && attendanceRecord.id && typeof window.supabaseData.deleteAttendance === 'function') {
                        console.log(`Deleting attendance by ID: ${attendanceRecord.id}`);
                        await window.supabaseData.deleteAttendance(attendanceRecord.id);
                    }
                    // Fallback method: Delete by composite key
                    else if (typeof window.supabaseData.deleteAttendanceByKey === 'function') {
                        console.warn('Attendance record ID not found in local data, using composite key deletion');
                        await window.supabaseData.deleteAttendanceByKey(
                            studentId,
                            dateStr,
                            attendanceCurrentSchedule || 'mon_wed',
                            attendanceCurrentTimeSlot !== 'all' ? attendanceCurrentTimeSlot : null
                        );
                    } else {
                        throw new Error('No deletion method available');
                    }
                } catch (deleteError) {
                    console.error('Failed to delete attendance:', {
                        error: deleteError,
                        method: attendanceRecord?.id ? 'deleteAttendance(id)' : 'deleteAttendanceByKey',
                        studentId: studentId,
                        date: dateStr,
                        attendanceId: attendanceRecord?.id,
                        hasRecord: !!attendanceRecord,
                        hasId: !!attendanceRecord?.id,
                        scheduleType: attendanceCurrentSchedule || 'mon_wed',
                        timeSlot: attendanceCurrentTimeSlot !== 'all' ? attendanceCurrentTimeSlot : null
                    });
                    throw deleteError; // Re-throw to trigger catch block below
                }
            }

            // Update local data (only after successful deletion)
            if (studentData) {
                const existingIndex = studentData.attendance.findIndex(a => a.attendance_date === dateStr);
                if (existingIndex !== -1) {
                    studentData.attendance.splice(existingIndex, 1);
                }
            }
        } else {
            // Upsert attendance record
            if (window.supabaseData && typeof window.supabaseData.upsertAttendance === 'function') {
                // Capture the result with ID
                const result = await window.supabaseData.upsertAttendance({
                    studentId: studentId,
                    branchId: branchObj.id,
                    attendanceDate: dateStr,
                    scheduleType: attendanceCurrentSchedule || 'mon_wed',
                    timeSlot: attendanceCurrentTimeSlot !== 'all' ? attendanceCurrentTimeSlot : null,
                    status: newStatus
                });

                // Store the returned ID
                const returnedId = result?.id;

                // Update local data
                const studentData = attendanceCalendarData.find(s => s.id === studentId);
                if (studentData) {
                    const existingIndex = studentData.attendance.findIndex(a => a.attendance_date === dateStr);
                    if (existingIndex !== -1) {
                        // Update existing record
                        studentData.attendance[existingIndex].status = newStatus;
                        studentData.attendance[existingIndex].id = returnedId; // Update ID
                    } else {
                        // Include ID in new record
                        studentData.attendance.push({
                            id: returnedId,  // ID now included
                            attendance_date: dateStr,
                            status: newStatus,
                            time_slot: attendanceCurrentTimeSlot !== 'all' ? attendanceCurrentTimeSlot : null
                        });
                    }
                }
            }
        }

        // Update schedule assignment: when marking present, assign student to current schedule
        if (newStatus === 'present' && attendanceCurrentSchedule && attendanceCurrentSchedule !== 'all') {
            // Only assign if student doesn't already have an assignment
            if (!attendanceStudentScheduleAssignments[studentId]) {
                attendanceStudentScheduleAssignments[studentId] = attendanceCurrentSchedule;
                console.log(`Assigned student ${studentId} to schedule ${attendanceCurrentSchedule}`);
            }
        }

        // Recalculate and update the rate for this row
        updateRowAttendanceRate(studentId);

    } catch (error) {
        console.error('Error saving attendance:', error);

        // Provide specific error messages based on error type
        let errorMsg = t('admin.attendance.saveError');
        if (error.message && error.message.includes('insufficient permissions')) {
            errorMsg = t('admin.attendance.permissionDenied');
        } else if (error.message && error.message.includes('not found')) {
            errorMsg = t('admin.attendance.recordNotFound');
        }

        showToast(errorMsg, 'error');
        // Revert checkbox on error
        updateCheckboxUI(checkbox, currentStatus);
    }
}

// Global variable for dropdown state
let attendanceSearchDropdownVisible = false;

// Handle attendance search dropdown - shows matching students in dropdown
function handleAttendanceSearchDropdown(query) {
    const dropdown = document.getElementById('attendanceSearchDropdown');
    if (!dropdown) return;

    // If empty query, hide dropdown
    if (!query || query.trim() === '') {
        dropdown.style.display = 'none';
        attendanceSearchDropdownVisible = false;
        return;
    }

    const searchLower = query.toLowerCase().trim();

    // Get all students from current calendar data
    const allStudents = attendanceCalendarData || [];

    // Filter by schedule assignment (same as calendar logic)
    let searchableStudents = allStudents;
    if (attendanceCurrentSchedule && attendanceCurrentSchedule !== 'all' && attendanceCurrentSchedule !== '') {
        searchableStudents = allStudents.filter(student => {
            const assignedSchedule = attendanceStudentScheduleAssignments[student.id];
            return !assignedSchedule || assignedSchedule === attendanceCurrentSchedule;
        });
    }

    // Find matching students
    const matches = searchableStudents.filter(student => {
        const fullName = `${student.first_name || ''} ${student.last_name || ''}`.toLowerCase();
        return fullName.includes(searchLower);
    });

    // Render dropdown
    if (matches.length === 0) {
        dropdown.innerHTML = `<div class="attendance-search-no-results">${t('admin.attendance.noStudentsFound') || 'No students found'}</div>`;
    } else {
        // Limit to first 10 matches for performance
        const displayMatches = matches.slice(0, 10);
        dropdown.innerHTML = displayMatches.map(student => {
            const timeSlotIndex = student.time_slot_index ?? 0;
            const timeSlots = getTimeSlotsForBranch(attendanceCurrentBranch, attendanceCurrentSchedule, attendanceCurrentCoachName);
            const timeSlotLabel = timeSlots[timeSlotIndex] || `Slot ${timeSlotIndex + 1}`;

            return `
                <div class="attendance-search-result"
                     onclick="navigateToAttendanceStudent('${student.id}', ${timeSlotIndex})">
                    <span class="attendance-search-result-name">${student.first_name} ${student.last_name}</span>
                    <span class="attendance-search-result-slot">${timeSlotLabel}</span>
                </div>
            `;
        }).join('');

        if (matches.length > 10) {
            dropdown.innerHTML += `<div class="attendance-search-more">+${matches.length - 10} more...</div>`;
        }
    }

    // Position the dropdown using fixed positioning relative to the search input
    const searchInput = document.getElementById('attendanceStudentSearch');
    if (searchInput) {
        const rect = searchInput.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.width = `${Math.max(rect.width, 250)}px`;
    }

    dropdown.style.display = 'block';
    attendanceSearchDropdownVisible = true;
}

// Old search handler - kept for backwards compatibility
function handleAttendanceSearch(query) {
    // Now just delegates to dropdown handler
    handleAttendanceSearchDropdown(query);
}

// Navigate to a specific student in the attendance calendar
function navigateToAttendanceStudent(studentId, timeSlotIndex) {
    // 1. Close dropdown
    const dropdown = document.getElementById('attendanceSearchDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    attendanceSearchDropdownVisible = false;

    // 2. Clear search input
    const searchInput = document.getElementById('attendanceStudentSearch');
    if (searchInput) {
        searchInput.value = '';
    }

    // 3. Expand the time slot group if collapsed
    const slotId = `slot-${timeSlotIndex}`;
    if (!attendanceExpandedSlots[slotId]) {
        attendanceExpandedSlots[slotId] = true;
        renderAttendanceCalendar();
    }

    // 4. Scroll to the student row and highlight
    setTimeout(() => {
        const studentRow = document.querySelector(`tr[data-student-id="${studentId}"]`);
        if (studentRow) {
            studentRow.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Add highlight animation
            studentRow.classList.add('attendance-row-highlight');
            setTimeout(() => {
                studentRow.classList.remove('attendance-row-highlight');
            }, 2000);
        }
    }, 100);
}

// ========================================
// ADD STUDENT TO CALENDAR MODAL
// ========================================

let addStudentSearchDropdownVisible = false;
let addStudentBranchStudents = []; // Students for the selected branch

// Open the Add Student to Calendar modal
function openAddStudentToCalendarModal() {
    const modal = document.getElementById('addStudentToCalendarModal');
    if (!modal) return;

    // Populate branch dropdown
    populateAddStudentBranchDropdown();

    // Set current branch if one is selected in attendance view
    const branchSelect = document.getElementById('addStudentBranchSelect');
    if (attendanceCurrentBranch && branchSelect) {
        branchSelect.value = attendanceCurrentBranch;
        onAddStudentBranchChange();
    }

    // Set current schedule if one is selected in attendance view
    const scheduleSelect = document.getElementById('addStudentScheduleSelect');
    if (attendanceCurrentSchedule && scheduleSelect) {
        scheduleSelect.value = attendanceCurrentSchedule;
        onAddStudentScheduleChange();
    }

    // Clear any previous selection
    clearSelectedStudent();

    // Show modal
    modal.classList.add('active');

    // Re-initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Close the Add Student to Calendar modal
function closeAddStudentToCalendarModal() {
    const modal = document.getElementById('addStudentToCalendarModal');
    if (modal) {
        modal.classList.remove('active');
    }
    // Close dropdown if open
    const dropdown = document.getElementById('addStudentSearchDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    addStudentSearchDropdownVisible = false;
}

// Populate branch dropdown in modal
function populateAddStudentBranchDropdown() {
    const select = document.getElementById('addStudentBranchSelect');
    if (!select || !window.branches) return;

    // Get unique branch names
    const branchNames = [...new Set(window.branches.map(b => b.name))].sort();

    select.innerHTML = `
        <option value="">${t('admin.attendance.selectBranch') || 'Select Branch'}</option>
        ${branchNames.map(name => `
            <option value="${name}">${i18n.translateBranchName(name)}</option>
        `).join('')}
    `;
}

// Handle branch change in Add Student modal
function onAddStudentBranchChange() {
    const branchSelect = document.getElementById('addStudentBranchSelect');
    const selectedBranch = branchSelect?.value;

    // Clear student selection when branch changes
    clearSelectedStudent();
    document.getElementById('addStudentSearchInput').value = '';

    // Filter students by selected branch (only active students)
    if (selectedBranch && window.students) {
        addStudentBranchStudents = window.students
            .filter(s => s.branch === selectedBranch && s.status === 'active')
            .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    } else {
        addStudentBranchStudents = [];
    }

    // Update time slots based on branch and schedule
    onAddStudentScheduleChange();
}

// Handle schedule change in Add Student modal
function onAddStudentScheduleChange() {
    const branchSelect = document.getElementById('addStudentBranchSelect');
    const scheduleSelect = document.getElementById('addStudentScheduleSelect');
    const timeSlotSelect = document.getElementById('addStudentTimeSlotSelect');

    const selectedBranch = branchSelect?.value;
    const selectedSchedule = scheduleSelect?.value;

    if (!timeSlotSelect) return;

    // Get coach name from selected student if available
    let coachName = null;
    const studentId = document.getElementById('addStudentSelectedId')?.value;
    if (studentId) {
        const student = window.students?.find(s => s.id === studentId);
        if (student && student.coachId) {
            const coach = window.coaches?.find(c => c.id === student.coachId);
            coachName = coach ? `${coach.firstName} ${coach.lastName}` : null;
        }
    }

    // Get time slots for the selected branch and schedule
    const timeSlots = getTimeSlotsForBranch(selectedBranch, selectedSchedule, coachName);

    timeSlotSelect.innerHTML = `
        <option value="">${t('admin.attendance.selectTimeSlot') || 'Select Time Slot'}</option>
        ${timeSlots.map((slot, index) => `
            <option value="${index}">${slot}</option>
        `).join('')}
    `;
}

// Handle student search in Add Student modal
function handleAddStudentSearch(query) {
    const dropdown = document.getElementById('addStudentSearchDropdown');
    if (!dropdown) return;

    // If empty query, hide dropdown
    if (!query || query.trim() === '') {
        dropdown.style.display = 'none';
        addStudentSearchDropdownVisible = false;
        return;
    }

    const searchLower = query.toLowerCase().trim();

    // Check if branch is selected
    const branchSelect = document.getElementById('addStudentBranchSelect');
    if (!branchSelect?.value) {
        dropdown.innerHTML = `<div class="add-student-search-no-results">${t('admin.attendance.selectBranchFirst') || 'Please select a branch first'}</div>`;
        dropdown.style.display = 'block';
        addStudentSearchDropdownVisible = true;
        return;
    }

    // Filter students by search query
    const matches = addStudentBranchStudents.filter(student => {
        const fullName = `${student.firstName || ''} ${student.lastName || ''}`.toLowerCase();
        return fullName.includes(searchLower);
    });

    // Render dropdown
    if (matches.length === 0) {
        dropdown.innerHTML = `<div class="add-student-search-no-results">${t('admin.attendance.noStudentsFound') || 'No students found'}</div>`;
    } else {
        // Limit to first 10 matches for performance
        const displayMatches = matches.slice(0, 10);
        dropdown.innerHTML = displayMatches.map(student => `
            <div class="add-student-search-result" onclick="selectStudentForCalendar('${student.id}', '${student.firstName}', '${student.lastName}')">
                <span class="add-student-search-result-name">${student.firstName} ${student.lastName}</span>
            </div>
        `).join('');

        if (matches.length > 10) {
            dropdown.innerHTML += `<div class="add-student-search-more">+${matches.length - 10} ${t('admin.attendance.more') || 'more'}...</div>`;
        }
    }

    // Position dropdown
    const searchInput = document.getElementById('addStudentSearchInput');
    if (searchInput) {
        const rect = searchInput.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.width = `${rect.width}px`;
    }

    dropdown.style.display = 'block';
    addStudentSearchDropdownVisible = true;
}

// Select a student from the dropdown
function selectStudentForCalendar(studentId, firstName, lastName) {
    // Set hidden input
    document.getElementById('addStudentSelectedId').value = studentId;

    // Show selected display
    const selectedDisplay = document.getElementById('addStudentSelectedDisplay');
    const selectedName = document.getElementById('addStudentSelectedName');
    const searchInput = document.getElementById('addStudentSearchInput');

    if (selectedDisplay && selectedName) {
        selectedName.textContent = `${firstName} ${lastName}`;
        selectedDisplay.style.display = 'flex';
    }

    // Hide search input
    if (searchInput) {
        searchInput.style.display = 'none';
        searchInput.value = '';
    }

    // Close dropdown
    const dropdown = document.getElementById('addStudentSearchDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    addStudentSearchDropdownVisible = false;

    // Re-initialize Lucide icons for the clear button
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Clear the selected student
function clearSelectedStudent() {
    document.getElementById('addStudentSelectedId').value = '';

    const selectedDisplay = document.getElementById('addStudentSelectedDisplay');
    const searchInput = document.getElementById('addStudentSearchInput');

    if (selectedDisplay) {
        selectedDisplay.style.display = 'none';
    }
    if (searchInput) {
        searchInput.style.display = 'block';
        searchInput.value = '';
    }
}

// Submit the Add Student form
async function submitAddStudentToCalendar() {
    const branchSelect = document.getElementById('addStudentBranchSelect');
    const studentId = document.getElementById('addStudentSelectedId').value;
    const scheduleSelect = document.getElementById('addStudentScheduleSelect');
    const timeSlotSelect = document.getElementById('addStudentTimeSlotSelect');

    const selectedBranch = branchSelect?.value;
    const selectedSchedule = scheduleSelect?.value;
    const selectedTimeSlotIndex = timeSlotSelect?.value;

    // Validation
    if (!selectedBranch) {
        showToast(t('admin.attendance.selectBranchError') || 'Please select a branch', 'error');
        return;
    }
    if (!studentId) {
        showToast(t('admin.attendance.selectStudentError') || 'Please select a student', 'error');
        return;
    }
    if (!selectedSchedule) {
        showToast(t('admin.attendance.selectScheduleError') || 'Please select a schedule', 'error');
        return;
    }
    if (selectedTimeSlotIndex === '' || selectedTimeSlotIndex === null) {
        showToast(t('admin.attendance.selectTimeSlotError') || 'Please select a time slot', 'error');
        return;
    }

    try {
        // Find branch ID
        const branchObj = window.branches.find(b => b.name === selectedBranch);
        if (!branchObj) {
            showToast(t('admin.attendance.branchNotFound') || 'Branch not found', 'error');
            return;
        }

        // Check slot capacity before adding
        const timeSlotIndex = parseInt(selectedTimeSlotIndex);
        const studentsInSlot = (window.students || []).filter(s => {
            const assignments = s.timeSlotAssignments || {};
            return s.branchId === branchObj.id &&
                   s.status === 'active' &&
                   assignments[selectedSchedule] === timeSlotIndex &&
                   s.id !== studentId; // Exclude current student in case of reassignment
        });

        if (studentsInSlot.length >= MAX_TIME_SLOT_CAPACITY) {
            // Get coach name for the selected student
            const student = window.students?.find(s => s.id === studentId);
            let coachName = null;
            if (student && student.coachId) {
                const coach = window.coaches?.find(c => c.id === student.coachId);
                coachName = coach ? `${coach.firstName} ${coach.lastName}` : null;
            }

            const timeSlots = getTimeSlotsForBranch(selectedBranch, selectedSchedule, coachName);
            const slotName = timeSlots[timeSlotIndex] || `Slot ${timeSlotIndex + 1}`;
            showToast(
                `Time slot ${slotName} is full (${MAX_TIME_SLOT_CAPACITY} students max). Please select a different time slot.`,
                'error'
            );
            return;
        }

        // Save time slot assignment to database
        if (window.supabaseData?.upsertTimeSlotAssignment) {
            await window.supabaseData.upsertTimeSlotAssignment(
                studentId,
                branchObj.id,
                selectedSchedule,
                parseInt(selectedTimeSlotIndex)
            );
        }

        // Close modal
        closeAddStudentToCalendarModal();

        // Update the current attendance view if the branch/schedule matches
        if (selectedBranch === attendanceCurrentBranch &&
            (selectedSchedule === attendanceCurrentSchedule || attendanceCurrentSchedule === 'all')) {
            // Reload attendance data to reflect the new assignment
            await loadAttendanceData();
        } else {
            // Switch to the branch and schedule where the student was added
            attendanceCurrentBranch = selectedBranch;
            attendanceCurrentSchedule = selectedSchedule;

            // Update the filter dropdowns
            const branchFilter = document.getElementById('attendanceBranchFilter');
            const scheduleFilter = document.getElementById('attendanceScheduleFilter');
            if (branchFilter) branchFilter.value = selectedBranch;
            if (scheduleFilter) scheduleFilter.value = selectedSchedule;

            // Reload attendance data
            await loadAttendanceData();
        }

        // Show success message
        const student = window.students.find(s => s.id === studentId);
        const studentName = student ? `${student.firstName} ${student.lastName}` : 'Student';
        showToast(t('admin.attendance.studentAddedSuccess', { name: studentName }) || `${studentName} added to calendar`, 'success');

    } catch (error) {
        console.error('Error adding student to calendar:', error);
        showToast(t('admin.attendance.addStudentError') || 'Error adding student', 'error');
    }
}

// Close dropdown when clicking outside (for Add Student modal)
document.addEventListener('click', function(event) {
    if (!addStudentSearchDropdownVisible) return;

    const dropdown = document.getElementById('addStudentSearchDropdown');
    const searchInput = document.getElementById('addStudentSearchInput');

    if (dropdown && searchInput &&
        !dropdown.contains(event.target) &&
        !searchInput.contains(event.target)) {
        dropdown.style.display = 'none';
        addStudentSearchDropdownVisible = false;
    }
});

// Toggle student action menu (shows delete option in drag handle dropdown)
function toggleStudentMenu(event, studentId, studentName) {
    event.stopPropagation();
    const menu = document.getElementById(`student-menu-${studentId}`);
    if (!menu) return;

    // Close all other open menus first and return them to their original parents
    document.querySelectorAll('.student-action-menu').forEach(m => {
        if (m.id !== `student-menu-${studentId}`) {
            m.style.display = 'none';
        }
    });

    // Toggle current menu
    if (menu.style.display === 'none' || menu.style.display === '') {
        // Move menu to body to escape overflow:hidden clipping from parent cells
        if (menu.parentElement !== document.body) {
            document.body.appendChild(menu);
        }

        // Position the menu near the click using fixed positioning
        const rect = event.currentTarget.getBoundingClientRect();
        menu.style.display = 'block';
        menu.style.position = 'fixed';
        menu.style.left = `${rect.left}px`;
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.zIndex = '99999';

        // Ensure menu doesn't go off-screen
        const menuRect = menu.getBoundingClientRect();
        if (menuRect.right > window.innerWidth) {
            menu.style.left = `${window.innerWidth - menuRect.width - 10}px`;
        }
        if (menuRect.bottom > window.innerHeight) {
            menu.style.top = `${rect.top - menuRect.height - 4}px`;
        }
    } else {
        menu.style.display = 'none';
    }
}

// Close student action menu
function closeStudentMenu(studentId) {
    const menu = document.getElementById(`student-menu-${studentId}`);
    if (menu) {
        menu.style.display = 'none';
    }
}

// Close all student menus when clicking outside
document.addEventListener('click', (event) => {
    if (!event.target.closest('.drag-handle-container')) {
        document.querySelectorAll('.student-action-menu').forEach(menu => {
            menu.style.display = 'none';
        });
    }
});

// Delete student from attendance calendar (removes from current view and deletes all attendance records)
async function deleteStudentFromCalendar(studentId, studentName) {
    // Show confirmation dialog
    const message = t('admin.attendance.confirmDeleteStudent', { name: studentName }) ||
                    `Are you sure you want to remove "${studentName}" from this attendance calendar? This will delete all their attendance records for this branch.`;

    showDeleteConfirmation(message, async () => {
        try {
            // Find student in calendar data
            const studentIndex = attendanceCalendarData.findIndex(s => s.id === studentId);
            if (studentIndex === -1) {
                console.error('Student not found in calendar data:', studentId);
                showError(t('admin.attendance.studentNotFound') || 'Student not found');
                return;
            }

            const student = attendanceCalendarData[studentIndex];

            // Delete all attendance records for this student in the current branch
            if (student.attendance && student.attendance.length > 0 && window.supabaseData) {
                // Get all attendance record IDs
                const attendanceIds = student.attendance
                    .filter(a => a.id)
                    .map(a => a.id);

                if (attendanceIds.length > 0) {
                    // Delete from database in batch
                    const { error } = await window.supabaseClient
                        .from('attendance')
                        .delete()
                        .in('id', attendanceIds);

                    if (error) {
                        console.error('Error deleting attendance records:', error);
                        showError(t('admin.attendance.deleteError') || 'Failed to delete attendance records');
                        return;
                    }
                }
            }

            // Remove from local calendar data
            attendanceCalendarData.splice(studentIndex, 1);

            // Also remove from schedule assignments if present
            if (attendanceStudentScheduleAssignments[studentId]) {
                delete attendanceStudentScheduleAssignments[studentId];
            }

            // Mark student as deleted by saving time_slot_index = -1
            // This ensures they stay deleted even after page refresh
            if (window.supabaseData && attendanceCurrentBranch && attendanceCurrentSchedule) {
                try {
                    // Look up the branch ID from the branch name
                    const branchObj = window.branches?.find(b => b.name === attendanceCurrentBranch);
                    if (branchObj && branchObj.id) {
                        // Use -1 as a special value to indicate "deleted from this schedule"
                        await window.supabaseData.upsertTimeSlotAssignment(
                            studentId,
                            branchObj.id,
                            attendanceCurrentSchedule,
                            -1 // Special value: deleted/removed from calendar
                        );
                        console.log(`Marked ${studentName} as deleted (time_slot_index = -1)`);
                    }
                } catch (err) {
                    console.error('Error saving deletion marker:', err);
                    // Continue anyway - the student is already removed from local state
                }
            }

            // Re-render calendar
            renderAttendanceCalendar();

            // Show success notification
            showSuccess(t('admin.attendance.studentDeleted', { name: studentName }) ||
                       `"${studentName}" has been removed from the attendance calendar`);

        } catch (error) {
            console.error('Error deleting student from calendar:', error);
            showError(t('admin.attendance.deleteError') || 'Failed to remove student from calendar');
        }
    });
}

// Update attendance rate for a specific student row
function updateRowAttendanceRate(studentId) {
    const studentData = attendanceCalendarData.find(s => s.id === studentId);
    if (!studentData) return;

    const scheduleDates = getScheduleDates(attendanceCurrentYear, attendanceCurrentMonth, attendanceCurrentSchedule, mobileCalendarOffset);
    const LESSONS_PER_MONTH = 8; // Fixed: every student is eligible for 8 lessons per month

    let presentCount = 0;
    scheduleDates.forEach(day => {
        const dateStr = `${attendanceCurrentYear}-${String(attendanceCurrentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const attendance = studentData.attendance.find(a => a.attendance_date === dateStr);
        if (attendance && attendance.status === 'present') {
            presentCount++;
        }
    });

    const rate = Math.round((presentCount / LESSONS_PER_MONTH) * 100);
    const rateClass = rate >= 70 ? 'good' : rate >= 50 ? 'warning' : 'low';

    // Find the rate badge in this student's row and update it
    const rows = document.querySelectorAll('#attendanceCalendarBody tr');
    rows.forEach(row => {
        const firstCell = row.querySelector('.attendance-checkbox-cell');
        if (firstCell && firstCell.dataset.studentId === studentId) {
            const rateBadge = row.querySelector('.attendance-rate-badge');
            if (rateBadge) {
                rateBadge.textContent = `${rate}%`;
                rateBadge.className = `attendance-rate-badge ${rateClass}`;
            }
        }
    });
}

// Open attendance import modal
function openAttendanceImportModal() {
    const modal = document.getElementById('attendanceImportModal');
    if (modal) {
        modal.classList.add('active');

        // Reset to step 1
        attendanceImportCurrentStep = 1;
        updateImportWizardStep();

        // Populate branch dropdown
        populateImportBranchDropdown();

        // Reset file input
        const fileInput = document.getElementById('attendanceFileInput');
        if (fileInput) fileInput.value = '';

        // Clear preview
        const previewContainer = document.getElementById('sheetPreviewContainer');
        if (previewContainer) previewContainer.innerHTML = '<p style="padding: 2rem; text-align: center; color: #64748b;">Select a sheet to preview</p>';
        const nameMatchingBody = document.getElementById('nameMatchingBody');
        if (nameMatchingBody) nameMatchingBody.innerHTML = '';
    }
}

// Close attendance import modal
function closeAttendanceImportModal() {
    const modal = document.getElementById('attendanceImportModal');
    if (modal) {
        modal.classList.remove('active');
        attendanceExcelParsedData = null;
        attendanceMatchedNames = [];
    }
}

// Populate import branch dropdown
function populateImportBranchDropdown() {
    const select = document.getElementById('importBranchSelect');
    if (!select) return;

    const uniqueBranches = [...new Set(window.students.map(s => s.branch))].filter(Boolean);

    select.innerHTML = `
        <option value="">${t('admin.attendance.selectBranch')}</option>
        ${uniqueBranches.map(branch => `
            <option value="${branch}">${i18n.translateBranchName(branch)}</option>
        `).join('')}
    `;
}

// Update import wizard step
function updateImportWizardStep() {
    // Update step indicators
    document.querySelectorAll('.wizard-step').forEach((step, index) => {
        const stepNum = index + 1;
        step.classList.toggle('active', stepNum === attendanceImportCurrentStep);
        step.classList.toggle('completed', stepNum < attendanceImportCurrentStep);
    });

    // Show/hide step content
    document.querySelectorAll('.import-step').forEach((content, index) => {
        content.style.display = (index + 1) === attendanceImportCurrentStep ? 'block' : 'none';
    });

    // Update buttons
    const backBtn = document.getElementById('importBackBtn');
    const nextBtn = document.getElementById('importNextBtn');
    const submitBtn = document.getElementById('importSubmitBtn');

    if (backBtn) backBtn.style.display = attendanceImportCurrentStep > 1 ? 'inline-flex' : 'none';

    // Show Next button for steps 1-2, Submit button for step 3
    if (nextBtn) nextBtn.style.display = attendanceImportCurrentStep < 3 ? 'inline-flex' : 'none';
    if (submitBtn) submitBtn.style.display = attendanceImportCurrentStep === 3 ? 'inline-flex' : 'none';
}

// Navigate wizard back
function importWizardBack() {
    if (attendanceImportCurrentStep > 1) {
        attendanceImportCurrentStep--;
        updateImportWizardStep();
    }
}

// Navigate wizard next
async function importWizardNext() {
    if (attendanceImportCurrentStep === 1) {
        // Validate branch and file
        const branchSelect = document.getElementById('importBranchSelect');
        const fileInput = document.getElementById('attendanceFileInput');

        if (!branchSelect.value) {
            showToast(t('admin.attendance.selectBranchError'), 'error');
            return;
        }

        if (!fileInput.files || fileInput.files.length === 0) {
            showToast(t('admin.attendance.selectFileError'), 'error');
            return;
        }

        // Parse Excel file
        const success = await parseExcelFile(fileInput.files[0]);
        if (!success) return;

        attendanceImportCurrentStep = 2;
        updateImportWizardStep();

    } else if (attendanceImportCurrentStep === 2) {
        // Process selected sheet
        await processSelectedSheet();
        attendanceImportCurrentStep = 3;
        updateImportWizardStep();

    } else if (attendanceImportCurrentStep === 3) {
        // Submit import
        await submitAttendanceImport();
    }
}

// Parse Excel file using SheetJS
async function parseExcelFile(file) {
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });

        attendanceExcelParsedData = {
            workbook,
            sheetNames: workbook.SheetNames,
            currentSheet: 0
        };

        // Render sheet tabs
        renderSheetTabs();

        // Preview first sheet
        previewSheet(0);

        return true;

    } catch (error) {
        console.error('Error parsing Excel file:', error);
        showToast(t('admin.attendance.parseError'), 'error');
        return false;
    }
}

// Render sheet tabs
function renderSheetTabs() {
    const container = document.getElementById('sheetTabsContainer');
    if (!container || !attendanceExcelParsedData) return;

    container.innerHTML = attendanceExcelParsedData.sheetNames.map((name, index) => `
        <button class="sheet-tab ${index === 0 ? 'active' : ''}" onclick="selectSheet(${index})">
            ${name}
        </button>
    `).join('');
}

// Select a sheet
function selectSheet(index) {
    if (!attendanceExcelParsedData) return;

    attendanceExcelParsedData.currentSheet = index;

    // Update tab styling
    document.querySelectorAll('.sheet-tab').forEach((tab, i) => {
        tab.classList.toggle('active', i === index);
    });

    // Preview selected sheet
    previewSheet(index);
}

// Preview sheet data
function previewSheet(index) {
    const container = document.getElementById('sheetPreviewContainer');
    if (!container || !attendanceExcelParsedData) return;

    const sheetName = attendanceExcelParsedData.sheetNames[index];
    const sheet = attendanceExcelParsedData.workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (jsonData.length === 0) {
        container.innerHTML = `<div style="color: #94a3b8; padding: 1rem;">${t('admin.attendance.emptySheet')}</div>`;
        return;
    }

    // Show first 10 rows as preview
    const previewRows = jsonData.slice(0, 10);

    let html = '<table style="width: 100%; font-size: 0.75rem; border-collapse: collapse;">';
    previewRows.forEach((row, rowIndex) => {
        html += '<tr>';
        row.forEach((cell, colIndex) => {
            const tag = rowIndex < 2 ? 'th' : 'td';
            html += `<${tag} style="padding: 0.25rem 0.5rem; border: 1px solid #e2e8f0; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${cell || ''}</${tag}>`;
        });
        html += '</tr>';
    });
    html += '</table>';

    if (jsonData.length > 10) {
        html += `<div style="color: #64748b; font-size: 0.75rem; margin-top: 0.5rem;">... ${jsonData.length - 10} ${t('admin.attendance.moreRows')}</div>`;
    }

    container.innerHTML = html;
}

// Process selected sheet for name matching
async function processSelectedSheet() {
    if (!attendanceExcelParsedData) return;

    const sheetName = attendanceExcelParsedData.sheetNames[attendanceExcelParsedData.currentSheet];
    const sheet = attendanceExcelParsedData.workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Determine schedule type from sheet name
    let scheduleType = 'mon_wed';
    const sheetLower = sheetName.toLowerCase();
    if (sheetLower.includes('вт') && sheetLower.includes('чт') || sheetLower.includes('tue') && sheetLower.includes('thu')) {
        scheduleType = 'tue_thu';
    } else if (sheetLower.includes('сб') || sheetLower.includes('вс') || sheetLower.includes('sat') || sheetLower.includes('sun')) {
        scheduleType = 'sat_sun';
    }

    // Extract student names and attendance data
    const parsedAttendance = parseAttendanceSheet(jsonData);

    // Get selected branch
    const branchName = document.getElementById('importBranchSelect').value;
    const branchStudents = window.students.filter(s => s.branch === branchName);

    // Match names
    attendanceMatchedNames = await matchStudentNames(parsedAttendance.students, branchStudents);

    // Store schedule type
    attendanceExcelParsedData.scheduleType = scheduleType;
    attendanceExcelParsedData.parsedData = parsedAttendance;

    // Render name matching table
    renderNameMatchingTable();
}

// ============================================
// EXCEL PARSING HELPER FUNCTIONS
// ============================================

// Extract branch name from filename using common patterns
// Returns the branch name if found, or null if not detectable
function extractBranchFromFilename(filename) {
    if (!filename) return null;

    const normalizedFilename = filename.toLowerCase();

    // Common branch patterns found in filenames
    // Format: { pattern: regex/string, branches: array of possible branch names to try }
    const branchPatterns = [
        // Хан-Армия / Khan-Army variations
        { pattern: /ха|хан|khan|han[-_\s]?arm/i, keywords: ['хан-армия', 'khan-army', 'han-army', 'хан армия', 'khan army'] },
        // Halyk Arena variations
        { pattern: /halyk|khalyk|халык/i, keywords: ['halyk arena', 'khalyk arena', 'халык арена', 'halyk'] },
        // Dostyk variations
        { pattern: /достык|dostyk|dost/i, keywords: ['достык', 'dostyk'] },
        // Add more branch patterns as needed
    ];

    for (const { pattern, keywords } of branchPatterns) {
        if (pattern.test(normalizedFilename)) {
            // Try to find a matching branch from the available branches
            const availableBranches = [...new Set(window.students?.map(s => s.branch) || [])].filter(Boolean);

            for (const keyword of keywords) {
                const matchedBranch = availableBranches.find(branch =>
                    branch.toLowerCase().includes(keyword.toLowerCase()) ||
                    keyword.toLowerCase().includes(branch.toLowerCase())
                );
                if (matchedBranch) {
                    console.log(`Auto-detected branch "${matchedBranch}" from filename "${filename}"`);
                    return matchedBranch;
                }
            }
        }
    }

    return null;
}

// Check if a row is a time slot header row
// Time slot headers contain: schedule type (Пн-Ср) or time pattern (10:00-11:00)
// and typically have Excel serial dates in subsequent columns
function isTimeSlotHeaderRow(row) {
    if (!row || row.length === 0) return false;

    const firstCell = String(row[0] || '').trim();

    // Check for time pattern like "10:00-11:00" or "10:00 - 11:00"
    if (/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(firstCell)) {
        return true;
    }

    // Check for schedule type keywords (Russian/English) in first cell
    const hasScheduleKeyword = /пн|ср|вт|чт|сб|вс|mon|wed|tue|thu|sat|sun/i.test(firstCell);

    // Check if row has Excel serial dates (numbers between 40000-50000)
    const hasDateInRow = row.some((cell, idx) =>
        idx > 0 && typeof cell === 'number' && cell > 40000 && cell < 50000
    );

    return hasScheduleKeyword && hasDateInRow;
}

// Extract time slot string from a row (e.g., "10:00-11:00")
function extractTimeSlotFromRow(row) {
    if (!row) return null;

    // Check first few cells for time pattern
    for (let i = 0; i < Math.min(3, row.length); i++) {
        const cell = String(row[i] || '');
        const timeMatch = cell.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
        if (timeMatch) {
            return `${timeMatch[1]}-${timeMatch[2]}`;
        }
    }
    return null;
}

// Normalize time slot for comparison (remove spaces, lowercase)
function normalizeTimeSlot(slot) {
    if (!slot) return '';
    return slot.replace(/\s/g, '').toLowerCase();
}

// Find the index of a time slot in the branch's time slot list
function findTimeSlotIndexForBranch(extractedSlot, branchName, scheduleType = null) {
    if (!extractedSlot) return -1;

    // Excel import context: no coach filter, use null to get default time slots
    const timeSlots = getTimeSlotsForBranch(branchName, scheduleType, null);
    const normalizedExtracted = normalizeTimeSlot(extractedSlot);

    return timeSlots.findIndex(slot =>
        normalizeTimeSlot(slot) === normalizedExtracted
    );
}

// Check if a row is a student row (has a name in column B, typically numbered)
function isStudentRow(row, nameColumnIndex = 1) {
    if (!row || row.length <= nameColumnIndex) return false;

    const name = row[nameColumnIndex];
    if (!name || typeof name !== 'string') return false;

    const trimmedName = name.trim();
    // Student names should have at least 2 characters and contain letters
    return trimmedName.length >= 2 && /[a-zA-Zа-яА-ЯёЁ]/.test(trimmedName);
}

// Extract dates from a header row
function extractDatesFromRow(row, startColIndex = 2) {
    const dates = [];

    for (let j = startColIndex; j < row.length; j++) {
        const cell = row[j];
        if (typeof cell === 'number' && cell > 40000 && cell < 50000) {
            const jsDate = excelSerialToDate(cell);
            dates.push({
                colIndex: j,
                date: jsDate.toISOString().split('T')[0]
            });
        }
    }

    return dates;
}

// Parse attendance marks from a row
function parseAttendanceMarks(row, dates) {
    const attendance = [];

    dates.forEach(dateInfo => {
        const mark = row[dateInfo.colIndex];
        if (mark) {
            const markStr = String(mark).toLowerCase().trim();
            if (markStr === 'v' || markStr === 'в' || markStr === '+' || markStr === '1') {
                attendance.push({ date: dateInfo.date, status: 'present' });
            } else if (markStr === 'н' || markStr === 'x' || markStr === '-' || markStr === '0') {
                attendance.push({ date: dateInfo.date, status: 'absent' });
            } else if (markStr === 'б' || markStr === 'e') {
                attendance.push({ date: dateInfo.date, status: 'excused' });
            } else if (markStr === 'о' || markStr === 'l') {
                attendance.push({ date: dateInfo.date, status: 'late' });
            }
        }
    });

    return attendance;
}

// ============================================
// MAIN SHEET PARSING FUNCTION
// ============================================

// Parse attendance data from sheet - detects multiple time slot sections
function parseAttendanceSheet(jsonData) {
    const result = {
        students: [],           // Flat list of all students (for backwards compatibility)
        dates: [],              // All unique dates found
        timeSlot: null,         // First time slot found (for backwards compatibility)
        timeSlotSections: []    // NEW: Array of time slot sections with their students
    };

    if (jsonData.length < 3) return result;

    const nameColumnIndex = 1;
    let currentSection = null;
    let allDates = new Map(); // Track all unique dates by column index

    // First pass: identify all time slot sections and their students
    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];

        // Check if this is a time slot header row
        if (isTimeSlotHeaderRow(row)) {
            // Save previous section if exists
            if (currentSection && currentSection.students.length > 0) {
                result.timeSlotSections.push(currentSection);
            }

            // Extract time slot from this row or previous row
            let timeSlot = extractTimeSlotFromRow(row);

            // If no time slot in this row, check previous row
            if (!timeSlot && i > 0) {
                timeSlot = extractTimeSlotFromRow(jsonData[i - 1]);
            }

            // Extract dates from this header row
            const sectionDates = extractDatesFromRow(row, nameColumnIndex + 1);

            // Add to all dates tracking
            sectionDates.forEach(d => {
                if (!allDates.has(d.colIndex)) {
                    allDates.set(d.colIndex, d);
                }
            });

            // Start new section
            currentSection = {
                timeSlot: timeSlot,
                timeSlotIndex: result.timeSlotSections.length, // Sequential index
                students: [],
                dates: sectionDates,
                headerRowIndex: i
            };

            // Set first time slot for backwards compatibility
            if (!result.timeSlot && timeSlot) {
                result.timeSlot = timeSlot;
            }
        }
        // Check if this is a student row
        else if (currentSection && isStudentRow(row, nameColumnIndex)) {
            const name = row[nameColumnIndex].trim();

            // Parse attendance marks for this student
            const attendance = parseAttendanceMarks(row, currentSection.dates);

            // Only add students with attendance data
            if (attendance.length > 0) {
                const student = {
                    originalName: name,
                    attendance: attendance,
                    timeSlotIndex: currentSection.timeSlotIndex,
                    timeSlot: currentSection.timeSlot
                };

                currentSection.students.push(student);

                // Also add to flat list for backwards compatibility
                result.students.push(student);
            }
        }
    }

    // Push last section
    if (currentSection && currentSection.students.length > 0) {
        result.timeSlotSections.push(currentSection);
    }

    // If no sections were found, fall back to old parsing method
    if (result.timeSlotSections.length === 0) {
        return parseAttendanceSheetLegacy(jsonData);
    }

    // Compile all unique dates
    result.dates = Array.from(allDates.values()).sort((a, b) => a.colIndex - b.colIndex);

    console.log(`Parsed ${result.timeSlotSections.length} time slot sections with ${result.students.length} total students`);

    return result;
}

// Legacy parsing method for backwards compatibility
function parseAttendanceSheetLegacy(jsonData) {
    const result = {
        students: [],
        dates: [],
        timeSlot: null,
        timeSlotSections: []
    };

    if (jsonData.length < 3) return result;

    // Try to find header row with dates
    let headerRowIndex = -1;
    const nameColumnIndex = 1;

    for (let i = 0; i < Math.min(5, jsonData.length); i++) {
        const row = jsonData[i];
        for (let j = 0; j < row.length; j++) {
            const cell = row[j];
            // Check if cell contains a time pattern like "10:00-11:00"
            if (typeof cell === 'string' && /\d{1,2}:\d{2}/.test(cell)) {
                result.timeSlot = cell;
            }
            // Check for Excel serial date numbers (dates appear as numbers > 40000)
            if (typeof cell === 'number' && cell > 40000 && cell < 50000) {
                headerRowIndex = i;
                break;
            }
        }
        if (headerRowIndex !== -1) break;
    }

    if (headerRowIndex === -1) {
        headerRowIndex = 1;
    }

    // Extract dates from header row
    const headerRow = jsonData[headerRowIndex] || [];
    for (let j = nameColumnIndex + 1; j < headerRow.length; j++) {
        const cell = headerRow[j];
        if (typeof cell === 'number' && cell > 40000 && cell < 50000) {
            const jsDate = excelSerialToDate(cell);
            result.dates.push({
                colIndex: j,
                date: jsDate.toISOString().split('T')[0]
            });
        }
    }

    // Extract student names and attendance
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        const name = row[nameColumnIndex];

        if (name && typeof name === 'string' && name.trim()) {
            const student = {
                originalName: name.trim(),
                attendance: [],
                timeSlotIndex: 0,  // Default to first slot
                timeSlot: result.timeSlot
            };

            // Get attendance marks for each date
            student.attendance = parseAttendanceMarks(row, result.dates);

            if (student.attendance.length > 0) {
                result.students.push(student);
            }
        }
    }

    // Create a single section for backwards compatibility
    if (result.students.length > 0) {
        result.timeSlotSections.push({
            timeSlot: result.timeSlot,
            timeSlotIndex: 0,
            students: [...result.students],
            dates: result.dates,
            headerRowIndex: headerRowIndex
        });
    }

    return result;
}

// Convert Excel serial date to JavaScript Date
function excelSerialToDate(serial) {
    // Excel dates start from 1900-01-01 (serial 1)
    // But there's a bug where Excel thinks 1900 was a leap year
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400;
    return new Date(utcValue * 1000);
}

// Match student names from Excel to database
async function matchStudentNames(excelStudents, dbStudents) {
    const matched = [];

    for (const excelStudent of excelStudents) {
        const name = excelStudent.originalName;
        let match = null;
        let confidence = 0;
        let matchType = 'unmatched';

        // 1. Check exact alias match (aliasName is camelCase from supabase-data.js)
        const aliasMatch = attendanceStudentAliases.find(a =>
            a.aliasName.toLowerCase() === name.toLowerCase()
        );
        if (aliasMatch) {
            const student = dbStudents.find(s => s.id === aliasMatch.studentId);
            if (student) {
                match = student;
                confidence = 100;
                matchType = 'alias';
            }
        }

        // 2. Try exact English name match
        if (!match) {
            const exactMatch = dbStudents.find(s =>
                `${s.firstName} ${s.lastName}`.toLowerCase() === name.toLowerCase()
            );
            if (exactMatch) {
                match = exactMatch;
                confidence = 100;
                matchType = 'exact';
            }
        }

        // 3. Try transliteration + fuzzy match
        if (!match) {
            const transliterated = transliterateRussian(name);
            const fuzzyResult = findBestFuzzyMatch(transliterated, dbStudents);
            // Lower threshold to 60% to account for transliteration variations
            if (fuzzyResult && fuzzyResult.confidence >= 60) {
                match = fuzzyResult.student;
                confidence = fuzzyResult.confidence;
                matchType = 'fuzzy';
            }
        }

        matched.push({
            originalName: name,
            match,
            confidence,
            matchType,
            attendance: excelStudent.attendance,
            selectedStudentId: match ? match.id : null,
            // Preserve time slot info from Excel parsing
            timeSlotIndex: excelStudent.timeSlotIndex,
            timeSlot: excelStudent.timeSlot
        });
    }

    return matched;
}

// Transliterate Russian text to Latin
function transliterateRussian(text) {
    return text.split('').map(char => CYRILLIC_TO_LATIN[char] || char).join('');
}

// Calculate Levenshtein distance
function levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j - 1] + 1,
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1
                );
            }
        }
    }

    return dp[m][n];
}

// Find best fuzzy match for a name
// Handles Russian name order (LastName FirstName) vs English (FirstName LastName)
function findBestFuzzyMatch(transliteratedName, students) {
    let bestMatch = null;
    let bestConfidence = 0;

    const nameLower = transliteratedName.toLowerCase().trim();

    // Also try reversed name order (Russian: "Иванов Демьян" → "Demyan Ivanov")
    const nameParts = nameLower.split(/\s+/);
    const nameReversed = nameParts.length >= 2
        ? nameParts.slice(1).join(' ') + ' ' + nameParts[0]
        : nameLower;

    for (const student of students) {
        // Try both "FirstName LastName" and "LastName FirstName" formats
        const fullNameNormal = `${student.firstName} ${student.lastName}`.toLowerCase();
        const fullNameReversed = `${student.lastName} ${student.firstName}`.toLowerCase();

        // Calculate similarity for normal order
        const distanceNormal = levenshteinDistance(nameLower, fullNameNormal);
        const maxLenNormal = Math.max(nameLower.length, fullNameNormal.length);
        const similarityNormal = ((maxLenNormal - distanceNormal) / maxLenNormal) * 100;

        // Calculate similarity for reversed input against normal DB order
        const distanceReversed = levenshteinDistance(nameReversed, fullNameNormal);
        const maxLenReversed = Math.max(nameReversed.length, fullNameNormal.length);
        const similarityReversed = ((maxLenReversed - distanceReversed) / maxLenReversed) * 100;

        // Calculate similarity for normal input against reversed DB order
        const distanceDbReversed = levenshteinDistance(nameLower, fullNameReversed);
        const maxLenDbReversed = Math.max(nameLower.length, fullNameReversed.length);
        const similarityDbReversed = ((maxLenDbReversed - distanceDbReversed) / maxLenDbReversed) * 100;

        // Take the best match from all three comparisons
        const bestSimilarity = Math.max(similarityNormal, similarityReversed, similarityDbReversed);

        if (bestSimilarity > bestConfidence) {
            bestConfidence = bestSimilarity;
            bestMatch = student;
        }
    }

    return bestMatch ? { student: bestMatch, confidence: Math.round(bestConfidence) } : null;
}

// Render name matching table
function renderNameMatchingTable() {
    const tbody = document.getElementById('nameMatchingBody');
    if (!tbody) return;

    const branchName = document.getElementById('importBranchSelect').value;
    const branchStudents = window.students.filter(s => s.branch === branchName);
    const scheduleType = attendanceExcelParsedData?.scheduleType || null;
    // Excel import context: no coach filter, use null to get default time slots
    const timeSlots = getTimeSlotsForBranch(branchName, scheduleType, null);

    tbody.innerHTML = attendanceMatchedNames.map((item, index) => {
        const statusClass = item.matchType === 'unmatched' ? 'unmatched' :
                           item.confidence === 100 ? 'matched' : 'partial';

        const statusBadge = item.matchType === 'alias' ? t('admin.attendance.aliasMatch') :
                           item.matchType === 'exact' ? t('admin.attendance.exactMatch') :
                           item.matchType === 'fuzzy' ? `${item.confidence}% ${t('admin.attendance.match')}` :
                           t('admin.attendance.unmatched');

        // Get time slot display - either from Excel parsing or unknown
        const timeSlotDisplay = item.timeSlot || (item.timeSlotIndex !== undefined ? timeSlots[item.timeSlotIndex] : null);
        const timeSlotBadgeColor = timeSlotDisplay ? '#3b82f6' : '#94a3b8';

        return `
            <tr class="name-matching-row ${statusClass}">
                <td style="padding: 0.75rem;">
                    <strong>${item.originalName}</strong>
                </td>
                <td style="padding: 0.75rem; text-align: center;">
                    <span style="display: inline-block; padding: 0.25rem 0.5rem; background: ${timeSlotBadgeColor}20; color: ${timeSlotBadgeColor}; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 500;">
                        ${timeSlotDisplay || '—'}
                    </span>
                </td>
                <td style="padding: 0.75rem;">
                    <select class="name-match-select" onchange="updateNameMatch(${index}, this.value)">
                        <option value="">${t('admin.attendance.selectStudent')}</option>
                        ${branchStudents.map(s => `
                            <option value="${s.id}" ${item.selectedStudentId === s.id ? 'selected' : ''}>
                                ${s.firstName} ${s.lastName}
                            </option>
                        `).join('')}
                    </select>
                </td>
                <td style="padding: 0.75rem;">
                    <span class="match-status-badge ${statusClass}">${statusBadge}</span>
                </td>
                <td style="padding: 0.75rem;">
                    ${item.selectedStudentId && item.matchType !== 'alias' ? `
                        <button class="btn-icon" onclick="saveNameAlias(${index})" title="${t('admin.attendance.saveAlias')}">
                            <i data-lucide="save" style="width: 16px; height: 16px;"></i>
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    }).join('');

    lucide.createIcons();

    // Update summary with time slot info
    const matchedCount = attendanceMatchedNames.filter(m => m.selectedStudentId).length;
    const unmatchedCount = attendanceMatchedNames.filter(m => !m.selectedStudentId).length;
    const withTimeSlot = attendanceMatchedNames.filter(m => m.timeSlot || m.timeSlotIndex !== undefined).length;

    const summary = document.getElementById('nameMatchingSummary');
    if (summary) {
        let summaryHtml = `
            <span style="color: #10b981;">${matchedCount} ${t('admin.attendance.matched')}</span> |
            <span style="color: #ef4444;">${unmatchedCount} ${t('admin.attendance.unmatched')}</span>
        `;
        if (withTimeSlot > 0) {
            summaryHtml += ` | <span style="color: #3b82f6;">${withTimeSlot} with time slots</span>`;
        }
        summary.innerHTML = summaryHtml;
    }
}

// Update name match selection
function updateNameMatch(index, studentId) {
    if (index >= 0 && index < attendanceMatchedNames.length) {
        attendanceMatchedNames[index].selectedStudentId = studentId || null;
        if (studentId) {
            attendanceMatchedNames[index].matchType = 'manual';
            attendanceMatchedNames[index].confidence = 100;
        } else {
            attendanceMatchedNames[index].matchType = 'unmatched';
            attendanceMatchedNames[index].confidence = 0;
        }
        renderNameMatchingTable();
    }
}

// Save name alias for future imports
async function saveNameAlias(index) {
    const item = attendanceMatchedNames[index];
    if (!item || !item.selectedStudentId) return;

    try {
        if (window.supabaseData && typeof window.supabaseData.addStudentNameAlias === 'function') {
            await window.supabaseData.addStudentNameAlias(item.selectedStudentId, item.originalName);

            // Add to local aliases list (use camelCase to match supabase-data.js format)
            attendanceStudentAliases.push({
                studentId: item.selectedStudentId,
                aliasName: item.originalName
            });

            // Update match type
            item.matchType = 'alias';
            renderNameMatchingTable();

            showToast(t('admin.attendance.aliasSaved'), 'success');
        }
    } catch (error) {
        console.error('Error saving alias:', error);
        showToast(t('admin.attendance.aliasSaveError'), 'error');
    }
}

// Submit attendance import
async function submitAttendanceImport() {
    const matchedStudents = attendanceMatchedNames.filter(m => m.selectedStudentId);

    if (matchedStudents.length === 0) {
        showToast(t('admin.attendance.noMatchedStudents'), 'error');
        return;
    }

    const branchName = document.getElementById('importBranchSelect').value;
    const branchObj = window.branches.find(b => b.name === branchName);
    if (!branchObj) {
        showToast(t('admin.attendance.branchNotFound'), 'error');
        return;
    }

    const nextBtn = document.getElementById('importNextBtn');
    if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.innerHTML = '<i data-lucide="loader" class="spin" style="width: 18px; height: 18px;"></i>';
    }

    try {
        // Prepare records for bulk insert
        const records = [];

        // Track time slot assignments from Excel
        const timeSlotAssignments = new Map(); // studentId -> { timeSlotIndex, timeSlot }

        for (const item of matchedStudents) {
            // Use the student's individual time slot from Excel parsing
            const studentTimeSlot = item.timeSlot || attendanceExcelParsedData.parsedData.timeSlot;

            // Calculate the actual time slot index for this branch (use schedule type for Sat-Sun)
            const timeSlotIndex = item.timeSlotIndex !== undefined
                ? findTimeSlotIndexForBranch(studentTimeSlot, branchName, attendanceExcelParsedData.scheduleType)
                : -1;

            // Store assignment for later application
            if (timeSlotIndex >= 0) {
                timeSlotAssignments.set(item.selectedStudentId, {
                    timeSlotIndex: timeSlotIndex,
                    timeSlot: studentTimeSlot
                });
            }

            for (const att of item.attendance) {
                records.push({
                    studentId: item.selectedStudentId,
                    branchId: branchObj.id,
                    attendanceDate: att.date,
                    scheduleType: attendanceExcelParsedData.scheduleType,
                    timeSlot: studentTimeSlot,
                    status: att.status
                });
            }
        }

        // Bulk upsert attendance records
        if (window.supabaseData && typeof window.supabaseData.bulkUpsertAttendance === 'function') {
            const result = await window.supabaseData.bulkUpsertAttendance(records);

            // Apply time slot assignments to calendar data
            if (timeSlotAssignments.size > 0) {
                await applyTimeSlotAssignmentsFromImport(timeSlotAssignments, branchObj.id);
            }

            showToast(t('admin.attendance.importSuccess', { count: records.length }), 'success');
            closeAttendanceImportModal();

            // Reload attendance data
            attendanceCurrentBranch = branchName;
            loadAttendanceData();
        }

    } catch (error) {
        console.error('Error importing attendance:', error);
        showToast(t('admin.attendance.importError'), 'error');
    } finally {
        if (nextBtn) {
            nextBtn.disabled = false;
            nextBtn.innerHTML = t('admin.attendance.import');
        }
        lucide.createIcons();
    }
}

// Apply time slot assignments from Excel import to students in calendar
async function applyTimeSlotAssignmentsFromImport(assignments, branchId) {
    console.log(`Applying time slot assignments to ${assignments.size} students`);

    // Update local calendar data immediately
    for (const [studentId, slotInfo] of assignments) {
        const student = attendanceCalendarData.find(s => s.id === studentId);
        if (student) {
            student.time_slot_index = slotInfo.timeSlotIndex;
            console.log(`Assigned ${student.first_name} ${student.last_name} to slot ${slotInfo.timeSlotIndex} (${slotInfo.timeSlot})`);
        }
    }

    // Optionally update in database if the students table has time_slot_index column
    // For now, the assignment persists via the attendance records' time_slot field
    // and will be reloaded from there when the calendar is refreshed
}

// Export attendance to Excel
async function exportAttendanceExcel() {
    if (!attendanceCurrentBranch) {
        showToast(t('admin.attendance.selectBranchError'), 'error');
        return;
    }

    const branchObj = window.branches.find(b => b.name === attendanceCurrentBranch);
    if (!branchObj) return;

    try {
        // Create workbook
        const wb = XLSX.utils.book_new();

        // Get days in month
        const daysInMonth = new Date(attendanceCurrentYear, attendanceCurrentMonth + 1, 0).getDate();

        // Create header row
        const headers = [t('admin.table.student')];
        for (let day = 1; day <= daysInMonth; day++) {
            headers.push(day.toString());
        }
        headers.push('%');

        // Create data rows
        const data = [headers];

        attendanceCalendarData.forEach(student => {
            const row = [`${student.first_name} ${student.last_name}`];
            let presentCount = 0;
            let totalDays = 0;

            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${attendanceCurrentYear}-${String(attendanceCurrentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const attendance = student.attendance.find(a => a.attendance_date === dateStr);

                if (attendance) {
                    totalDays++;
                    switch (attendance.status) {
                        case 'present':
                            row.push('V');
                            presentCount++;
                            break;
                        case 'absent':
                            row.push('X');
                            break;
                        case 'late':
                            row.push('L');
                            presentCount += 0.5;
                            break;
                        case 'excused':
                            row.push('E');
                            break;
                        default:
                            row.push('');
                    }
                } else {
                    row.push('');
                }
            }

            const rate = totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 0;
            row.push(`${rate}%`);

            data.push(row);
        });

        // Create worksheet
        const ws = XLSX.utils.aoa_to_sheet(data);

        // Add to workbook with schedule name
        const currentLang = (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) ? i18n.getCurrentLanguage() : 'en';
        const scheduleNames = {
            'mon_wed': currentLang === 'ru' ? 'Пн-Ср' : 'Mon-Wed',
            'tue_thu': currentLang === 'ru' ? 'Вт-Чт' : 'Tue-Thu',
            'sat_sun': currentLang === 'ru' ? 'Сб-Вс' : 'Sat-Sun'
        };
        XLSX.utils.book_append_sheet(wb, ws, scheduleNames[attendanceCurrentSchedule]);

        // Generate filename
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const filename = `attendance_${attendanceCurrentBranch}_${monthNames[attendanceCurrentMonth]}_${attendanceCurrentYear}.xlsx`;

        // Download
        XLSX.writeFile(wb, filename);

        showToast(t('admin.attendance.exportSuccess'), 'success');

    } catch (error) {
        console.error('Error exporting attendance:', error);
        showToast(t('admin.attendance.exportError'), 'error');
    }
}

// Handle file drop for attendance import
function setupAttendanceFileDrop() {
    const dropZone = document.getElementById('attendanceDropZone');
    const fileInput = document.getElementById('attendanceFileInput');

    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.endsWith('.xlsx')) {
            fileInput.files = files;
            onAttendanceFileSelect();
        } else {
            showToast(t('admin.attendance.invalidFileType'), 'error');
        }
    });
}

// Handle file selection
async function onAttendanceFileSelect() {
    const fileInput = document.getElementById('attendanceFileInput');
    const fileNameDisplay = document.getElementById('attendanceFileName');
    const nextBtn = document.getElementById('importNextBtn');
    const branchSelect = document.getElementById('importBranchSelect');

    if (fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        if (fileNameDisplay) {
            fileNameDisplay.textContent = file.name;
        }

        // Try to auto-detect branch from filename
        const detectedBranch = extractBranchFromFilename(file.name);
        if (detectedBranch && branchSelect) {
            // Check if the branch exists in the dropdown options
            const branchOption = Array.from(branchSelect.options).find(opt => opt.value === detectedBranch);
            if (branchOption) {
                branchSelect.value = detectedBranch;
                showToast(`Auto-selected branch: ${i18n.translateBranchName(detectedBranch)}`, 'success');
            }
        }

        // Parse the Excel file
        const success = await parseExcelFile(file);

        // Enable Next button only if file is parsed and branch is selected
        if (nextBtn && success && branchSelect && branchSelect.value) {
            nextBtn.disabled = false;
        }
    }
}

// Initialize attendance file drop zone when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setupAttendanceFileDrop();
});

// Close attendance search dropdown when clicking outside
document.addEventListener('click', function(event) {
    if (!attendanceSearchDropdownVisible) return;

    const dropdown = document.getElementById('attendanceSearchDropdown');
    const searchInput = document.getElementById('attendanceStudentSearch');

    // If click is outside dropdown and search input, close dropdown
    if (dropdown && searchInput &&
        !dropdown.contains(event.target) &&
        !searchInput.contains(event.target)) {
        dropdown.style.display = 'none';
        attendanceSearchDropdownVisible = false;
    }
});

// Close attendance search dropdown on Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && attendanceSearchDropdownVisible) {
        const dropdown = document.getElementById('attendanceSearchDropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
        attendanceSearchDropdownVisible = false;

        // Also clear the search input
        const searchInput = document.getElementById('attendanceStudentSearch');
        if (searchInput) {
            searchInput.value = '';
            searchInput.blur();
        }
    }
});

// Initialize attendance month navigation buttons
document.addEventListener('DOMContentLoaded', () => {
    const prevBtn = document.getElementById('attendancePrevMonthBtn');
    const nextBtn = document.getElementById('attendanceNextMonthBtn');

    if (prevBtn) {
        prevBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            navigateMobileCalendar(-1);
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            navigateMobileCalendar(1);
        });
    }

    // Initialize month display
    updateAttendanceMonthDisplay();
});

// ===================================
// ACTIVITY LOG (AUDIT LOG) FUNCTIONS
// ===================================

// Activity log state
// ===================================

/**
 * Show Status History section
 */
function showStatusHistory() {
    showSection('statusHistory');
    loadStatusHistory();
}

/**
 * Load status history with filters
 */
async function loadStatusHistory() {
    try {
        const tbody = document.getElementById('statusHistoryTableBody');
        if (!tbody) return;

        // Show loading state
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i data-lucide="loader" style="width: 24px; height: 24px; margin: 0 auto; animation: spin 1s linear infinite;"></i>
                    <p style="margin-top: 0.5rem;">${i18n.t('common.loading')}</p>
                </td>
            </tr>
        `;

        // Build filters
        const oldStatus = document.getElementById('statusHistoryOldStatusFilter')?.value || '';
        const newStatus = document.getElementById('statusHistoryNewStatusFilter')?.value || '';
        const dateFilter = document.getElementById('statusHistoryDateFilter')?.value || '30d';

        const filters = { limit: 100 };
        if (oldStatus) filters.oldStatus = oldStatus;
        if (newStatus) filters.newStatus = newStatus;

        // Calculate date range
        const now = new Date();
        if (dateFilter === '7d') {
            filters.fromDate = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (dateFilter === '30d') {
            filters.fromDate = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
        } else if (dateFilter === '90d') {
            filters.fromDate = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
        } else if (dateFilter === 'custom') {
            const fromInput = document.getElementById('statusHistoryFromDate');
            const toInput = document.getElementById('statusHistoryToDate');
            if (fromInput?.value && toInput?.value) {
                filters.fromDate = new Date(fromInput.value).toISOString();
                filters.toDate = new Date(toInput.value + 'T23:59:59').toISOString();
            } else {
                filters.fromDate = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
            }
        }

        // Fetch status history
        const entries = await window.supabaseData.getStatusHistory(filters);

        // Render table
        if (entries.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 2rem; color: #94a3b8;">
                        <i data-lucide="inbox" style="width: 48px; height: 48px; margin: 0 auto 1rem;"></i>
                        <p>${i18n.t('admin.statusHistory.noEntries')}</p>
                    </td>
                </tr>
            `;
            lucide.createIcons();
        } else {
            tbody.innerHTML = entries.map(entry => {
                const timestamp = new Date(entry.changedAt).toLocaleString();
                const oldStatusBadge = entry.oldStatus ? getStatusBadge(entry.oldStatus) : getStatusBadge('new');
                const newStatusBadge = getStatusBadge(entry.newStatus);

                return `
                    <tr>
                        <td style="white-space: nowrap;">${timestamp}</td>
                        <td>${entry.studentName}</td>
                        <td>${entry.studentBranch || '—'}</td>
                        <td>${oldStatusBadge}</td>
                        <td>${newStatusBadge}</td>
                        <td>${entry.changedByEmail}</td>
                    </tr>
                `;
            }).join('');
            lucide.createIcons();
        }
    } catch (error) {
        console.error('Error loading status history:', error);
        const tbody = document.getElementById('statusHistoryTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 2rem; color: #dc2626;">
                        <i data-lucide="alert-circle" style="width: 48px; height: 48px; margin: 0 auto 1rem;"></i>
                        <p>${i18n.t('common.error')}: ${error.message}</p>
                    </td>
                </tr>
            `;
            lucide.createIcons();
        }
    }
}

/**
 * Get badge HTML for status
 */
function getStatusBadge(status) {
    const styles = {
        'active': 'background: #dcfce7; color: #15803d;',
        'frozen': 'background: #dbeafe; color: #1e40af;',
        'trial': 'background: #fef3c7; color: #92400e;',
        'left': 'background: #fee2e2; color: #991b1b;',
        'graduated': 'background: #f3e8ff; color: #6b21a8;',
        'inactive': 'background: #f1f5f9; color: #475569;',
        'new': 'background: #e0f2fe; color: #0369a1;'
    };
    const style = styles[status] || '';
    const label = i18n.t(`admin.statuses.${status}`) || status;
    return `<span style="display: inline-flex; align-items: center; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; ${style}">${label}</span>`;
}

/**
 * Refresh status history
 */
function refreshStatusHistory() {
    loadStatusHistory();
}

/**
 * Filter status history
 */
function filterStatusHistory() {
    loadStatusHistory();
}

/**
 * Toggle custom date picker for Status History
 */
function toggleStatusHistoryCustomDates() {
    const select = document.getElementById('statusHistoryDateFilter');
    const picker = document.getElementById('statusHistoryCustomDates');
    if (!select || !picker) return;
    if (select.value === 'custom') {
        picker.style.display = 'block';
        const today = new Date().toISOString().split('T')[0];
        const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
        document.getElementById('statusHistoryFromDate').value = document.getElementById('statusHistoryFromDate').value || monthAgo.toISOString().split('T')[0];
        document.getElementById('statusHistoryToDate').value = document.getElementById('statusHistoryToDate').value || today;
        if (lucide && lucide.createIcons) lucide.createIcons();
    } else {
        picker.style.display = 'none';
        filterStatusHistory();
    }
}

/**
 * Apply custom dates for Status History
 */
function applyStatusHistoryCustomDates() {
    filterStatusHistory();
}

// ===================================
// USER SESSIONS FUNCTIONS
// ===================================

/**
 * Show User Sessions section
 */
function showSessions() {
    showSection('sessions');
    loadSessionUsers(); // Populate user dropdown first
    loadSessions();      // Then load session data
}

/**
 * Load user sessions with filters and stats
 */
async function loadSessions() {
    try {
        const tbody = document.getElementById('sessionsTableBody');
        if (!tbody) return;

        // Show loading state
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i data-lucide="loader" style="width: 24px; height: 24px; margin: 0 auto; animation: spin 1s linear infinite;"></i>
                    <p style="margin-top: 0.5rem;">${i18n.t('common.loading')}</p>
                </td>
            </tr>
        `;

        // Build filters
        const status = document.getElementById('sessionsStatusFilter')?.value || '';
        const deviceType = document.getElementById('sessionsDeviceFilter')?.value || '';
        const userFilter = document.getElementById('sessionsUserFilter')?.value || '';
        const dateFilter = document.getElementById('sessionsDateFilter')?.value || '7d';

        const filters = { limit: 50 };
        if (status) filters.status = status;
        if (deviceType) filters.deviceType = deviceType;
        if (userFilter) filters.userEmail = userFilter;

        // Calculate date range
        const now = new Date();
        if (dateFilter === '24h') {
            filters.fromDate = new Date(now - 24 * 60 * 60 * 1000).toISOString();
        } else if (dateFilter === '7d') {
            filters.fromDate = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (dateFilter === '30d') {
            filters.fromDate = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
        } else if (dateFilter === 'custom') {
            const fromInput = document.getElementById('sessionsFromDate');
            const toInput = document.getElementById('sessionsToDate');
            if (fromInput?.value && toInput?.value) {
                filters.fromDate = new Date(fromInput.value).toISOString();
                filters.toDate = new Date(toInput.value + 'T23:59:59').toISOString();
            } else {
                filters.fromDate = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
            }
        }

        // Fetch sessions and stats in parallel
        const [sessions, stats] = await Promise.all([
            window.supabaseData.getUserSessions(filters),
            window.supabaseData.getSessionStats(filters.fromDate, filters.toDate)
        ]);

        // Update stats cards
        if (stats) {
            document.getElementById('sessionsTotalCount').textContent = stats.totalSessions || 0;
            document.getElementById('sessionsUniqueUsers').textContent = stats.uniqueUsers || 0;
            document.getElementById('sessionsAvgDuration').textContent = stats.avgSessionDurationMinutes ? `${stats.avgSessionDurationMinutes} min` : '—';
            const activeCount = sessions.filter(s => s.status === 'active').length;
            document.getElementById('sessionsActiveCount').textContent = activeCount;
        }

        // Render table
        if (sessions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 2rem; color: #94a3b8;">
                        <i data-lucide="inbox" style="width: 48px; height: 48px; margin: 0 auto 1rem;"></i>
                        <p>${i18n.t('admin.sessions.noSessions')}</p>
                    </td>
                </tr>
            `;
            lucide.createIcons();
        } else {
            tbody.innerHTML = sessions.map(session => {
                const loginTime = new Date(session.loginAt).toLocaleString();
                const duration = session.sessionDurationMinutes ? `${session.sessionDurationMinutes} min` : '—';
                const statusBadge = getSessionStatusBadge(session.status);
                const deviceInfo = `${session.deviceType || '—'}`;
                const browserInfo = session.browser ? `${session.browser} ${session.browserVersion || ''}` : '—';
                const osInfo = session.os ? `${session.os} ${session.osVersion || ''}` : '—';

                return `
                    <tr>
                        <td>${session.userEmail}</td>
                        <td style="white-space: nowrap;">${loginTime}</td>
                        <td>${duration}</td>
                        <td>${deviceInfo}</td>
                        <td>${browserInfo}</td>
                        <td>${osInfo}</td>
                        <td>${statusBadge}</td>
                    </tr>
                `;
            }).join('');
            lucide.createIcons();
        }
    } catch (error) {
        console.error('Error loading sessions:', error);
        const tbody = document.getElementById('sessionsTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 2rem; color: #dc2626;">
                        <i data-lucide="alert-circle" style="width: 48px; height: 48px; margin: 0 auto 1rem;"></i>
                        <p>${i18n.t('common.error')}: ${error.message}</p>
                    </td>
                </tr>
            `;
            lucide.createIcons();
        }
    }
}

/**
 * Populate the user filter dropdown with unique users from sessions
 */
async function loadSessionUsers() {
    try {
        const userSelect = document.getElementById('sessionsUserFilter');
        if (!userSelect) return;

        // Get all sessions (with reasonable date limit to avoid huge queries)
        const sessions = await window.supabaseData.getUserSessions({
            fromDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // Last 90 days
            limit: 1000
        });

        if (!sessions || sessions.length === 0) return;

        // Extract unique user emails
        const uniqueUsers = [...new Set(sessions.map(s => s.userEmail))].sort();

        // Clear existing options except "All Users"
        userSelect.innerHTML = '<option value="">All Users</option>';

        // Add user options
        uniqueUsers.forEach(email => {
            const option = document.createElement('option');
            option.value = email;
            option.textContent = email;
            userSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading session users:', error);
    }
}

/**
 * Get badge HTML for session status
 */
function getSessionStatusBadge(status) {
    const badges = {
        'active': '<span style="display: inline-flex; align-items: center; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; background: #dcfce7; color: #15803d;">Active</span>',
        'logged_out': '<span style="display: inline-flex; align-items: center; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; background: #f1f5f9; color: #475569;">Logged Out</span>',
        'expired': '<span style="display: inline-flex; align-items: center; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; background: #fee2e2; color: #991b1b;">Expired</span>'
    };
    return badges[status] || status;
}

/**
 * Refresh sessions
 */
function refreshSessions() {
    loadSessions();
}

/**
 * Filter sessions
 */
function filterSessions() {
    loadSessions();
}

/**
 * Toggle custom date picker for Sessions
 */
function toggleSessionsCustomDates() {
    const select = document.getElementById('sessionsDateFilter');
    const picker = document.getElementById('sessionsCustomDates');
    if (!select || !picker) return;
    if (select.value === 'custom') {
        picker.style.display = 'block';
        const today = new Date().toISOString().split('T')[0];
        const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
        document.getElementById('sessionsFromDate').value = document.getElementById('sessionsFromDate').value || monthAgo.toISOString().split('T')[0];
        document.getElementById('sessionsToDate').value = document.getElementById('sessionsToDate').value || today;
        if (lucide && lucide.createIcons) lucide.createIcons();
    } else {
        picker.style.display = 'none';
        filterSessions();
    }
}

/**
 * Apply custom dates for Sessions
 */
function applySessionsCustomDates() {
    filterSessions();
}

// ============================================
// USER ACTIVITY ANALYTICS FUNCTIONS
// ============================================

/**
 * Current activity period (day, week, month, 2months, custom)
 */
let currentActivityPeriod = 'day';
let customActivityFromDate = null;
let customActivityToDate = null;

/**
 * Current selected user email
 */
let currentActivityUser = null;

/**
 * Show User Activity section
 */
function showUserActivity() {
    showSection('userActivity');
    loadUserActivityUsers(); // Load users for dropdown
    clearActivityData(); // Clear any previous data
}

/**
 * Clear activity data when no user selected
 */
function clearActivityData() {
    // Clear summary cards
    document.getElementById('lastSessionDate').textContent = '-';
    document.getElementById('lastSessionDuration').textContent = '-';
    document.getElementById('sessions30d').textContent = '0';
    document.getElementById('actions30d').textContent = '0';
    document.getElementById('avgDuration').textContent = '0min';

    // Clear activity stats table
    const statsTableBody = document.getElementById('activityStatsTableBody');
    if (statsTableBody) {
        statsTableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i data-lucide="user-x" style="width: 24px; height: 24px; margin: 0 auto;"></i>
                    <p style="margin-top: 0.5rem;">${i18n.t('admin.userActivity.selectUserFirst')}</p>
                </td>
            </tr>
        `;
    }

    // Clear session history table
    const historyTableBody = document.getElementById('sessionHistoryTableBody');
    if (historyTableBody) {
        historyTableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i data-lucide="user-x" style="width: 24px; height: 24px; margin: 0 auto;"></i>
                    <p style="margin-top: 0.5rem;">${i18n.t('admin.userActivity.selectUserFirst')}</p>
                </td>
            </tr>
        `;
    }
}

/**
 * Load admin and coach users for the dropdown
 */
async function loadUserActivityUsers() {
    try {
        const select = document.getElementById('userActivityUserSelect');
        if (!select) return;

        const currentUserEmail = sessionStorage.getItem('userEmail');
        const userRole = window.supabaseAuth ? window.supabaseAuth.getCurrentUserRole() : null;
        const isAdmin = userRole && userRole.role === 'admin';

        if (isAdmin) {
            // Admins see all users in dropdown
            const users = await supabaseData.getAdminAndCoachUsers();
            select.innerHTML = `<option value="" data-i18n="admin.userActivity.selectUserPlaceholder">Select a user...</option>`;
            users.forEach(user => {
                const displayName = user.role === 'coach'
                    ? `${user.first_name || ''} ${user.last_name || ''} (${user.email})`
                    : `Admin (${user.email})`;
                select.innerHTML += `<option value="${user.email}">${displayName}</option>`;
            });
            select.addEventListener('change', onUserActivityUserChange);
        } else {
            // Coaches only see their own activity - hide dropdown, auto-load
            select.innerHTML = `<option value="${currentUserEmail}">My Activity (${currentUserEmail})</option>`;
            select.disabled = true;
            currentActivityUser = currentUserEmail;
            loadUserActivityData(currentUserEmail);
        }
    } catch (error) {
        console.error('Error loading users for activity:', error);
    }
}

/**
 * Handle user selection change
 */
async function onUserActivityUserChange() {
    const select = document.getElementById('userActivityUserSelect');
    if (!select) return;

    currentActivityUser = select.value;

    if (!currentActivityUser) {
        clearActivityData();
        return;
    }

    // Load all activity data for the selected user
    await Promise.all([
        loadUserSummary(),
        loadUserActivityStats(),
        loadUserSessionHistory()
    ]);
}

/**
 * Load user summary statistics
 */
async function loadUserSummary() {
    if (!currentActivityUser) return;

    try {
        const summary = await supabaseData.getUserSummary(currentActivityUser);
        
        // Update summary cards
        const lastSessionDate = document.getElementById('lastSessionDate');
        const lastSessionDuration = document.getElementById('lastSessionDuration');
        const sessions30d = document.getElementById('sessions30d');
        const actions30d = document.getElementById('actions30d');
        const avgDuration = document.getElementById('avgDuration');

        if (summary && summary.length > 0) {
            const data = summary[0];

            // Last session
            if (data.last_session_date) {
                const date = new Date(data.last_session_date);
                lastSessionDate.textContent = date.toLocaleDateString();
                lastSessionDuration.textContent = data.last_session_duration_minutes 
                    ? `${data.last_session_duration_minutes}min` 
                    : 'Active';
            } else {
                lastSessionDate.textContent = 'Never';
                lastSessionDuration.textContent = '-';
            }

            // 30-day stats
            sessions30d.textContent = data.total_sessions_30d || '0';
            actions30d.textContent = data.total_actions_30d || '0';
            avgDuration.textContent = data.avg_session_duration_30d 
                ? `${data.avg_session_duration_30d}min` 
                : '0min';
        } else {
            // No data
            lastSessionDate.textContent = 'Never';
            lastSessionDuration.textContent = '-';
            sessions30d.textContent = '0';
            actions30d.textContent = '0';
            avgDuration.textContent = '0min';
        }
    } catch (error) {
        console.error('Error loading user summary:', error);
    }
}

/**
 * Load user activity statistics for the current period
 */
async function loadUserActivityStats() {
    if (!currentActivityUser) return;

    try {
        const statsTableBody = document.getElementById('activityStatsTableBody');
        if (!statsTableBody) return;

        // Show loading
        statsTableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i data-lucide="loader" style="width: 24px; height: 24px; margin: 0 auto; animation: spin 1s linear infinite;"></i>
                    <p style="margin-top: 0.5rem;">${i18n.t('common.loading')}</p>
                </td>
            </tr>
        `;

        // Calculate date range based on current period
        const { fromDate, toDate } = getActivityDateRange(currentActivityPeriod);

        // Get activity stats
        const stats = await supabaseData.getUserActivityStats(currentActivityUser, fromDate.toISOString(), toDate.toISOString());

        if (stats && stats.length > 0) {
            statsTableBody.innerHTML = '';
            stats.forEach(stat => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${new Date(stat.activity_date).toLocaleDateString()}</td>
                    <td><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">${stat.session_count}</span></td>
                    <td><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">${stat.crud_create_count}</span></td>
                    <td><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">${stat.crud_update_count}</span></td>
                    <td><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">${stat.crud_delete_count}</span></td>
                    <td><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">${stat.total_actions}</span></td>
                `;
                statsTableBody.appendChild(row);
            });
        } else {
            statsTableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 2rem; color: #94a3b8;">
                        <i data-lucide="calendar-x" style="width: 24px; height: 24px; margin: 0 auto;"></i>
                        <p style="margin-top: 0.5rem;">${i18n.t('admin.userActivity.noActivityData')}</p>
                    </td>
                </tr>
            `;
        }

        // Re-render icons
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    } catch (error) {
        console.error('Error loading activity stats:', error);
        const statsTableBody = document.getElementById('activityStatsTableBody');
        if (statsTableBody) {
            statsTableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 2rem; color: #ef4444;">
                        <i data-lucide="alert-circle" style="width: 24px; height: 24px; margin: 0 auto;"></i>
                        <p style="margin-top: 0.5rem;">Error loading activity data</p>
                    </td>
                </tr>
            `;
        }
    }
}

/**
 * Load user session history
 */
async function loadUserSessionHistory() {
    if (!currentActivityUser) return;

    try {
        const historyTableBody = document.getElementById('sessionHistoryTableBody');
        if (!historyTableBody) return;

        // Show loading
        historyTableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i data-lucide="loader" style="width: 24px; height: 24px; margin: 0 auto; animation: spin 1s linear infinite;"></i>
                    <p style="margin-top: 0.5rem;">${i18n.t('common.loading')}</p>
                </td>
            </tr>
        `;

        // Get recent sessions for this user
        const sessions = await supabaseData.getUserSessions(currentActivityUser);

        if (sessions && sessions.length > 0) {
            historyTableBody.innerHTML = '';
            sessions.forEach(session => {
                const row = document.createElement('tr');
                const loginTime = new Date(session.login_at);
                const duration = session.session_duration_minutes ? `${session.session_duration_minutes}min` : 'Active';
                const device = session.device_type ? `${session.device_type} (${session.browser || 'Unknown'})` : 'Unknown';
                
                row.innerHTML = `
                    <td>${loginTime.toLocaleString()}</td>
                    <td>${duration}</td>
                    <td>${device}</td>
                    <td><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">${session.actions_count || 0}</span></td>
                    <td>
                        <button class="btn btn-sm btn-secondary" onclick="showSessionActions('${session.id}')">
                            <i data-lucide="eye" style="width: 16px; height: 16px;"></i>
                            View Actions
                        </button>
                    </td>
                `;
                historyTableBody.appendChild(row);
            });
        } else {
            // No sessions — show fallback with "View All Actions" button
            historyTableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 2rem; color: #94a3b8;">
                        <i data-lucide="calendar-x" style="width: 24px; height: 24px; margin: 0 auto;"></i>
                        <p style="margin-top: 0.5rem;">No session history found (session tracking starts from first login after Feb 13, 2026)</p>
                        <button class="btn btn-sm btn-secondary" style="margin-top: 0.75rem;" onclick="showAllUserActions()">
                            <i data-lucide="list" style="width: 16px; height: 16px;"></i>
                            View All Actions (from audit log)
                        </button>
                    </td>
                </tr>
            `;
        }

        // Re-render icons
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    } catch (error) {
        console.error('Error loading session history:', error);
    }
}

/**
 * Set activity period filter
 */
function setActivityPeriod(period) {
    // Update active button
    document.querySelectorAll('.period-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.period-btn[data-period="${period}"]`).classList.add('active');
    
    currentActivityPeriod = period;

    // Toggle custom date range picker
    const customPicker = document.getElementById('customDateRange');
    if (customPicker) {
        if (period === 'custom') {
            customPicker.style.display = 'block';
            // Set defaults: 2 months ago to today
            const today = new Date().toISOString().split('T')[0];
            const twoMonthsAgo = new Date();
            twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
            document.getElementById('activityFromDate').value = document.getElementById('activityFromDate').value || twoMonthsAgo.toISOString().split('T')[0];
            document.getElementById('activityToDate').value = document.getElementById('activityToDate').value || today;
            if (lucide && lucide.createIcons) lucide.createIcons();
            return; // Don't reload until Apply is clicked
        } else {
            customPicker.style.display = 'none';
        }
    }

    // Reload activity stats with new period
    if (currentActivityUser) {
        loadUserActivityStats();
    }
}

/**
 * Apply custom date range for user activity
 */
function applyCustomDateRange() {
    const from = document.getElementById('activityFromDate').value;
    const to = document.getElementById('activityToDate').value;
    if (!from || !to) return;
    customActivityFromDate = new Date(from);
    customActivityToDate = new Date(to + 'T23:59:59');
    currentActivityPeriod = 'custom';
    if (currentActivityUser) {
        loadUserActivityStats();
    }
}

/**
 * Get date range for activity period
 */
function getActivityDateRange(period) {
    const now = new Date();
    let fromDate = new Date();

    switch (period) {
        case 'day':
            fromDate.setHours(0, 0, 0, 0);
            break;
        case 'week':
            fromDate.setDate(now.getDate() - 7);
            break;
        case 'month':
            fromDate.setMonth(now.getMonth() - 1);
            break;
        case '2months':
            fromDate.setMonth(now.getMonth() - 2);
            break;
        case 'custom':
            if (customActivityFromDate && customActivityToDate) {
                return { fromDate: customActivityFromDate, toDate: customActivityToDate };
            }
            // Fallback to 2 months
            fromDate.setMonth(now.getMonth() - 2);
            break;
        default:
            fromDate.setDate(now.getDate() - 1);
    }

    return { fromDate, toDate: now };
}

/**
 * Show session actions in modal
 */
async function showSessionActions(sessionId) {
    try {
        const modal = document.getElementById('sessionActionsModal');
        const tableBody = document.getElementById('sessionActionsTableBody');
        
        if (!modal || !tableBody) return;

        // Show modal
        modal.classList.add('active');
        
        // Show loading
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i data-lucide="loader" style="width: 24px; height: 24px; margin: 0 auto; animation: spin 1s linear infinite;"></i>
                    <p style="margin-top: 0.5rem;">${i18n.t('common.loading')}</p>
                </td>
            </tr>
        `;

        // Load session actions
        const actions = await supabaseData.getUserSessionWithActions(sessionId);

        if (actions && actions.length > 0) {
            tableBody.innerHTML = '';
            actions.forEach(action => {
                const row = document.createElement('tr');
                const timestamp = new Date(action.changed_at);
                const change = action.field_name 
                    ? `${action.old_value || ''} → ${action.new_value || ''}`
                    : action.action === 'CREATE' ? 'Created' : action.action === 'DELETE' ? 'Deleted' : '';

                row.innerHTML = `
                    <td>${timestamp.toLocaleString()}</td>
                    <td><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">${action.entity_type}</span></td>
                    <td><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionBadgeClass(action.action)}">${action.action}</span></td>
                    <td>${action.field_name || '-'}</td>
                    <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${change}</td>
                `;
                tableBody.appendChild(row);
            });
        } else {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 2rem; color: #94a3b8;">
                        <i data-lucide="activity" style="width: 24px; height: 24px; margin: 0 auto;"></i>
                        <p style="margin-top: 0.5rem;">No actions recorded for this session</p>
                    </td>
                </tr>
            `;
        }

        // Re-render icons
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    } catch (error) {
        console.error('Error loading session actions:', error);
    }
}

/**
 * Close session actions modal
 */
function closeSessionActionsModal(event) {
    const modal = document.getElementById('sessionActionsModal');
    if (!modal) return;

    // Only close if clicked outside modal content or on close button
    if (!event || event.target === modal || event.target.closest('.modal-close')) {
        modal.classList.remove('active');
    }
}

/**
 * Get CSS class for action badge
 */
function getActionBadgeClass(action) {
    const classes = {
        'CREATE': 'bg-green-100 text-green-800',
        'UPDATE': 'bg-yellow-100 text-yellow-800',
        'DELETE': 'bg-red-100 text-red-800'
    };
    return classes[action] || 'bg-gray-100 text-gray-800';
}

/**
 * Show all actions for a user (fallback when no sessions exist)
 * Uses the current activity period to determine date range
 */
async function showAllUserActions() {
    if (!currentActivityUser) return;
    
    try {
        const modal = document.getElementById('sessionActionsModal');
        const tableBody = document.getElementById('sessionActionsTableBody');
        const modalTitle = document.querySelector('#sessionActionsModal .modal-header h2, #sessionActionsModal h2');
        
        if (!modal || !tableBody) return;

        // Update title to show it's all actions
        if (modalTitle) {
            modalTitle.textContent = `All Actions — ${currentActivityUser}`;
        }

        modal.classList.add('active');
        
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i data-lucide="loader" style="width: 24px; height: 24px; margin: 0 auto; animation: spin 1s linear infinite;"></i>
                    <p style="margin-top: 0.5rem;">Loading...</p>
                </td>
            </tr>
        `;

        // Use current period for date range
        const { fromDate, toDate } = getActivityDateRange(currentActivityPeriod || '2months');

        const { data: actions, error } = await window.supabaseClient
            .rpc('get_user_actions_by_date', {
                p_user_email: currentActivityUser,
                p_from_date: fromDate.toISOString(),
                p_to_date: toDate.toISOString()
            });

        if (error) {
            console.error('Error loading user actions:', error);
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#ef4444;">Error loading actions</td></tr>`;
            return;
        }

        if (actions && actions.length > 0) {
            tableBody.innerHTML = '';
            actions.forEach(action => {
                const row = document.createElement('tr');
                const timestamp = new Date(action.changed_at);
                const change = action.field_name 
                    ? `${action.old_value || ''} → ${action.new_value || ''}`
                    : action.action === 'CREATE' ? 'Created' : action.action === 'DELETE' ? 'Deleted' : '';

                row.innerHTML = `
                    <td>${timestamp.toLocaleString()}</td>
                    <td><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">${action.entity_type}</span></td>
                    <td><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionBadgeClass(action.action)}">${action.action}</span></td>
                    <td>${action.field_name || '-'}</td>
                    <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${change}</td>
                `;
                tableBody.appendChild(row);
            });
        } else {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:#94a3b8;">No actions found in this period</td></tr>`;
        }

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    } catch (error) {
        console.error('Error in showAllUserActions:', error);
    }
}

/**
 * Refresh user activity data
 */
function refreshUserActivity() {
    if (currentActivityUser) {
        onUserActivityUserChange();
    }
}
// ==========================================
// COACH ACTIVITY TRACKER
// ==========================================

let caOffset = 0;
const caLimit = 100;
let caAllEntries = [];
let caCoaches = [];
let caStudentsCache = {};
let caInitialized = false;

function showCoachActivity() {
    showSection('coachActivity');
}

async function initCoachActivity() {
    if (!caInitialized) {
        await loadCaUsers();
        caInitialized = true;
    }
    loadCoachActivity();
}

async function loadCaUsers() {
    try {
        // Fetch all unique changed_by_email values from audit_log
        const { data, error } = await window.supabaseClient
            .from('audit_log')
            .select('changed_by_email');
        if (!error && data) {
            const uniqueEmails = [...new Set(data.map(r => r.changed_by_email).filter(Boolean))].sort();
            // Also load coaches for name resolution
            const { data: coachData } = await window.supabaseClient
                .from('coaches')
                .select('id, first_name, last_name, email');
            caCoaches = coachData || [];

            const sel = document.getElementById('caCoachFilter');
            if (sel) {
                sel.innerHTML = '<option value="all">' + (window.t ? window.t('common.all') : 'All') + '</option>';
                uniqueEmails.forEach(email => {
                    const opt = document.createElement('option');
                    opt.value = email;
                    const coach = caCoaches.find(c => c.email === email);
                    opt.textContent = coach ? `${coach.first_name} ${coach.last_name}` : email;
                    sel.appendChild(opt);
                });
            }
        }
    } catch (e) {
        console.error('Error loading users for activity:', e);
    }
}

function onCaDateFilterChange() {
    const val = document.getElementById('caDateFilter').value;
    const customGroup = document.getElementById('caCustomDateGroup');
    const customToGroup = document.getElementById('caCustomDateToGroup');
    if (val === 'custom') {
        customGroup.style.display = '';
        customToGroup.style.display = '';
    } else {
        customGroup.style.display = 'none';
        customToGroup.style.display = 'none';
    }
    loadCoachActivity();
}

function getCaDateRange() {
    const val = document.getElementById('caDateFilter').value;
    const now = new Date();
    if (val === '1d') {
        const from = new Date(now);
        from.setDate(from.getDate() - 1);
        return { from: from.toISOString(), to: now.toISOString() };
    } else if (val === '7d') {
        const from = new Date(now);
        from.setDate(from.getDate() - 7);
        return { from: from.toISOString(), to: now.toISOString() };
    } else if (val === '30d') {
        const from = new Date(now);
        from.setDate(from.getDate() - 30);
        return { from: from.toISOString(), to: now.toISOString() };
    } else {
        const fromVal = document.getElementById('caDateFrom').value;
        const toVal = document.getElementById('caDateTo').value;
        return {
            from: fromVal ? new Date(fromVal).toISOString() : null,
            to: toVal ? new Date(toVal + 'T23:59:59').toISOString() : null
        };
    }
}

async function loadCoachActivity() {
    caOffset = 0;
    caAllEntries = [];
    await fetchCoachActivityPage();
}

function refreshCoachActivity() {
    loadCoachActivity();
}

async function fetchCoachActivityPage() {
    const tbody = document.getElementById('caTableBody');
    if (caOffset === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#94a3b8;"><i data-lucide="loader" style="width:24px;height:24px;animation:spin 1s linear infinite;"></i></td></tr>';
        lucide.createIcons();
    }

    try {
        const dateRange = getCaDateRange();
        const coachFilter = document.getElementById('caCoachFilter').value;

        // Build query - show all users (unified activity log)
        let query = window.supabaseClient
            .from('audit_log')
            .select('*', { count: 'exact' });

        // User filter
        if (coachFilter !== 'all') {
            query = query.eq('changed_by_email', coachFilter);
        }

        // Entity type filter
        const entityFilter = document.getElementById('caEntityFilter')?.value || 'all';
        if (entityFilter !== 'all') {
            query = query.eq('entity_type', entityFilter);
        }

        // Action type filter
        const actionFilter = document.getElementById('caActionFilter')?.value || 'all';
        if (actionFilter !== 'all') {
            query = query.eq('action', actionFilter);
        }

        if (dateRange.from) query = query.gte('changed_at', dateRange.from);
        if (dateRange.to) query = query.lte('changed_at', dateRange.to);

        query = query.order('changed_at', { ascending: false })
                     .range(caOffset, caOffset + caLimit - 1);

        const { data, error, count } = await query;

        if (error) {
            console.error('Coach activity query error:', error);
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#ef4444;">Error loading data</td></tr>';
            return;
        }

        const entries = data || [];
        caAllEntries = caOffset === 0 ? entries : caAllEntries.concat(entries);

        // Resolve student names
        await resolveStudentNames(entries);

        // Update summary cards
        updateCaSummary(count || 0);

        // Render table
        renderCaTable();

        // Show/hide load more
        const loadMoreBtn = document.getElementById('caLoadMoreBtn');
        const resultInfo = document.getElementById('caResultInfo');
        if (loadMoreBtn) loadMoreBtn.style.display = caAllEntries.length < (count || 0) ? '' : 'none';
        if (resultInfo) resultInfo.textContent = `${caAllEntries.length} / ${count || 0}`;

    } catch (e) {
        console.error('Error loading coach activity:', e);
    }
}

async function resolveStudentNames(entries) {
    // For attendance entries, extract student name from new_value (format: "name | status | date")
    entries.forEach(e => {
        if (e.entity_type === 'attendance' && e.entity_id && !caStudentsCache[e.entity_id]) {
            const val = e.new_value || e.old_value || '';
            if (val.includes('|')) {
                const name = val.split('|')[0].trim();
                if (name) caStudentsCache[e.entity_id] = name;
            }
        }
    });

    // For students entries, look up entity_id in students table
    const studentIds = new Set();
    entries.forEach(e => {
        if (e.entity_type === 'students' && e.entity_id && !caStudentsCache[e.entity_id]) {
            studentIds.add(e.entity_id);
        }
    });
    if (studentIds.size === 0) return;

    try {
        const { data } = await window.supabaseClient
            .from('students')
            .select('id, first_name, last_name')
            .in('id', Array.from(studentIds));
        if (data) {
            data.forEach(s => {
                caStudentsCache[s.id] = `${s.first_name} ${s.last_name}`;
            });
        }
    } catch (e) {
        console.error('Error resolving student names:', e);
    }
}

function updateCaSummary(total) {
    document.getElementById('caTotal').textContent = total;

    // Days active
    const uniqueDays = new Set(caAllEntries.map(e => e.changed_at?.substring(0, 10)));
    document.getElementById('caDaysActive').textContent = uniqueDays.size;

    // Most active coach
    const coachCounts = {};
    caAllEntries.forEach(e => {
        const email = e.changed_by_email;
        if (email) coachCounts[email] = (coachCounts[email] || 0) + 1;
    });
    let mostActive = '-';
    let maxCount = 0;
    for (const [email, count] of Object.entries(coachCounts)) {
        if (count > maxCount) {
            maxCount = count;
            const coach = caCoaches.find(c => c.email === email);
            mostActive = coach ? `${coach.first_name} ${coach.last_name}` : email;
        }
    }
    document.getElementById('caMostActive').textContent = mostActive;
}

function renderCaTable() {
    const tbody = document.getElementById('caTableBody');
    if (caAllEntries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#94a3b8;">' + (window.t ? window.t('admin.coachActivity.noData') : 'No activity found') + '</td></tr>';
        return;
    }

    tbody.innerHTML = caAllEntries.map(e => {
        const dt = e.changed_at ? new Date(e.changed_at).toLocaleString() : '-';
        const coach = caCoaches.find(c => c.email === e.changed_by_email);
        const coachName = coach ? `${coach.first_name} ${coach.last_name}` : (e.changed_by_email || '-');

        // Action badge
        const actionColors = { CREATE: '#16a34a', UPDATE: '#2563eb', DELETE: '#dc2626' };
        const actionBg = { CREATE: '#dcfce7', UPDATE: '#dbeafe', DELETE: '#fee2e2' };
        const action = e.action || '';
        const badge = `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:0.75rem;font-weight:600;color:${actionColors[action] || '#475569'};background:${actionBg[action] || '#f1f5f9'};">${action}</span>`;

        // Entity
        const entity = `${e.entity_type || ''}`;

        // Details
        let details = '';
        if (action === 'UPDATE' && e.field_name) {
            const oldVal = e.old_value || '-';
            const newVal = e.new_value || '-';
            details = `<span style="color:#64748b;font-size:0.8125rem;">${e.field_name}: ${truncate(oldVal, 20)} → ${truncate(newVal, 20)}</span>`;
        } else if (action === 'CREATE') {
            details = `<span style="color:#16a34a;font-size:0.8125rem;">Created ${e.entity_type}</span>`;
        } else if (action === 'DELETE') {
            details = `<span style="color:#dc2626;font-size:0.8125rem;">Deleted ${e.entity_type}</span>`;
        }

        // Student name
        let studentName = '';
        if (e.entity_type === 'students' || e.entity_type === 'attendance') {
            studentName = caStudentsCache[e.entity_id] || e.entity_id || '-';
        }

        return `<tr>
            <td style="white-space:nowrap;font-size:0.8125rem;">${dt}</td>
            <td style="font-weight:500;">${coachName}</td>
            <td>${badge}</td>
            <td style="font-size:0.875rem;">${entity}</td>
            <td>${details}</td>
            <td style="font-size:0.875rem;">${studentName}</td>
        </tr>`;
    }).join('');

    lucide.createIcons();
}

function truncate(str, len) {
    if (!str) return '';
    str = String(str);
    return str.length > len ? str.substring(0, len) + '…' : str;
}

async function loadMoreCoachActivity() {
    caOffset += caLimit;
    await fetchCoachActivityPage();
}

