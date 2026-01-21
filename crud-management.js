// Coaches, Branches, and App Access Management UI Functions

let appAccessInitialized = false;

// ==================== COACHES MANAGEMENT ====================

// Load coaches table
function loadCoaches() {
    // This function should be called to render coaches management view
    const coachesSection = document.getElementById('coachesSection');
    if (!coachesSection) return;

    const tbody = document.getElementById('coachTableBody');
    if (!tbody) return;

    // Safely access global coaches array
    const coachesArray = window.coaches || [];
    const studentsArray = window.students || [];

    if (coachesArray.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 2rem; color: #94a3b8;">
                    <i data-lucide="users" style="width: 48px; height: 48px; margin-bottom: 1rem;"></i>
                    <p style="margin: 0; font-size: 1.1rem; font-weight: 500;">No coaches found</p>
                    <p style="margin: 0.5rem 0 0; font-size: 0.9rem;">Click "Add Coach" to create your first coach</p>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }

    tbody.innerHTML = coachesArray.map(coach => {
        const coachFullName = `${coach.firstName} ${coach.lastName}`;
        const studentCount = studentsArray.filter(s => s.coach === coachFullName).length;

        // Avatar content - show photo if available, otherwise show initials
        const avatarContent = coach.photoUrl
            ? `<img src="${coach.photoUrl}" alt="${coachFullName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
            : `${coach.firstName[0]}${coach.lastName[0]}`;

        return `
            <tr>
                <td>
                    <div class="student-cell clickable-coach" onclick="viewCoachProfile('${coach.id}')" style="cursor: pointer;">
                        <div class="student-avatar coach-table-avatar">${avatarContent}</div>
                        <div class="student-name" style="color: #14b8a6; text-decoration: underline; text-decoration-color: transparent; transition: text-decoration-color 0.2s;">${coachFullName}</div>
                    </div>
                </td>
                <td>${coach.branch}</td>
                <td>${coach.email}</td>
                <td>${coach.phone}</td>
                <td><span class="level-badge">${studentCount}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="icon-button" onclick="viewCoachProfile('${coach.id}')" title="View Coach">
                            <i data-lucide="eye"></i>
                        </button>
                        <button class="icon-button" onclick="editCoach('${coach.id}')" title="Edit Coach">
                            <i data-lucide="edit"></i>
                        </button>
                        <button class="icon-button" onclick="deleteCoachConfirm('${coach.id}')" title="Delete Coach" style="color: #dc2626;">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    lucide.createIcons();
}
// Expose to global scope
window.loadCoaches = loadCoaches;

// View coach profile page
function viewCoachProfile(coachId) {
    if (!coachId) {
        showToast('Coach not found', 'error');
        return;
    }
    localStorage.setItem('selectedCoachId', coachId);
    window.location.href = 'coach.html';
}
// Expose to global scope for onclick handlers
window.viewCoachProfile = viewCoachProfile;

// Open edit coach - navigates to coach profile page with edit mode
function editCoach(coachId) {
    if (!coachId) {
        showToast('Coach not found', 'error');
        return;
    }
    localStorage.setItem('selectedCoachId', coachId);
    localStorage.setItem('openCoachEdit', 'true');
    window.location.href = 'coach.html';
}
// Expose to global scope for onclick handlers
window.editCoach = editCoach;

// Delete coach with confirmation
function deleteCoachConfirm(coachId) {
    console.log('🗑️ deleteCoachConfirm called with ID:', coachId, 'Type:', typeof coachId);
    console.log('📊 Available coaches:', window.coaches);

    // Coach IDs from Supabase are strings (UUIDs), so compare as strings
    const coach = window.coaches.find(c => String(c.id) === String(coachId));
    if (!coach) {
        console.error('❌ Coach not found with ID:', coachId);
        console.error('Available IDs:', window.coaches.map(c => c.id));
        showToast('Coach not found', 'error');
        return;
    }

    const coachName = `${coach.firstName} ${coach.lastName}`;
    const coachStudents = window.students.filter(s => s.coach === coachName);

    let confirmMsg = `Are you sure you want to delete coach "${coachName}"?`;
    if (coachStudents.length > 0) {
        confirmMsg += `\n\nWarning: This coach has ${coachStudents.length} student(s) assigned. These students will need to be reassigned.`;
    }

    if (confirm(confirmMsg)) {
        deleteCoach(coachId);
    }
}
// Expose to global scope for onclick handlers
window.deleteCoachConfirm = deleteCoachConfirm;

// Delete coach
async function deleteCoach(coachId) {
    // Coach IDs from Supabase are strings (UUIDs)
    const index = window.coaches.findIndex(c => String(c.id) === String(coachId));
    if (index === -1) {
        showToast('Coach not found', 'error');
        return;
    }

    // Delete from Supabase using supabaseData wrapper
    if (window.supabaseData) {
        try {
            await window.supabaseData.deleteCoach(coachId);
            // Reload coaches from Supabase
            window.coaches = await window.supabaseData.getCoaches();
            loadCoaches();
            showToast('Coach deleted successfully!', 'success');
        } catch (error) {
            console.error('Error deleting coach:', error);
            showToast('Failed to delete coach. Please try again.', 'error');
        }
    } else {
        // Fallback: remove from local array
        window.coaches.splice(index, 1);
        loadCoaches();
        showToast('Coach deleted successfully!', 'success');
    }
}

// Open add coach modal
function addNewCoach() {
    // Reset form
    document.getElementById('addCoachForm').reset();

    // Populate branch dropdown
    const branchSelect = document.getElementById('coachBranchSelect');
    branchSelect.innerHTML = '<option value="">Select Branch</option>';
    window.branches.forEach(branch => {
        const option = document.createElement('option');
        option.value = branch.id;
        option.textContent = branch.name;
        option.setAttribute('data-branch-name', branch.name);
        branchSelect.appendChild(option);
    });

    // Show modal
    document.getElementById('addCoachModal').classList.add('active');
    lucide.createIcons();
}
// Expose to global scope
window.addNewCoach = addNewCoach;

// NOTE: Supabase operations now use window.supabaseData wrapper
// No need for separate helper functions

// Close add coach modal
function closeAddCoachModal() {
    document.getElementById('addCoachModal').classList.remove('active');
}
window.closeAddCoachModal = closeAddCoachModal;

// Close edit coach modal
function closeEditCoachModal() {
    document.getElementById('editCoachModal').classList.remove('active');
}
window.closeEditCoachModal = closeEditCoachModal;

// Submit add coach form
async function submitAddCoach(event) {
    event.preventDefault();

    const firstName = document.getElementById('coachFirstName').value;
    const lastName = document.getElementById('coachLastName').value;
    const email = document.getElementById('coachEmail').value;
    const phone = document.getElementById('coachPhone').value;
    // Branch IDs from Supabase are strings (UUIDs), keep as string - don't use parseInt!
    const branchId = document.getElementById('coachBranchSelect').value;

    if (!branchId) {
        showToast('Please select a branch', 'error');
        return;
    }

    const newCoach = {
        firstName,
        lastName,
        email,
        phone,
        branchId
    };

    // Add to Supabase using supabaseData wrapper
    if (window.supabaseData) {
        try {
            await window.supabaseData.addCoach(newCoach);
            // Reload coaches from Supabase
            window.coaches = await window.supabaseData.getCoaches();
            loadCoaches();
            closeAddCoachModal();
            showToast('Coach added successfully!', 'success');
        } catch (error) {
            console.error('Error adding coach:', error);
            showToast('Failed to add coach. Please try again.', 'error');
        }
    } else {
        // Fallback: add to local array
        newCoach.id = window.coaches.length > 0 ? Math.max(...window.coaches.map(c => c.id)) + 1 : 1;
        window.coaches.push(newCoach);
        loadCoaches();
        closeAddCoachModal();
        showToast('Coach added successfully!', 'success');
    }
}
window.submitAddCoach = submitAddCoach;

// Submit edit coach form
async function submitEditCoach(event) {
    event.preventDefault();

    // Coach IDs from Supabase are strings (UUIDs), don't parseInt
    const coachId = document.getElementById('editCoachId').value;
    // Branch IDs from Supabase are strings (UUIDs), keep as string - don't use parseInt!
    const branchId = document.getElementById('editCoachBranchSelect').value;

    if (!branchId) {
        showToast('Please select a branch', 'error');
        return;
    }

    const updatedCoach = {
        firstName: document.getElementById('editCoachFirstName').value,
        lastName: document.getElementById('editCoachLastName').value,
        email: document.getElementById('editCoachEmail').value,
        phone: document.getElementById('editCoachPhone').value,
        branchId: branchId
    };

    // Update in Supabase using supabaseData wrapper
    if (window.supabaseData) {
        try {
            await window.supabaseData.updateCoach(coachId, updatedCoach);
            // Reload coaches from Supabase
            window.coaches = await window.supabaseData.getCoaches();
            loadCoaches();
            closeEditCoachModal();
            showToast('Coach updated successfully!', 'success');
        } catch (error) {
            console.error('Error updating coach:', error);
            showToast('Failed to update coach. Please try again.', 'error');
        }
    } else {
        // Fallback: update local array
        const coach = window.coaches.find(c => String(c.id) === String(coachId));
        if (coach) {
            coach.firstName = updatedCoach.firstName;
            coach.lastName = updatedCoach.lastName;
            coach.email = updatedCoach.email;
            coach.phone = updatedCoach.phone;
            coach.branchId = updatedCoach.branchId;
            loadCoaches();
            closeEditCoachModal();
            showToast('Coach updated successfully!', 'success');
        } else {
            showToast('Coach not found', 'error');
        }
    }
}
window.submitEditCoach = submitEditCoach;

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
        // Use window.coaches to safely access global variable
        const coachCount = (window.coaches && window.coaches.length) || 0;
        const branchCount = (window.branches && window.branches.length) || 0;

        const coachesSectionHTML = `
            <div id="coachesSection" class="content-section active">
                <!-- Header -->
                <div class="header">
                    <h1 class="header-title" data-i18n="admin.coaches.management">Coaches Management</h1>
                    <div class="header-actions">
                        <button class="btn btn-primary" onclick="addNewCoach()">
                            <i data-lucide="plus" style="width: 18px; height: 18px;"></i>
                            <span data-i18n="admin.coaches.addCoach">Add Coach</span>
                        </button>
                    </div>
                </div>

                <!-- Stats -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-header">
                            <div>
                                <div class="stat-value" id="totalCoachesManage">${coachCount}</div>
                                <div class="stat-label" data-i18n="admin.coaches.totalCoaches">Total Coaches</div>
                            </div>
                            <div class="stat-icon amber">
                                <i data-lucide="user-check" style="width: 24px; height: 24px;"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-header">
                            <div>
                                <div class="stat-value" id="totalBranchesCoach">${branchCount}</div>
                                <div class="stat-label" data-i18n="admin.branches.totalBranches">Total Branches</div>
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
                                <th data-i18n="admin.coaches.tableCoach">Coach</th>
                                <th data-i18n="admin.table.branch">Branch</th>
                                <th data-i18n="admin.branch.email">Email</th>
                                <th data-i18n="admin.branch.phone">Phone</th>
                                <th data-i18n="admin.branches.tableStudents">Students</th>
                                <th data-i18n="admin.table.actions">Actions</th>
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

    // Apply translations (moved outside to always apply)
    lucide.createIcons();

    // Apply translations after icons are created
    if (typeof i18n !== 'undefined' && typeof i18n.applyTranslations === 'function') {
        i18n.applyTranslations();
    }

    // Update URL hash for browser history (back button support)
    if (window.location.hash !== '#manageCoaches') {
        history.pushState({ section: 'manageCoaches' }, '', '#manageCoaches');
    }
}
window.showCoachesManagement = showCoachesManagement;

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
                        <button class="icon-button" onclick="editBranch('${branch.id}')" title="Edit Branch">
                            <i data-lucide="edit"></i>
                        </button>
                        <button class="icon-button" onclick="deleteBranchConfirm('${branch.id}')" title="Delete Branch" style="color: #dc2626;">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    lucide.createIcons();
}

// View branch details
function viewBranch(branchName) {
    // Redirect to branch.html page
    window.location.href = `branch.html?branch=${encodeURIComponent(branchName)}`;
}

// Open edit branch modal
function editBranch(branchId) {
    console.log('🔧 editBranch called with ID:', branchId, 'Type:', typeof branchId);
    console.log('📊 Available branches:', window.branches);

    // Branch IDs from Supabase are strings (UUIDs), so compare as strings
    const branch = branches.find(b => String(b.id) === String(branchId));
    if (!branch) {
        console.error('❌ Branch not found with ID:', branchId);
        console.error('Available IDs:', branches.map(b => b.id));
        showToast('Branch not found', 'error');
        return;
    }
    console.log('✅ Found branch:', branch);

    // Populate form fields
    document.getElementById('editBranchId').value = branch.id;
    document.getElementById('editBranchName').value = branch.name;
    document.getElementById('editBranchLocation').value = branch.location;
    document.getElementById('editBranchEmail').value = branch.email;
    document.getElementById('editBranchPhone').value = branch.phone;

    // Show modal
    document.getElementById('editBranchModal').classList.add('active');
    lucide.createIcons();
}

// Delete branch with confirmation
function deleteBranchConfirm(branchId) {
    console.log('🗑️ deleteBranchConfirm called with ID:', branchId, 'Type:', typeof branchId);

    // Branch IDs from Supabase are strings (UUIDs), so compare as strings
    const branch = branches.find(b => String(b.id) === String(branchId));
    if (!branch) {
        console.error('❌ Branch not found with ID:', branchId);
        showToast('Branch not found', 'error');
        return;
    }

    const branchStudents = students.filter(s => s.branch === branch.name);
    const branchCoaches = coaches.filter(c => c.branch === branch.name);

    let confirmMsg = `Are you sure you want to delete branch "${branch.name}"?`;
    if (branchStudents.length > 0 || branchCoaches.length > 0) {
        confirmMsg += `\n\nWarning: This branch has:`;
        if (branchStudents.length > 0) confirmMsg += `\n- ${branchStudents.length} student(s)`;
        if (branchCoaches.length > 0) confirmMsg += `\n- ${branchCoaches.length} coach(es)`;
        confirmMsg += `\n\nThese will need to be reassigned.`;
    }

    if (confirm(confirmMsg)) {
        deleteBranch(branchId);
    }
}

// Delete branch
function deleteBranch(branchId) {
    console.log('🗑️ deleteBranch called with ID:', branchId);

    // Branch IDs from Supabase are strings (UUIDs), so compare as strings
    const index = branches.findIndex(b => String(b.id) === String(branchId));
    if (index === -1) {
        console.error('❌ Branch not found with ID:', branchId);
        showToast('Branch not found', 'error');
        return;
    }

    // Delete from Supabase if available
    if (window.supabaseClient) {
        deleteBranchFromSupabase(branchId);
    }

    branches.splice(index, 1);
    loadBranches();
    showToast('Branch deleted successfully!', 'success');
}

// Open add branch modal
function addNewBranch() {
    // Reset form
    document.getElementById('addBranchForm').reset();

    // Show modal
    document.getElementById('addBranchModal').classList.add('active');
    lucide.createIcons();
}

// Supabase helper functions for branches
async function updateBranchInSupabase(branch) {
    try {
        const { error } = await window.supabaseClient
            .from('branches')
            .update({
                name: branch.name,
                location: branch.location,
                email: branch.email,
                phone: branch.phone
            })
            .eq('id', branch.id);

        if (error) {
            console.error('Error updating branch in Supabase:', error);
        }
    } catch (error) {
        console.error('Error updating branch:', error);
    }
}

async function deleteBranchFromSupabase(branchId) {
    try {
        const { error } = await window.supabaseClient
            .from('branches')
            .delete()
            .eq('id', branchId);

        if (error) {
            console.error('Error deleting branch from Supabase:', error);
        }
    } catch (error) {
        console.error('Error deleting branch:', error);
    }
}

async function addBranchToSupabase(branch) {
    try {
        const { error } = await window.supabaseClient
            .from('branches')
            .insert({
                name: branch.name,
                location: branch.location,
                email: branch.email,
                phone: branch.phone
            });

        if (error) {
            console.error('Error adding branch to Supabase:', error);
        }
    } catch (error) {
        console.error('Error adding branch:', error);
    }
}

// Close add branch modal
function closeAddBranchModal() {
    document.getElementById('addBranchModal').classList.remove('active');
}

// Close edit branch modal
function closeEditBranchModal() {
    document.getElementById('editBranchModal').classList.remove('active');
}

// Submit add branch form
function submitAddBranch(event) {
    event.preventDefault();

    const name = document.getElementById('branchName').value;
    const location = document.getElementById('branchLocation').value;
    const email = document.getElementById('branchEmail').value;
    const phone = document.getElementById('branchPhone').value;

    const newBranch = {
        id: branches.length > 0 ? Math.max(...branches.map(b => b.id)) + 1 : 1,
        name,
        location,
        email,
        phone
    };

    // Add to Supabase if available
    if (window.supabaseClient) {
        addBranchToSupabase(newBranch);
    }

    branches.push(newBranch);
    loadBranches();
    closeAddBranchModal();
    showToast('Branch added successfully!', 'success');
}

// Submit edit branch form
function submitEditBranch(event) {
    event.preventDefault();

    // Branch IDs from Supabase are strings (UUIDs), keep as string - don't use parseInt!
    const branchId = document.getElementById('editBranchId').value;
    const branch = branches.find(b => String(b.id) === String(branchId));

    if (!branch) {
        console.error('❌ Branch not found with ID:', branchId);
        console.error('Available branches:', branches.map(b => ({ id: b.id, name: b.name })));
        showToast('Branch not found', 'error');
        return;
    }
    console.log('✅ Found branch to update:', branch);

    const oldName = branch.name;
    branch.name = document.getElementById('editBranchName').value;
    branch.location = document.getElementById('editBranchLocation').value;
    branch.email = document.getElementById('editBranchEmail').value;
    branch.phone = document.getElementById('editBranchPhone').value;

    // Update students and coaches if branch name changed
    if (oldName !== branch.name) {
        students.forEach(s => {
            if (s.branch === oldName) s.branch = branch.name;
        });
        coaches.forEach(c => {
            if (c.branch === oldName) c.branch = branch.name;
        });
    }

    // Update in Supabase if available
    if (window.supabaseClient) {
        updateBranchInSupabase(branch);
    }

    loadBranches();
    closeEditBranchModal();

    // Use custom notification if available
    if (typeof window.showNotification === 'function') {
        window.showNotification('admin.modals.branch.editSuccess', 'success');
    } else if (typeof showSuccess === 'function') {
        showSuccess(t ? t('admin.modals.branch.editSuccess') : 'Branch updated successfully!');
    } else {
        showToast(t ? t('admin.modals.branch.editSuccess') : 'Branch updated successfully!', 'success');
    }
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
                    <h1 class="header-title" data-i18n="admin.branches.management">Branches Management</h1>
                    <div class="header-actions">
                        <button class="btn btn-primary" onclick="addNewBranch()">
                            <i data-lucide="plus" style="width: 18px; height: 18px;"></i>
                            <span data-i18n="admin.branches.addBranch">Add Branch</span>
                        </button>
                    </div>
                </div>

                <!-- Stats -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-header">
                            <div>
                                <div class="stat-value" id="totalBranchesManage">${branches.length}</div>
                                <div class="stat-label" data-i18n="admin.branches.totalBranches">Total Branches</div>
                            </div>
                            <div class="stat-icon purple">
                                <i data-lucide="building" style="width: 24px; height: 24px;"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-header">
                            <div>
                                <div class="stat-value" id="totalStudentsBranch">${branches.reduce((total, branch) => total + students.filter(s => s.branch === branch.name).length, 0)}</div>
                                <div class="stat-label" data-i18n="admin.branches.totalStudents">Total Students</div>
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
                                <th data-i18n="admin.table.branch">Branch</th>
                                <th data-i18n="admin.branch.location">Location</th>
                                <th data-i18n="admin.branch.phone">Phone</th>
                                <th data-i18n="admin.branch.email">Email</th>
                                <th data-i18n="admin.branches.tableStudents">Students</th>
                                <th data-i18n="admin.branches.tableCoaches">Coaches</th>
                                <th data-i18n="admin.table.actions">Actions</th>
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

    // Apply translations (moved outside to always apply)
    lucide.createIcons();

    // Apply translations after icons are created
    if (typeof i18n !== 'undefined' && typeof i18n.applyTranslations === 'function') {
        i18n.applyTranslations();
    }

    // Update URL hash for browser history (back button support)
    if (window.location.hash !== '#manageBranches') {
        history.pushState({ section: 'manageBranches' }, '', '#manageBranches');
    }
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
                    <h1 class="header-title" data-i18n="admin.data.management">Data Management</h1>
                </div>

                <!-- Data Management Cards -->
                <div class="stats-grid">
                    <div class="stat-card" style="cursor: pointer;" onclick="exportData()">
                        <div class="stat-header">
                            <div>
                                <div style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;" data-i18n="admin.data.export">Export Data</div>
                                <div class="stat-label" data-i18n="admin.data.exportDesc">Download all data as JSON</div>
                            </div>
                            <div class="stat-icon blue">
                                <i data-lucide="download" style="width: 24px; height: 24px;"></i>
                            </div>
                        </div>
                    </div>

                    <div class="stat-card" style="cursor: pointer;" onclick="importData()">
                        <div class="stat-header">
                            <div>
                                <div style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;" data-i18n="admin.data.import">Import Data</div>
                                <div class="stat-label" data-i18n="admin.data.importDesc">Upload JSON data file</div>
                            </div>
                            <div class="stat-icon green">
                                <i data-lucide="upload" style="width: 24px; height: 24px;"></i>
                            </div>
                        </div>
                    </div>

                    <div class="stat-card" style="cursor: pointer;" onclick="resetData()">
                        <div class="stat-header">
                            <div>
                                <div style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;" data-i18n="admin.data.reset">Reset Data</div>
                                <div class="stat-label" data-i18n="admin.data.resetDesc">Restore default data</div>
                            </div>
                            <div class="stat-icon" style="background: #fee2e2; color: #dc2626;">
                                <i data-lucide="refresh-ccw" style="width: 24px; height: 24px;"></i>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Statistics -->
                <div class="table-card">
                    <h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1.5rem; color: #1e293b;" data-i18n="admin.data.statistics">Current Database Statistics</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem;">
                        <div style="padding: 1.25rem; background: #f8fafc; border-radius: 12px;">
                            <div style="font-size: 2rem; font-weight: 700; color: #3b82f6;">${students.length}</div>
                            <div style="font-size: 0.875rem; color: #64748b; margin-top: 0.25rem;" data-i18n="common.totalStudents">Total Students</div>
                        </div>
                        <div style="padding: 1.25rem; background: #f8fafc; border-radius: 12px;">
                            <div style="font-size: 2rem; font-weight: 700; color: #f59e0b;">${coaches.length}</div>
                            <div style="font-size: 0.875rem; color: #64748b; margin-top: 0.25rem;" data-i18n="common.totalCoaches">Total Coaches</div>
                        </div>
                        <div style="padding: 1.25rem; background: #f8fafc; border-radius: 12px;">
                            <div style="font-size: 2rem; font-weight: 700; color: #8b5cf6;">${branches.length}</div>
                            <div style="font-size: 0.875rem; color: #64748b; margin-top: 0.25rem;" data-i18n="admin.branches.totalBranches">Total Branches</div>
                        </div>
                        <div style="padding: 1.25rem; background: #f8fafc; border-radius: 12px;">
                            <div style="font-size: 2rem; font-weight: 700; color: #10b981;">${students.filter(s => s.status === 'active').length}</div>
                            <div style="font-size: 0.875rem; color: #64748b; margin-top: 0.25rem;" data-i18n="common.activeStudents">Active Students</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        mainContent.insertAdjacentHTML('beforeend', dataSectionHTML);
        dataSection = document.getElementById('dataManagementSection');
    }

    dataSection.classList.add('active');

    // Apply translations (moved outside to always apply)
    lucide.createIcons();

    // Apply translations after icons are created
    if (typeof i18n !== 'undefined' && typeof i18n.applyTranslations === 'function') {
        i18n.applyTranslations();
    }

    // Update URL hash for browser history (back button support)
    if (window.location.hash !== '#manageData') {
        history.pushState({ section: 'manageData' }, '', '#manageData');
    }
}

// ==================== APP ACCESS MANAGEMENT ====================

// Check if current user has permission to manage app access
async function checkAppAccessPermission() {
    try {
        const client = window.supabaseClient;
        if (!client) {
            console.error('Supabase client not available');
            return false;
        }

        // Get current user session
        const { data: { session }, error: sessionError } = await client.auth.getSession();
        if (sessionError || !session || !session.user) {
            console.error('No active session:', sessionError);
            return false;
        }

        // Get user's role and permissions
        const { data: userRole, error: roleError } = await client
            .from('user_roles')
            .select('role, can_manage_app_access')
            .eq('user_id', session.user.id)
            .single();

        if (roleError) {
            console.error('Error fetching user role:', roleError);
            return false;
        }

        // Admin always has access, otherwise check the permission
        if (userRole.role === 'admin') {
            return true;
        }

        return userRole.can_manage_app_access === true;
    } catch (error) {
        console.error('Error checking app access permission:', error);
        return false;
    }
}

async function showAppAccessManagement() {
    // Check if user has permission to access this page
    if (!await checkAppAccessPermission()) {
        showToast('You do not have permission to access this page.', 'error');
        showStudents(); // Redirect to Students page
        return;
    }

    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });

    // Update nav items first
    const navItem = document.querySelector('.nav-item[onclick*="showAppAccessManagement"]');
    if (navItem) {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        navItem.classList.add('active');
    }

    let appAccessSection = document.getElementById('appAccessSection');

    if (!appAccessSection) {
        const mainContent = document.querySelector('.main-content');
        if (!mainContent) {
            console.error('Main content container not found.');
            return;
        }

        const appAccessHTML = `
            <div id="appAccessSection" class="content-section app-access-section">
                <div class="header">
                    <div>
                        <h1 class="header-title" data-i18n="access.header.title">App Access Management</h1>
                        <p class="section-subtitle" data-i18n="access.header.subtitle">Manage user roles and permissions</p>
                    </div>
                </div>

                <div class="table-card app-access-invite">
                    <h2 data-i18n="access.invite.title">Invite New User</h2>
                    <p class="app-access-subtitle" data-i18n="access.invite.description">Send an invitation email to grant access to the system</p>

                    <form id="appAccessInviteForm" class="app-access-form">
                        <div class="app-access-form-group">
                            <label for="appAccessInviteEmail" data-i18n="access.invite.emailLabel">Email Address</label>
                            <input type="email" id="appAccessInviteEmail" class="form-input" placeholder="user@example.com" data-i18n-placeholder="access.invite.emailPlaceholder" required>
                        </div>
                        <button type="submit" id="appAccessInviteButton" class="btn btn-primary app-access-submit">
                            <i data-lucide="send" style="width: 18px; height: 18px;"></i>
                            <span data-i18n="access.invite.sendButton">Send Invite</span>
                        </button>
                    </form>
                    <div id="appAccessInviteMessage" class="app-access-message" hidden></div>
                </div>

                <div class="table-card app-access-users">
                    <h2 data-i18n="access.users.title">User Management</h2>
                    <p class="app-access-subtitle" data-i18n="access.users.description">Manage existing user roles and permissions</p>
                    <div id="appAccessUsersList" class="app-access-users-list">
                        <div class="app-access-empty" data-i18n="access.users.loading">Loading users...</div>
                    </div>
                </div>
            </div>
        `;

        mainContent.insertAdjacentHTML('beforeend', appAccessHTML);
        appAccessSection = document.getElementById('appAccessSection');

        setupAppAccessSection();
    }

    // Show the section
    appAccessSection.classList.add('active');

    // Load data asynchronously
    loadAppAccessData().catch(err => console.error('Error loading app access data:', err));

    lucide.createIcons();

    if (window.i18n && window.i18n.translatePage) {
        window.i18n.translatePage(appAccessSection);
    }

    // Update URL hash for browser history (back button support)
    if (window.location.hash !== '#appAccess') {
        history.pushState({ section: 'appAccess' }, '', '#appAccess');
    }
}

function setupAppAccessSection() {
    if (appAccessInitialized) {
        return;
    }

    const inviteForm = document.getElementById('appAccessInviteForm');
    if (inviteForm) {
        inviteForm.addEventListener('submit', handleAppAccessInviteSubmit);
    }

    appAccessInitialized = true;
}

async function loadAppAccessData() {
    if (window.supabaseClient) {
        await loadSupabaseAppAccessUsers();
    } else {
        loadDemoAppAccessUsers();
    }
}

// DEPRECATED: No longer needed since coach assignment was removed from invitation form
// function populateAppAccessCoachOptions() {
//     const select = document.getElementById('appAccessInviteCoach');
//     if (!select) return;
//
//     const previousValue = select.value;
//     select.innerHTML = '<option value="" data-i18n="access.invite.coachPlaceholder">Select coach...</option>';
//
//     const coachList = Array.isArray(window.coaches) ? window.coaches : [];
//
//     coachList.forEach(coach => {
//         const option = document.createElement('option');
//         option.value = coach.id;
//         option.textContent = `${coach.firstName} ${coach.lastName}`;
//         select.appendChild(option);
//     });
//
//     if (previousValue && select.querySelector(`option[value="${previousValue}"]`)) {
//         select.value = previousValue;
//     }
//
//     if (window.i18n && window.i18n.translatePage) {
//         window.i18n.translatePage(select);
//     }
// }

async function loadSupabaseAppAccessUsers() {
    const client = window.supabaseClient;
    if (!client) return;

    try {
        console.log('Calling get_user_roles_with_emails function...');

        // Use the database function to get user roles with emails
        const { data: userRoles, error } = await client
            .rpc('get_user_roles_with_emails');

        console.log('RPC response:', { data: userRoles, error });

        if (error) {
            console.error('RPC error details:', error);
            throw error;
        }

        if (!userRoles || userRoles.length === 0) {
            console.warn('No users returned from database');
            displayAppAccessUsers([]);
            return;
        }

        // Transform the data to match expected format
        const formattedUsers = userRoles.map(user => ({
            ...user,
            coach: user.coach_first_name && user.coach_last_name
                ? { first_name: user.coach_first_name, last_name: user.coach_last_name }
                : null
        }));

        console.log('Loaded users:', formattedUsers);
        displayAppAccessUsers(formattedUsers);
    } catch (error) {
        console.error('Error loading app access users:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });
        showAppAccessMessage('error', error.message || 'Error loading users.');
        // Don't fall back to demo data - show the error
        displayAppAccessUsers([]);
    }
}

function loadDemoAppAccessUsers() {
    const demoUsers = [
        {
            user_id: '1',
            role: 'admin',
            email: '0xmarblemaster@gmail.com',
            can_view_all_students: true,
            can_edit_students: true,
            can_manage_branches: true,
            can_manage_coaches: true
        },
        {
            user_id: '2',
            role: 'coach',
            email: 'chingis@chessempire.kz',
            coach: { first_name: 'Nurgalimov', last_name: 'Chingis' },
            can_view_all_students: false,
            can_edit_students: true,
            can_manage_branches: false,
            can_manage_coaches: false
        }
    ];

    displayAppAccessUsers(demoUsers);
}

function displayAppAccessUsers(users) {
    const container = document.getElementById('appAccessUsersList');
    if (!container) {
        console.error('Container #appAccessUsersList not found!');
        return;
    }

    if (!users || users.length === 0) {
        container.innerHTML = '<div class="app-access-empty" data-i18n="access.users.empty">No users found</div>';
        if (window.i18n && window.i18n.translatePage) {
            window.i18n.translatePage(container);
        }
        lucide.createIcons();
        return;
    }

    // Check if current user is admin
    const isCurrentUserAdmin = window.supabaseAuth?.isAdmin() || false;

    container.innerHTML = users.map(user => {
        const roleLabel = getAppAccessRoleLabel(user.role);
        const emailText = user.email || (window.t ? window.t('access.users.noEmail') : 'Email not available');
        const adminHint = window.t ? window.t('access.users.adminHint') : 'Administrators have full access to all features';
        const deleteLabel = window.t ? window.t('access.users.deleteUser') : 'Delete User';

        return `
            <div class="app-access-card">
                <div class="app-access-card-header">
                    <div class="app-access-user-info">
                        <div class="app-access-user-avatar">${getAppAccessInitials(user)}</div>
                        <div class="app-access-user-details">
                            <h3>${getAppAccessUserName(user)}</h3>
                            <p>${emailText}</p>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        ${isCurrentUserAdmin ? `
                            <select class="app-access-role-selector"
                                    data-user-id="${user.user_id}"
                                    data-current-role="${user.role}"
                                    onchange="handleRoleChange(this, '${user.user_id}', '${emailText}')">
                                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>${window.t ? window.t('access.roles.admin') : 'Administrator'}</option>
                                <option value="coach" ${user.role === 'coach' ? 'selected' : ''}>${window.t ? window.t('access.roles.coach') : 'Coach'}</option>
                                <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>${window.t ? window.t('access.roles.viewer') : 'Viewer'}</option>
                            </select>
                        ` : `
                            <span class="app-access-role-badge app-access-role-${user.role}">${roleLabel}</span>
                        `}
                        ${isCurrentUserAdmin ? `
                            <button class="app-access-delete-btn"
                                    onclick="deleteAppAccessUser('${user.user_id}', '${emailText}')"
                                    title="${deleteLabel}"
                                    style="background: #dc2626; color: white; border: none; border-radius: 6px; padding: 0.5rem 0.75rem; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; transition: all 0.2s;">
                                <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
                ${user.role !== 'admin'
                    ? `<div class="app-access-permission-grid">
                            ${createAppAccessPermissionToggle(user, 'can_manage_app_access')}
                            ${createAppAccessPermissionToggle(user, 'can_edit_students')}
                            ${createAppAccessPermissionToggle(user, 'can_manage_branches')}
                            ${createAppAccessPermissionToggle(user, 'can_manage_coaches')}
                        </div>`
                    : `<p class="app-access-admin-hint">${adminHint}</p>`
                }
            </div>
        `;
    }).join('');

    if (window.supabaseClient) {
        container.querySelectorAll('.app-access-toggle input').forEach(input => {
            input.addEventListener('change', handleAppAccessPermissionChange);
        });
    }

    lucide.createIcons();

    if (window.i18n && window.i18n.translatePage) {
        window.i18n.translatePage(container);
    }
}

