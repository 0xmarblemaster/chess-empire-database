// CRUD Modal Handlers and Event Functions

// ==================== STUDENT MODAL FUNCTIONS ====================

// Open student modal for creating new student
function addNewStudent() {
    document.getElementById('studentModalTitle').textContent = 'Add New Student';
    document.getElementById('studentForm').reset();
    document.getElementById('studentId').value = '';

    // Populate branch dropdown
    const branchSelect = document.getElementById('studentBranch');
    branchSelect.innerHTML = '<option value="">Select branch...</option>';
    branches.forEach(branch => {
        const option = document.createElement('option');
        option.value = branch.name;
        option.textContent = branch.name;
        branchSelect.appendChild(option);
    });

    // Clear coach dropdown
    document.getElementById('studentCoach').innerHTML = '<option value="">Select coach...</option>';

    openModal('studentModal');
}

// Open student modal for editing
function editStudent(studentId) {
    const student = getStudentById(studentId);
    if (!student) {
        showError('Student not found');
        return;
    }

    document.getElementById('studentModalTitle').textContent = 'Edit Student';
    document.getElementById('studentId').value = student.id;
    document.getElementById('studentFirstName').value = student.firstName;
    document.getElementById('studentLastName').value = student.lastName;
    document.getElementById('studentAge').value = student.age;
    document.getElementById('studentStatus').value = student.status;
    document.getElementById('studentLevel').value = student.currentLevel;
    document.getElementById('studentRazryad').value = student.razryad || '';
    document.getElementById('studentLesson').value = student.currentLesson;
    document.getElementById('studentTotalLessons').value = student.totalLessons;

    // Populate branch dropdown
    const branchSelect = document.getElementById('studentBranch');
    branchSelect.innerHTML = '<option value="">Select branch...</option>';
    branches.forEach(branch => {
        const option = document.createElement('option');
        option.value = branch.name;
        option.textContent = branch.name;
        if (branch.name === student.branch) {
            option.selected = true;
        }
        branchSelect.appendChild(option);
    });

    // Populate coach dropdown based on branch
    updateCoachOptions();

    // Set the coach value
    document.getElementById('studentCoach').value = student.coach;

    openModal('studentModal');
}

// Update coach options based on selected branch
function updateCoachOptions() {
    const branchSelect = document.getElementById('studentBranch');
    const coachSelect = document.getElementById('studentCoach');
    const selectedBranch = branchSelect.value;

    coachSelect.innerHTML = '<option value="">Select coach...</option>';

    if (selectedBranch) {
        const branchCoaches = coaches.filter(c => c.branch === selectedBranch);
        branchCoaches.forEach(coach => {
            const option = document.createElement('option');
            const coachName = `${coach.firstName} ${coach.lastName}`;
            option.value = coachName;
            option.textContent = coachName;
            coachSelect.appendChild(option);
        });
    }
}

// Save student (create or update)
function saveStudent(event) {
    event.preventDefault();

    const studentData = {
        firstName: document.getElementById('studentFirstName').value.trim(),
        lastName: document.getElementById('studentLastName').value.trim(),
        age: document.getElementById('studentAge').value,
        branch: document.getElementById('studentBranch').value,
        coach: document.getElementById('studentCoach').value,
        razryad: document.getElementById('studentRazryad').value || null,
        status: document.getElementById('studentStatus').value,
        currentLevel: document.getElementById('studentLevel').value,
        currentLesson: document.getElementById('studentLesson').value,
        totalLessons: document.getElementById('studentTotalLessons').value
    };

    const studentId = document.getElementById('studentId').value;
    let result;

    if (studentId) {
        // Update existing student
        result = updateStudent(studentId, studentData);
    } else {
        // Create new student
        result = createStudent(studentData);
    }

    if (result.success) {
        closeStudentModal();
        loadStudents();
        loadStatistics();
        populateFilterDropdowns();
        showSuccess(studentId ? 'admin.form.editSuccess' : 'admin.form.addSuccess');
    } else {
        showError(result.error);
    }
}

// Close student modal
function closeStudentModal() {
    closeModal('studentModal');
}

// Delete student
async function deleteStudentConfirm(studentId) {
    const student = getStudentById(studentId);
    if (!student) {
        showError('Student not found');
        return;
    }

    showDeleteConfirmation(
        `Are you sure you want to delete student "${student.firstName} ${student.lastName}"?`,
        async () => {
            const result = await deleteStudent(studentId);
            if (result && result.success) {
                loadStudents();
                loadStatistics();
                populateFilterDropdowns();
                showSuccess('admin.form.deleteSuccess');
            } else {
                showError(result ? result.error : 'Failed to delete student');
            }
        }
    );
}

