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

    // Admins see everything
    if (userRole.role === 'admin') {
        if (menuRatings) menuRatings.style.display = 'flex';
        if (menuAppAccess) menuAppAccess.style.display = 'flex';
        if (menuManageCoaches) menuManageCoaches.style.display = 'flex';
        if (menuManageBranches) menuManageBranches.style.display = 'flex';
        if (menuDataManagement) menuDataManagement.style.display = 'flex';
        if (managementSectionTitle) managementSectionTitle.style.display = 'block';
        return;
    }

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

    // Data management - only for admins
    // Can be extended with specific permission later if needed

    // Show/hide Management section title based on whether user has any management access
    if (managementSectionTitle) {
        managementSectionTitle.style.display = hasAnyManagementAccess ? 'block' : 'none';
    }

    console.log('Menu visibility updated. Has management access:', hasAnyManagementAccess);
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    document.title = t('admin.title');

    // DEBUG: Check Supabase availability
    console.log('🔧 Admin Dashboard Initialization');
    console.log('  window.supabaseClient:', typeof window.supabaseClient);
    console.log('  window.supabaseData:', typeof window.supabaseData);
    console.log('  typeof initializeData:', typeof initializeData);
    console.log('  window.initializeData:', typeof window.initializeData);

    // Wait for data to load from Supabase
    const initFn = (typeof window.initializeData === 'function') ? window.initializeData :
                   (typeof initializeData === 'function') ? initializeData : null;

    if (initFn) {
        console.log('✅ Calling initializeData...');
        await initFn();
        // initializeData() already calls refreshAllUIComponents()
        // which populates dropdowns and loads students
    } else {
        console.error('❌ initializeData not found, using fallback');
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

    // DEBUG: Comprehensive logging to trace the issue
    console.log('📊 loadStatistics() - COMPREHENSIVE DEBUG');
    console.log('  =====================================');
    console.log('  students variable type:', typeof students);
    console.log('  students.length:', students.length);
    console.log('  Is students an array?:', Array.isArray(students));
    console.log('  Total students (calculated):', totalStudents);
    console.log('  Active students:', activeStudents);
    console.log('  =====================================');
    console.log('  coaches.length:', coaches.length);
    console.log('  Total coaches (calculated):', totalCoaches);
    console.log('  =====================================');
    console.log('  branches.length:', branches.length);
    console.log('  uniqueBranches.length:', uniqueBranches.length);
    console.log('  Total branches (calculated):', totalBranches);
    console.log('  Unique branch names:', uniqueBranches);
    console.log('  =====================================');
    console.log('  First 3 students:', students.slice(0, 3).map(s => ({id: s.id, name: `${s.firstName} ${s.lastName}`})));
    console.log('  window.students === students?:', window.students === students);
    console.log('  window.students?.length:', window.students?.length);

    // Update main stats
    const totalStudentsElement = document.getElementById('totalStudents');
    const totalCoachesElement = document.getElementById('totalCoaches');
    const totalBranchesElement = document.getElementById('totalBranches');
    const activeStudentsElement = document.getElementById('activeStudents');

    console.log('  =====================================');
    console.log('📝 DOM Elements Before Update:');
    console.log('  totalStudentsElement exists?:', !!totalStudentsElement);
    console.log('  totalStudentsElement.id:', totalStudentsElement?.id);
    console.log('  totalStudentsElement.textContent (before):', totalStudentsElement?.textContent);
    console.log('  totalCoachesElement.textContent (before):', totalCoachesElement?.textContent);
    console.log('  totalBranchesElement.textContent (before):', totalBranchesElement?.textContent);
    console.log('  activeStudentsElement.textContent (before):', activeStudentsElement?.textContent);

    // Perform the updates
    totalStudentsElement.textContent = totalStudents;
    totalCoachesElement.textContent = totalCoaches;
    totalBranchesElement.textContent = totalBranches;
    activeStudentsElement.textContent = activeStudents;

    console.log('  =====================================');
    console.log('📝 DOM Elements After Update:');
    console.log('  totalStudentsElement.textContent (after):', totalStudentsElement.textContent);
    console.log('  Value set:', totalStudents, 'vs displayed:', totalStudentsElement.textContent);
    console.log('  ARE THEY EQUAL?:', totalStudentsElement.textContent === String(totalStudents));
    console.log('  =====================================');

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
        tbody.innerHTML = filteredStudents.map(student => {
            // Create avatar HTML - use photo if available, otherwise initials
            const avatarHTML = student.photoUrl
                ? `<div class="student-avatar" style="background: none; padding: 0; overflow: hidden;">
                       <img src="${student.photoUrl}" alt="${student.firstName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">
                   </div>`
                : `<div class="student-avatar">${student.firstName[0]}${student.lastName[0]}</div>`;

            return `
            <tr>
                <td>
                    <div class="student-cell">
                        ${avatarHTML}
                        <div class="student-name clickable" onclick="viewStudent('${student.id}')" style="cursor: pointer; color: #d97706;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${student.firstName} ${student.lastName}</div>
                    </div>
                </td>`;
        }).map((rowStart, index) => {
            const student = filteredStudents[index];
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
    }

    // Update result count
    updateResultCount(filteredStudents.length);

    // Only render mobile cards on mobile/tablet devices (performance optimization)
    // Check viewport width to avoid unnecessary rendering on desktop
    if (window.innerWidth <= 768) {
        // Defer mobile cards rendering to next animation frame for better performance
        requestAnimationFrame(() => {
            renderMobileStudentCards(filteredStudents);
            // Initialize icons once after all rendering is complete
            lucide.createIcons();
        });
    } else {
        // On desktop, just initialize icons for the table
        lucide.createIcons();
    }
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
    }
    
    // Update mobile bottom nav active state
    updateMobileBottomNav(section);
    
    // Close mobile menu if open
    closeMobileMenu();
}