function getAppAccessInitials(user) {
    if (user.coach) {
        return `${user.coach.first_name?.[0] || ''}${user.coach.last_name?.[0] || ''}`.toUpperCase() || '?';
    }
    if (user.email) {
        return user.email[0].toUpperCase();
    }
    return '?';
}

function getAppAccessUserName(user) {
    if (user.coach) {
        return `${user.coach.first_name || ''} ${user.coach.last_name || ''}`.trim();
    }
    if (user.email) {
        return user.email.split('@')[0];
    }
    return window.t ? window.t('access.users.unknownUser') : 'Unknown User';
}

function getAppAccessRoleLabel(role) {
    const keyMap = {
        admin: 'access.roles.admin',
        coach: 'access.roles.coach',
        viewer: 'access.roles.viewer'
    };

    if (window.t && keyMap[role]) {
        return window.t(keyMap[role]);
    }

    const fallback = {
        admin: 'Administrator',
        coach: 'Coach',
        viewer: 'Viewer'
    };

    return fallback[role] || role;
}

function getAppAccessPermissionLabel(permissionKey) {
    const keyMap = {
        can_manage_app_access: 'access.permissions.manageAppAccess',
        can_edit_students: 'access.permissions.editStudents',
        can_manage_branches: 'access.permissions.manageBranches',
        can_manage_coaches: 'access.permissions.manageCoaches'
    };

    if (window.t && keyMap[permissionKey]) {
        return window.t(keyMap[permissionKey]);
    }

    const fallback = {
        can_manage_app_access: 'App Access',
        can_edit_students: 'Edit Students',
        can_manage_branches: 'Manage Branches',
        can_manage_coaches: 'Manage Coaches'
    };

    return fallback[permissionKey] || permissionKey;
}