// ==================== COACH MODAL FUNCTIONS ====================

// Open coach modal for creating new coach
function addNewCoach() {
    document.getElementById('coachModalTitle').textContent = 'Add New Coach';
    document.getElementById('coachForm').reset();
    document.getElementById('coachId').value = '';

    // Populate branch dropdown
    const branchSelect = document.getElementById('coachBranch');
    branchSelect.innerHTML = '<option value="">Select branch...</option>';
    branches.forEach(branch => {
        const option = document.createElement('option');
        option.value = branch.name;
        option.textContent = branch.name;
        branchSelect.appendChild(option);
    });

    openModal('coachModal');
}

// Open coach modal for editing
function editCoach(coachId) {
    const coach = getCoachById(coachId);
    if (!coach) {
        showError('Coach not found');
        return;
    }

    document.getElementById('coachModalTitle').textContent = 'Edit Coach';
    document.getElementById('coachId').value = coach.id;
    document.getElementById('coachFirstName').value = coach.firstName;
    document.getElementById('coachLastName').value = coach.lastName;
    document.getElementById('coachEmail').value = coach.email;
    document.getElementById('coachPhone').value = coach.phone;

    // Populate branch dropdown
    const branchSelect = document.getElementById('coachBranch');
    branchSelect.innerHTML = '<option value="">Select branch...</option>';
    branches.forEach(branch => {
        const option = document.createElement('option');
        option.value = branch.name;
        option.textContent = branch.name;
        if (branch.name === coach.branch) {
            option.selected = true;
        }
        branchSelect.appendChild(option);
    });

    openModal('coachModal');
}

// Save coach (create or update)
function saveCoach(event) {
    event.preventDefault();

    const coachData = {
        firstName: document.getElementById('coachFirstName').value.trim(),
        lastName: document.getElementById('coachLastName').value.trim(),
        branch: document.getElementById('coachBranch').value,
        email: document.getElementById('coachEmail').value.trim(),
        phone: document.getElementById('coachPhone').value.trim()
    };

    const coachId = document.getElementById('coachId').value;
    let result;

    if (coachId) {
        // Update existing coach
        result = updateCoach(coachId, coachData);
    } else {
        // Create new coach
        result = createCoach(coachData);
    }

    if (result.success) {
        closeCoachModal();
        // Refresh coach list if we're on coaches view
        if (typeof loadCoaches === 'function') {
            loadCoaches();
        }
        populateCoachDropdown();
        populateFilterDropdowns();
        showSuccess(coachId ? 'admin.modals.coach.editSuccess' : 'admin.modals.coach.addSuccess');
    } else {
        showError(result.error);
    }
}

// Close coach modal
function closeCoachModal() {
    closeModal('coachModal');
}

// Delete coach
function deleteCoachConfirm(coachId) {
    const coach = getCoachById(coachId);
    if (!coach) {
        showError('Coach not found');
        return;
    }

    const coachName = `${coach.firstName} ${coach.lastName}`;
    const studentCount = students.filter(s => s.coach === coachName).length;

    if (studentCount > 0) {
        showError(`Cannot delete coach "${coachName}" with ${studentCount} assigned student(s). Please reassign students first.`);
        return;
    }

    showDeleteConfirmation(
        `Are you sure you want to delete coach "${coachName}"?`,
        () => {
            const result = deleteCoach(coachId);
            if (result.success) {
                if (typeof loadCoaches === 'function') {
                    loadCoaches();
                }
                populateCoachDropdown();
                populateFilterDropdowns();
                showSuccess('admin.modals.coach.deleteSuccess');
            } else {
                showError(result.error);
            }
        }
    );
}

// ==================== BRANCH MODAL FUNCTIONS ====================

// Open branch modal for creating new branch
function addNewBranch() {
    document.getElementById('branchModalTitle').textContent = 'Add New Branch';
    document.getElementById('branchForm').reset();
    document.getElementById('branchId').value = '';
    openModal('branchModal');
}

// Open branch modal for editing
function editBranch(branchId) {
    const branch = getBranchById(branchId);
    if (!branch) {
        showError('Branch not found');
        return;
    }

    document.getElementById('branchModalTitle').textContent = 'Edit Branch';
    document.getElementById('branchId').value = branch.id;
    document.getElementById('branchName').value = branch.name;
    document.getElementById('branchLocation').value = branch.location;
    document.getElementById('branchPhone').value = branch.phone;
    document.getElementById('branchEmail').value = branch.email;

    openModal('branchModal');
}