// Show branches list view
function showBranchesListView() {
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
}

// Show coaches list view
function showCoachesListView() {
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
            <div style="text-align: center; padding: 3rem; color: #94a3b8;">
                <i data-lucide="users" style="width: 64px; height: 64px; margin-bottom: 1rem;"></i>
                <p style="font-size: 1.25rem; font-weight: 500; margin: 0;">No coaches found</p>
                <p style="font-size: 0.95rem; margin: 0.5rem 0 0;">Coaches data is loading...</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    mobileCoachCards.innerHTML = coachesArray.map(coach => {
        const coachFullName = `${coach.firstName} ${coach.lastName}`;
        const studentCount = studentsArray.filter(s => s.coach === coachFullName).length;

        return `
            <div class="mobile-student-card" onclick="viewCoach('${coachFullName}')">
                <div class="mobile-card-header">
                    <div class="mobile-card-avatar" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
                        ${coach.firstName[0]}${coach.lastName[0]}
                    </div>
                    <div class="mobile-card-info">
                        <div class="mobile-card-name">${coachFullName}</div>
                        <div class="mobile-card-meta">${studentCount} students</div>
                    </div>
                </div>

                <div class="mobile-card-details">
                    <div class="mobile-card-detail">
                        <div class="mobile-card-detail-label">Phone</div>
                        <div class="mobile-card-detail-value">${coach.phone || '+7 (700) 123-45-67'}</div>
                    </div>
                    <div class="mobile-card-detail">
                        <div class="mobile-card-detail-label">Email</div>
                        <div class="mobile-card-detail-value">${coach.email || 'coach@chessempire.kz'}</div>
                    </div>
                    <div class="mobile-card-detail">
                        <div class="mobile-card-detail-label">Branch</div>
                        <div class="mobile-card-detail-value">${i18n.translateBranchName(coach.branch || 'Gagarin Park')}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    lucide.createIcons();
}

// Update mobile bottom navigation active state
function updateMobileBottomNav(activeSection) {
    const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
    mobileNavItems.forEach(item => {
        const itemSection = item.getAttribute('data-section');
        if (itemSection === activeSection) {
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

        if (result.success && result.data) {
            // If a photo was selected, upload it now that we have the student ID
            if (window.addPhotoFile) {
                try {
                    const photoUrl = await window.supabaseData.uploadStudentPhoto(window.addPhotoFile, result.data.id);
                    // Update student with photo URL
                    await window.supabaseData.updateStudent(result.data.id, { ...studentData, photoUrl: photoUrl });
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

    // Prepare student data with IDs (Supabase format)
    const studentData = {
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        age: parseInt(formData.get('age')) || null,
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
    branches: 'admin.header.branches',
    settings: 'admin.header.settings'
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
        const currentLang = localStorage.getItem('language') || 'en';
        menu.querySelectorAll('.language-option').forEach(btn => {
            btn.classList.remove('active');
            if ((currentLang === 'en' && btn.textContent.includes('English')) ||
                (currentLang === 'ru' && btn.textContent.includes('Русский'))) {
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

// CSV data storage for import
let csvParsedData = null;

// Show Ratings Management section
function showRatingsManagement() {
    // Switch to ratings section
    switchToSection('ratings');

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
        // Get all students with their current ratings
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

            // Try to get rating from supabase if available
            if (window.supabaseData && typeof window.supabaseData.getCurrentRating === 'function') {
                try {
                    const ratingData = await window.supabaseData.getCurrentRating(student.id);
                    if (ratingData) {
                        currentRating = ratingData.rating;
                        lastUpdated = ratingData.rating_date;

                        // Get league info
                        const leagueInfo = getLeagueFromRating(currentRating);
                        leagueName = leagueInfo.name;
                        leagueTier = leagueInfo.tier;
                    }
                } catch (e) {
                    console.warn('Could not fetch rating for student:', student.id);
                }
            }

            studentsWithRatings.push({
                ...student,
                currentRating,
                lastUpdated,
                leagueName,
                leagueTier
            });

            if (currentRating !== null) {
                ratedCount++;
                totalRating += currentRating;

                // Check if League A or A+
                if (currentRating >= 1200) {
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

    // Sort by rating (highest first), then by name
    const sorted = [...studentsWithRatings].sort((a, b) => {
        if (b.currentRating === null && a.currentRating === null) {
            return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
        }
        if (b.currentRating === null) return -1;
        if (a.currentRating === null) return 1;
        return b.currentRating - a.currentRating;
    });

    tbody.innerHTML = sorted.map(student => {
        const leagueInfo = getLeagueFromRating(student.currentRating);
        const branchName = i18n.translateBranchName(student.branch || '');

        return `
            <tr>
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

    lucide.createIcons();
}

// Format date for display
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString(getCurrentLanguage() === 'ru' ? 'ru-RU' : 'en-US', {
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
        if (window.supabaseData && typeof window.supabaseData.getStudentRatings === 'function') {
            const ratings = await window.supabaseData.getStudentRatings(studentId);

            if (ratings && ratings.length > 0) {
                content.innerHTML = `
                    <div style="max-height: 400px; overflow-y: auto;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #f8fafc;">
                                    <th style="padding: 0.75rem; text-align: left; border-bottom: 1px solid #e2e8f0;">${t('admin.ratings.rating')}</th>
                                    <th style="padding: 0.75rem; text-align: left; border-bottom: 1px solid #e2e8f0;">${t('admin.ratings.league')}</th>
                                    <th style="padding: 0.75rem; text-align: left; border-bottom: 1px solid #e2e8f0;">${t('admin.ratings.date')}</th>
                                    <th style="padding: 0.75rem; text-align: left; border-bottom: 1px solid #e2e8f0;">${t('admin.ratings.source')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${ratings.map(r => {
                                    const leagueInfo = getLeagueFromRating(r.rating);
                                    return `
                                        <tr>
                                            <td style="padding: 0.75rem; border-bottom: 1px solid #f1f5f9; font-weight: 600;">${r.rating}</td>
                                            <td style="padding: 0.75rem; border-bottom: 1px solid #f1f5f9;">
                                                <span style="padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; background: ${leagueInfo.color}20; color: ${leagueInfo.color};">${leagueInfo.name}</span>
                                            </td>
                                            <td style="padding: 0.75rem; border-bottom: 1px solid #f1f5f9; color: #64748b;">${formatDate(r.rating_date)}</td>
                                            <td style="padding: 0.75rem; border-bottom: 1px solid #f1f5f9; color: #94a3b8; font-size: 0.875rem;">${r.source || 'manual'}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            } else {
                content.innerHTML = `<p style="text-align: center; color: #94a3b8; padding: 2rem;">${t('admin.ratings.noHistory')}</p>`;
            }
        } else {
            content.innerHTML = `<p style="text-align: center; color: #94a3b8; padding: 2rem;">${t('admin.ratings.functionNotAvailable')}</p>`;
        }
    } catch (error) {
        console.error('Error loading rating history:', error);
        content.innerHTML = `<p style="text-align: center; color: #ef4444; padding: 2rem;">${t('admin.ratings.loadError')}</p>`;
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

// Preview CSV file
async function previewCSVFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('csvFileName').textContent = file.name;

    try {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());

        if (lines.length < 2) {
            showToast(t('admin.ratings.csvEmpty'), 'error');
            return;
        }

        // Parse header
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

        // Find column indices
        const nameIndex = headers.findIndex(h => h === 'student_name' || h === 'name');
        const firstNameIndex = headers.findIndex(h => h === 'first_name' || h === 'firstname');
        const lastNameIndex = headers.findIndex(h => h === 'last_name' || h === 'lastname');
        const ratingIndex = headers.findIndex(h => h === 'rating');
        const dateIndex = headers.findIndex(h => h === 'date');

        if (ratingIndex === -1) {
            showToast(t('admin.ratings.csvMissingRating'), 'error');
            return;
        }

        if (nameIndex === -1 && (firstNameIndex === -1 || lastNameIndex === -1)) {
            showToast(t('admin.ratings.csvMissingName'), 'error');
            return;
        }

        // Parse data rows
        csvParsedData = [];
        let validCount = 0;
        let warningCount = 0;
        let errorCount = 0;

        const previewRows = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());

            let studentName;
            if (nameIndex !== -1) {
                studentName = values[nameIndex];
            } else {
                studentName = `${values[firstNameIndex]} ${values[lastNameIndex]}`;
            }

            const rating = parseInt(values[ratingIndex]);
            const date = dateIndex !== -1 ? values[dateIndex] : new Date().toISOString().split('T')[0];

            // Find matching student
            const student = window.students.find(s =>
                `${s.firstName} ${s.lastName}`.toLowerCase() === studentName.toLowerCase()
            );

            let status = 'valid';
            let statusText = 'OK';
            let statusColor = '#10b981';

            if (!student) {
                status = 'error';
                statusText = t('admin.ratings.studentNotFound');
                statusColor = '#ef4444';
                errorCount++;
            } else if (isNaN(rating) || rating < 100 || rating > 3000) {
                status = 'error';
                statusText = t('admin.ratings.invalidRating');
                statusColor = '#ef4444';
                errorCount++;
            } else {
                validCount++;
                csvParsedData.push({
                    studentId: student.id,
                    studentName,
                    rating,
                    date
                });
            }

            previewRows.push(`
                <tr>
                    <td style="padding: 0.5rem; border-bottom: 1px solid #f1f5f9;">${studentName}</td>
                    <td style="padding: 0.5rem; border-bottom: 1px solid #f1f5f9;">${rating || '-'}</td>
                    <td style="padding: 0.5rem; border-bottom: 1px solid #f1f5f9;">${date}</td>
                    <td style="padding: 0.5rem; border-bottom: 1px solid #f1f5f9; color: ${statusColor};">${statusText}</td>
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
        console.error('Error parsing CSV:', error);
        showToast(t('admin.ratings.csvParseError'), 'error');
    }
}

// Import CSV ratings
async function importCSVRatings() {
    if (!csvParsedData || csvParsedData.length === 0) {
        showToast(t('admin.ratings.noValidData'), 'error');
        return;
    }

    const importBtn = document.getElementById('importCSVBtn');
    importBtn.disabled = true;
    importBtn.innerHTML = '<i data-lucide="loader" class="spin" style="width: 18px; height: 18px;"></i> Importing...';

    try {
        let successCount = 0;
        let errorCount = 0;

        for (const item of csvParsedData) {
            try {
                if (window.supabaseData && typeof window.supabaseData.addStudentRating === 'function') {
                    await window.supabaseData.addStudentRating(item.studentId, item.rating, item.date, 'csv_import');
                    successCount++;
                }
            } catch (e) {
                console.error('Error importing rating for', item.studentName, e);
                errorCount++;
            }
        }

        showToast(t('admin.ratings.importComplete', { success: successCount, errors: errorCount }), 'success');
        closeCSVImportModal();
        loadRatingsData();

    } catch (error) {
        console.error('Error importing CSV:', error);
        showToast(t('admin.ratings.importError'), 'error');
    } finally {
        importBtn.disabled = false;
        importBtn.innerHTML = `<i data-lucide="upload" style="width: 18px; height: 18px;"></i> ${t('admin.ratings.import')}`;
        lucide.createIcons();
    }
}