function createAppAccessPermissionToggle(user, permission) {
    const isChecked = user[permission] ? 'checked' : '';
    const disabled = user.role === 'admin' ? 'disabled' : '';
    const label = getAppAccessPermissionLabel(permission);

    return `
        <div class="app-access-permission-item">
            <div class="app-access-permission-label">
                <i data-lucide="check-circle" style="width: 16px; height: 16px;"></i>
                <span>${label}</span>
            </div>
            <label class="app-access-toggle">
                <input type="checkbox" ${isChecked} ${disabled}
                    data-user-id="${user.user_id}"
                    data-permission="${permission}">
                <span class="app-access-toggle-slider"></span>
            </label>
        </div>
    `;
}

async function handleAppAccessPermissionChange(event) {
    if (!window.supabaseClient) {
        return;
    }

    const input = event.target;
    const userId = input.dataset.userId;
    const permission = input.dataset.permission;
    const newValue = input.checked;

    try {
        const { error } = await window.supabaseClient
            .from('user_roles')
            .update({ [permission]: newValue })
            .eq('user_id', userId);

        if (error) {
            throw error;
        }

        showAppAccessMessage('success', window.t ? window.t('access.permissions.updated') : 'Permission updated successfully.');
    } catch (error) {
        console.error('Error updating permission:', error);
        input.checked = !newValue;
        showAppAccessMessage('error', error.message || 'Error updating permission.');
    }
}