// Save branch (create or update)
function saveBranch(event) {
    event.preventDefault();

    const branchData = {
        name: document.getElementById('branchName').value.trim(),
        location: document.getElementById('branchLocation').value.trim(),
        phone: document.getElementById('branchPhone').value.trim(),
        email: document.getElementById('branchEmail').value.trim()
    };

    const branchId = document.getElementById('branchId').value;
    let result;

    if (branchId) {
        // Update existing branch
        result = updateBranch(branchId, branchData);
    } else {
        // Create new branch
        result = createBranch(branchData);
    }

    if (result.success) {
        closeBranchModal();
        // Refresh branch list if we're on branches view
        if (typeof loadBranches === 'function') {
            loadBranches();
        }
        populateBranchDropdown();
        populateFilterDropdowns();
        loadStatistics();
        showSuccess(branchId ? 'admin.modals.branch.editSuccess' : 'admin.modals.branch.addSuccess');
    } else {
        showError(result.error);
    }
}

// Close branch modal
function closeBranchModal() {
    closeModal('branchModal');
}

// Delete branch
function deleteBranchConfirm(branchId) {
    const branch = getBranchById(branchId);
    if (!branch) {
        showError('Branch not found');
        return;
    }

    const studentCount = students.filter(s => s.branch === branch.name).length;
    const coachCount = coaches.filter(c => c.branch === branch.name).length;

    if (studentCount > 0 || coachCount > 0) {
        showError(`Cannot delete branch "${branch.name}" with ${studentCount} student(s) and ${coachCount} coach(es). Please reassign them first.`);
        return;
    }

    showDeleteConfirmation(
        `Are you sure you want to delete branch "${branch.name}"?`,
        () => {
            const result = deleteBranch(branchId);
            if (result.success) {
                if (typeof loadBranches === 'function') {
                    loadBranches();
                }
                populateBranchDropdown();
                populateFilterDropdowns();
                loadStatistics();
                showSuccess('admin.modals.branch.deleteSuccess');
            } else {
                showError(result.error);
            }
        }
    );
}

// ==================== MODAL HELPER FUNCTIONS ====================

// Open modal
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Refresh icons
        setTimeout(() => {
            lucide.createIcons();
        }, 50);
    }
}

// Close modal
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Show delete confirmation
function showDeleteConfirmation(message, onConfirm) {
    document.getElementById('deleteMessage').textContent = message;

    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.onclick = function() {
        onConfirm();
        closeDeleteModal();
    };

    openModal('deleteModal');
}

// Close delete modal
function closeDeleteModal() {
    closeModal('deleteModal');
}

// ==================== NOTIFICATION FUNCTIONS ====================

// Show success notification
function showSuccess(message) {
    // Use custom notification modal if available
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, 'success');
        return;
    }

    // Fallback to toast
    const toast = document.getElementById('successToast');
    const messageEl = document.getElementById('successMessage');

    if (toast && messageEl) {
        messageEl.textContent = message;
        toast.classList.add('active');

        setTimeout(() => {
            lucide.createIcons();
        }, 50);

        setTimeout(() => {
            toast.classList.remove('active');
        }, 3000);
    }
}

// Show error notification
function showError(message) {
    // Use custom notification modal if available
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, 'error');
        return;
    }

    // Fallback to toast
    const toast = document.getElementById('errorToast');
    const messageEl = document.getElementById('errorMessage');

    if (toast && messageEl) {
        messageEl.textContent = message;
        toast.classList.add('active');

        setTimeout(() => {
            lucide.createIcons();
        }, 50);

        setTimeout(() => {
            toast.classList.remove('active');
        }, 3000);
    }
}

// ==================== DATA MANAGEMENT FUNCTIONS ====================

// Export all data
function exportData() {
    exportDataAsJSON();
    showSuccess('Data exported successfully!');
}

// Import data
function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = function(e) {
        importDataFromJSON(e.target);
    };
    input.click();
}

// Reset data to defaults
function resetData() {
    resetDataToDefaults();
}

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
        document.body.style.overflow = '';
    }
};

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const activeModals = document.querySelectorAll('.modal.active');
        activeModals.forEach(modal => {
            modal.classList.remove('active');
        });
        document.body.style.overflow = '';
    }
});
