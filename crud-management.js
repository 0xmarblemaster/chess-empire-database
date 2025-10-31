// Coaches and Branches Management UI Functions

// ==================== COACHES MANAGEMENT ====================

// Load coaches table
function loadCoaches() {
    // This function should be called to render coaches management view
    const coachesSection = document.getElementById('coachesSection');
    if (!coachesSection) return;

    const tbody = document.getElementById('coachTableBody');
    if (!tbody) return;

    tbody.innerHTML = coaches.map(coach => {
        const coachFullName = `${coach.firstName} ${coach.lastName}`;
        const studentCount = students.filter(s => s.coach === coachFullName).length;

        return `
            <tr>
                <td>
                    <div class="student-cell">
                        <div class="student-avatar">${coach.firstName[0]}${coach.lastName[0]}</div>
                        <div class="student-name">${coachFullName}</div>
                    </div>
                </td>
                <td>${coach.branch}</td>
                <td>${coach.email}</td>
                <td>${coach.phone}</td>
                <td><span class="level-badge">${studentCount}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="icon-button" onclick="viewCoach('${coachFullName}')" title="View Coach">
                            <i data-lucide="eye"></i>
                        </button>
                        <button class="icon-button" onclick="editCoach(${coach.id})" title="Edit Coach">
                            <i data-lucide="edit"></i>
                        </button>
                        <button class="icon-button" onclick="deleteCoachConfirm(${coach.id})" title="Delete Coach" style="color: #dc2626;">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    lucide.createIcons();
}

// Show coaches management section
function showCoachesManagement() {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });

    // Show coaches section
    let coachesSection = document.getElementById('coachesSection');

    // Create section if it doesn't exist
    if (!coachesSection) {
        const mainContent = document.querySelector('.main-content');
        const coachesSectionHTML = `
            <div id="coachesSection" class="content-section active">
                <!-- Header -->
                <div class="header">
                    <h1 class="header-title">Coaches Management</h1>
                    <div class="header-actions">
                        <button class="btn btn-primary" onclick="addNewCoach()">
                            <i data-lucide="plus" style="width: 18px; height: 18px;"></i>
                            <span>Add Coach</span>
                        </button>
                    </div>
                </div>

                <!-- Stats -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-header">
                            <div>
                                <div class="stat-value" id="totalCoachesManage">${coaches.length}</div>
                                <div class="stat-label">Total Coaches</div>
                            </div>
                            <div class="stat-icon amber">
                                <i data-lucide="user-check" style="width: 24px; height: 24px;"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-header">
                            <div>
                                <div class="stat-value" id="totalBranchesCoach">${branches.length}</div>
                                <div class="stat-label">Total Branches</div>
                            </div>
                            <div class="stat-icon purple">
                                <i data-lucide="building" style="width: 24px; height: 24px;"></i>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Coaches Table -->
                <div class="table-card">
                    <table class="student-table">
                        <thead>
                            <tr>
                                <th>Coach</th>
                                <th>Branch</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Students</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="coachTableBody">
                            <!-- Content will be loaded by JavaScript -->
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        mainContent.insertAdjacentHTML('beforeend', coachesSectionHTML);
        coachesSection = document.getElementById('coachesSection');
    }

    coachesSection.classList.add('active');
    loadCoaches();
    lucide.createIcons();
}

// ==================== BRANCHES MANAGEMENT ====================

// Load branches table
function loadBranches() {
    const branchesSection = document.getElementById('branchesSection');
    if (!branchesSection) return;

    const tbody = document.getElementById('branchTableBody');
    if (!tbody) return;

    tbody.innerHTML = branches.map(branch => {
        const studentCount = students.filter(s => s.branch === branch.name).length;
        const coachCount = coaches.filter(c => c.branch === branch.name).length;

        return `
            <tr>
                <td>
                    <div class="student-cell">
                        <div class="student-avatar" style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);">
                            <i data-lucide="building" style="width: 20px; height: 20px;"></i>
                        </div>
                        <div class="student-name">${branch.name}</div>
                    </div>
                </td>
                <td>${branch.location}</td>
                <td>${branch.phone}</td>
                <td>${branch.email}</td>
                <td><span class="level-badge">${studentCount}</span></td>
                <td><span class="level-badge" style="background: #fef3c7; color: #92400e;">${coachCount}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="icon-button" onclick="viewBranch('${branch.name}')" title="View Branch">
                            <i data-lucide="eye"></i>
                        </button>
                        <button class="icon-button" onclick="editBranch(${branch.id})" title="Edit Branch">
                            <i data-lucide="edit"></i>
                        </button>
                        <button class="icon-button" onclick="deleteBranchConfirm(${branch.id})" title="Delete Branch" style="color: #dc2626;">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    lucide.createIcons();
}

// Show branches management section
function showBranchesManagement() {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });

    // Show branches section
    let branchesSection = document.getElementById('branchesSection');

    // Create section if it doesn't exist
    if (!branchesSection) {
        const mainContent = document.querySelector('.main-content');
        const branchesSectionHTML = `
            <div id="branchesSection" class="content-section active">
                <!-- Header -->
                <div class="header">
                    <h1 class="header-title">Branches Management</h1>
                    <div class="header-actions">
                        <button class="btn btn-primary" onclick="addNewBranch()">
                            <i data-lucide="plus" style="width: 18px; height: 18px;"></i>
                            <span>Add Branch</span>
                        </button>
                    </div>
                </div>

                <!-- Stats -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-header">
                            <div>
                                <div class="stat-value" id="totalBranchesManage">${branches.length}</div>
                                <div class="stat-label">Total Branches</div>
                            </div>
                            <div class="stat-icon purple">
                                <i data-lucide="building" style="width: 24px; height: 24px;"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-header">
                            <div>
                                <div class="stat-value" id="totalStudentsBranch">${students.length}</div>
                                <div class="stat-label">Total Students</div>
                            </div>
                            <div class="stat-icon blue">
                                <i data-lucide="users" style="width: 24px; height: 24px;"></i>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Branches Table -->
                <div class="table-card">
                    <table class="student-table">
                        <thead>
                            <tr>
                                <th>Branch</th>
                                <th>Location</th>
                                <th>Phone</th>
                                <th>Email</th>
                                <th>Students</th>
                                <th>Coaches</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="branchTableBody">
                            <!-- Content will be loaded by JavaScript -->
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        mainContent.insertAdjacentHTML('beforeend', branchesSectionHTML);
        branchesSection = document.getElementById('branchesSection');
    }

    branchesSection.classList.add('active');
    loadBranches();
    lucide.createIcons();
}

// ==================== DATA MANAGEMENT ====================

// Show data management section
function showDataManagement() {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });

    // Show data management section
    let dataSection = document.getElementById('dataManagementSection');

    // Create section if it doesn't exist
    if (!dataSection) {
        const mainContent = document.querySelector('.main-content');
        const dataSectionHTML = `
            <div id="dataManagementSection" class="content-section active">
                <!-- Header -->
                <div class="header">
                    <h1 class="header-title">Data Management</h1>
                </div>

                <!-- Data Management Cards -->
                <div class="stats-grid">
                    <div class="stat-card" style="cursor: pointer;" onclick="exportData()">
                        <div class="stat-header">
                            <div>
                                <div style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">Export Data</div>
                                <div class="stat-label">Download all data as JSON</div>
                            </div>
                            <div class="stat-icon blue">
                                <i data-lucide="download" style="width: 24px; height: 24px;"></i>
                            </div>
                        </div>
                    </div>

                    <div class="stat-card" style="cursor: pointer;" onclick="importData()">
                        <div class="stat-header">
                            <div>
                                <div style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">Import Data</div>
                                <div class="stat-label">Upload JSON data file</div>
                            </div>
                            <div class="stat-icon green">
                                <i data-lucide="upload" style="width: 24px; height: 24px;"></i>
                            </div>
                        </div>
                    </div>

                    <div class="stat-card" style="cursor: pointer;" onclick="resetData()">
                        <div class="stat-header">
                            <div>
                                <div style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">Reset Data</div>
                                <div class="stat-label">Restore default data</div>
                            </div>
                            <div class="stat-icon" style="background: #fee2e2; color: #dc2626;">
                                <i data-lucide="refresh-ccw" style="width: 24px; height: 24px;"></i>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Statistics -->
                <div class="table-card">
                    <h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1.5rem; color: #1e293b;">Current Database Statistics</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem;">
                        <div style="padding: 1.25rem; background: #f8fafc; border-radius: 12px;">
                            <div style="font-size: 2rem; font-weight: 700; color: #3b82f6;">${students.length}</div>
                            <div style="font-size: 0.875rem; color: #64748b; margin-top: 0.25rem;">Total Students</div>
                        </div>
                        <div style="padding: 1.25rem; background: #f8fafc; border-radius: 12px;">
                            <div style="font-size: 2rem; font-weight: 700; color: #f59e0b;">${coaches.length}</div>
                            <div style="font-size: 0.875rem; color: #64748b; margin-top: 0.25rem;">Total Coaches</div>
                        </div>
                        <div style="padding: 1.25rem; background: #f8fafc; border-radius: 12px;">
                            <div style="font-size: 2rem; font-weight: 700; color: #8b5cf6;">${branches.length}</div>
                            <div style="font-size: 0.875rem; color: #64748b; margin-top: 0.25rem;">Total Branches</div>
                        </div>
                        <div style="padding: 1.25rem; background: #f8fafc; border-radius: 12px;">
                            <div style="font-size: 2rem; font-weight: 700; color: #10b981;">${students.filter(s => s.status === 'active').length}</div>
                            <div style="font-size: 0.875rem; color: #64748b; margin-top: 0.25rem;">Active Students</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        mainContent.insertAdjacentHTML('beforeend', dataSectionHTML);
        dataSection = document.getElementById('dataManagementSection');
    }

    dataSection.classList.add('active');
    lucide.createIcons();
}

// Show section (generic function)
function showSection(sectionName) {
    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });

    switch(sectionName) {
        case 'students':
            document.getElementById('studentsSection').classList.add('active');
            document.querySelector('.nav-item[onclick*="students"]').classList.add('active');
            loadStudents();
            break;
        case 'coaches':
            showCoachesManagement();
            break;
        case 'branches':
            showBranchesManagement();
            break;
        case 'data':
            showDataManagement();
            break;
    }

    lucide.createIcons();
}