async function deleteAppAccessUser(userId, userEmail) {
    if (!window.supabaseClient) {
        console.error('Supabase client not initialized');
        return;
    }

    // Confirm deletion
    const confirmMessage = window.t
        ? window.t('access.users.confirmDelete', { email: userEmail })
        : `Are you sure you want to delete user ${userEmail}?\n\nThis will:\n- Remove the user from the dashboard\n- Delete the user account from the database\n\nThis action cannot be undone.`;

    if (!confirm(confirmMessage)) {
        return;
    }

    try {
        console.log(`🗑️ Deleting user ${userId} (${userEmail})...`);

        // Step 1: Delete from user_roles table
        const { error: roleError } = await window.supabaseClient
            .from('user_roles')
            .delete()
            .eq('user_id', userId);

        if (roleError) {
            console.error('Error deleting user role:', roleError);
            throw new Error('Failed to delete user role: ' + roleError.message);
        }

        console.log('✅ User role deleted');

        // Step 2: Delete from auth.users using admin API via Edge Function
        // We need to create an Edge Function for this since client can't delete auth users
        const { data, error: deleteError } = await window.supabaseClient.functions.invoke('delete-user', {
            body: { user_id: userId }
        });

        if (deleteError) {
            console.error('Edge Function error:', deleteError);
            throw new Error('Failed to delete user account: ' + deleteError.message);
        }

        if (data?.error) {
            console.error('Delete user error:', data.error);
            throw new Error(data.error);
        }

        console.log('✅ User account deleted');

        // Show success message
        const successMessage = window.t
            ? window.t('access.users.deleteSuccess', { email: userEmail })
            : `User ${userEmail} deleted successfully`;
        showAppAccessMessage('success', successMessage);

        // Reload the users list
        await loadSupabaseAppAccessUsers();

    } catch (error) {
        console.error('❌ Error deleting user:', error);
        const errorMessage = window.t
            ? window.t('access.users.deleteError')
            : 'Failed to delete user. Please try again.';
        showAppAccessMessage('error', errorMessage + ' ' + error.message);
    }
}
window.deleteAppAccessUser = deleteAppAccessUser;

// Handle role change
async function handleRoleChange(selectElement, userId, userEmail) {
    const newRole = selectElement.value;
    const previousRole = selectElement.dataset.currentRole;

    // Confirm the change
    const confirmMessage = window.t
        ? window.t('access.users.confirmRoleChange', { email: userEmail, newRole: getAppAccessRoleLabel(newRole) })
        : `Are you sure you want to change ${userEmail}'s role to ${newRole}?`;

    if (!confirm(confirmMessage)) {
        // Revert selection if cancelled
        selectElement.value = previousRole;
        return;
    }

    try {
        console.log(`🔄 Changing role for user ${userId} from ${previousRole} to ${newRole}...`);

        // Update role in database
        const { error } = await window.supabaseClient
            .from('user_roles')
            .update({ role: newRole })
            .eq('user_id', userId);

        if (error) {
            throw error;
        }

        // Update the data attribute
        selectElement.dataset.currentRole = newRole;

        // Show success message
        const successMessage = window.t
            ? window.t('access.users.roleChangeSuccess', { email: userEmail })
            : `Role updated successfully for ${userEmail}`;
        showAppAccessMessage('success', successMessage);

        console.log('✅ Role updated successfully');

        // Reload users to refresh UI (including permission visibility)
        await loadSupabaseAppAccessUsers();

    } catch (error) {
        console.error('❌ Error updating role:', error);

        // Revert selection on error
        selectElement.value = previousRole;

        const errorMessage = window.t
            ? window.t('access.users.roleChangeError')
            : 'Failed to update role. Please try again.';
        showAppAccessMessage('error', errorMessage + ' ' + error.message);
    }
}
window.handleRoleChange = handleRoleChange;

async function handleAppAccessInviteSubmit(event) {
    event.preventDefault();

    const emailInput = document.getElementById('appAccessInviteEmail');
    const button = document.getElementById('appAccessInviteButton');

    if (!emailInput || !button) {
        return;
    }

    const email = emailInput.value;

    if (!window.supabaseClient) {
        showAppAccessMessage('success', window.t
            ? window.t('access.invite.demoSuccess', { email })
            : `Demo mode: Invitation would be sent to ${email}`);
        event.target.reset();
        return;
    }

    button.disabled = true;
    button.innerHTML = '<div class="spinner"></div><span>Sending...</span>';

    try {
        // Call Supabase Edge Function to send invitation email
        const { data, error } = await window.supabaseClient.functions.invoke('send-invitation', {
            body: { email: email }
        });

        if (error) {
            console.error('Edge Function error:', error);
            throw new Error(error.message || 'Failed to send invitation email');
        }

        if (data.error) {
            console.error('Invitation error:', data.error);
            throw new Error(data.details || data.error);
        }

        console.log('✅ Invitation sent successfully:', data);

        // Show success message with registration URL
        const messageDiv = document.getElementById('appAccessInviteMessage');
        const registrationUrl = data.registration_url || '';
        messageDiv.innerHTML = `
            <div style="margin-bottom: 1rem;">
                <strong style="color: #059669;">✅ Invitation created successfully!</strong>
            </div>
            <div style="font-size: 0.9rem; color: #475569; margin-bottom: 1rem;">
                Invitation created for <strong>${email}</strong>.
            </div>
            ${registrationUrl ? `
            <div style="background: #f8fafc; padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 1rem;">
                <div style="font-size: 0.85rem; color: #64748b; margin-bottom: 0.5rem;">
                    <strong>Registration Link:</strong> (Share this link with the user)
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <input
                        type="text"
                        value="${registrationUrl}"
                        readonly
                        id="registrationUrlInput"
                        style="flex: 1; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem; font-family: monospace; background: white;"
                    />
                    <button
                        onclick="navigator.clipboard.writeText('${registrationUrl}').then(() => { this.textContent = '✓ Copied!'; setTimeout(() => { this.textContent = 'Copy'; }, 2000); })"
                        style="padding: 0.5rem 1rem; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; white-space: nowrap;"
                    >
                        Copy
                    </button>
                </div>
            </div>
            ` : ''}
            <div style="font-size: 0.8rem; color: #94a3b8;">
                Note: Email sending requires SMTP configuration. For now, share the registration link above directly with the user.
            </div>
        `;
        messageDiv.hidden = false;

        event.target.reset();
        await loadSupabaseAppAccessUsers();
    } catch (error) {
        console.error('Error sending invitation:', error);
        showAppAccessMessage('error', error.message || 'Error sending invitation.');
    } finally {
        button.disabled = false;
        button.innerHTML = '<i data-lucide="send" style="width: 18px; height: 18px;"></i><span data-i18n="access.invite.sendButton">Send Invite</span>';
        lucide.createIcons();
        if (window.i18n && window.i18n.translatePage) {
            window.i18n.translatePage(button);
        }
    }
}

function showAppAccessMessage(type, message) {
    const element = document.getElementById('appAccessInviteMessage');
    if (!element) return;

    element.textContent = message;
    element.hidden = false;
    element.classList.remove('app-access-message-success', 'app-access-message-error');
    element.classList.add(type === 'success' ? 'app-access-message-success' : 'app-access-message-error');

    clearTimeout(element._hideTimer);
    element._hideTimer = setTimeout(() => {
        element.hidden = true;
    }, 5000);
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
