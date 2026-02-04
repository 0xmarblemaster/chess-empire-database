// CRUD Operations Module with Supabase Integration
// This module handles Create, Read, Update, Delete operations for students, coaches, and branches
// IMPORTANT: Uses global variables from data.js (students, coaches, branches)

// Helper function to check if Supabase is available
function isSupabaseAvailable() {
    return typeof window !== 'undefined' && window.supabaseClient && window.supabaseData;
}

// Initialize data - load from Supabase or fallback to localStorage
async function initializeData() {
    const useSupabase = isSupabaseAvailable();

    if (useSupabase) {
        await loadDataFromSupabase();
    } else {
        loadDataFromStorage();
    }
}

// Load data from Supabase and update global variables
async function loadDataFromSupabase() {
    try {
        // Fetch data from Supabase IN PARALLEL for faster loading
        const [supabaseStudents, supabaseCoaches, supabaseBranches] = await Promise.all([
            window.supabaseData.getStudents(),
            window.supabaseData.getCoaches(),
            window.supabaseData.getBranches()
        ]);

        // Update global variables directly (defined in data.js)
        // IMPORTANT: Assign to global scope, not window
        students.length = 0;
        students.push(...supabaseStudents);

        coaches.length = 0;
        coaches.push(...supabaseCoaches);

        branches.length = 0;
        branches.push(...supabaseBranches);
        
        // Also set on window for compatibility
        window.students = students;
        window.coaches = coaches;
        window.branches = branches;

        // Trigger UI refresh after data is loaded
        refreshAllUIComponents();

        // Hide loading overlay after data is loaded
        hideLoadingOverlay();
    } catch (error) {
        console.error('❌ Error loading data from Supabase:', error);
        // Fallback to localStorage on error
        loadDataFromStorage();
        // Still hide loading overlay even on error
        hideLoadingOverlay();
    }
}

// Show loading overlay with optional custom message
function showLoadingOverlay(message = null) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.style.opacity = '1';
        overlay.style.transition = 'opacity 0.3s ease';

        // Update message if provided
        if (message) {
            const messageEl = overlay.querySelector('.loading-message, p');
            if (messageEl) {
                messageEl.textContent = message;
            }
        }
    }
}

// Hide loading overlay
function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    }
}

// Refresh all UI components after data loads
function refreshAllUIComponents() {
    // CRITICAL PATH: Load statistics first (shows data to user immediately)
    if (typeof loadStatistics === 'function') {
        loadStatistics();
    }

    // Load students table (main content)
    if (typeof loadStudents === 'function') {
        loadStudents();
    }

    // DEFER non-critical UI updates to allow browser to paint first
    setTimeout(() => {
        // Update coaches count in nav
        const totalCoachesElement = document.getElementById('totalCoaches');
        if (totalCoachesElement) {
            totalCoachesElement.textContent = window.coaches.length;
        }

        // Populate dropdowns (deferred - not visible on initial load)
        if (typeof populateCoachDropdown === 'function') {
            populateCoachDropdown();
        }

        if (typeof populateBranchDropdown === 'function') {
            populateBranchDropdown();
        }

        if (typeof populateFilterDropdowns === 'function') {
            populateFilterDropdowns();
        }

        // Section-specific views only if visible
        if (typeof loadCoaches === 'function') {
            const coachesSection = document.getElementById('coachesSection');
            if (coachesSection && coachesSection.classList.contains('active')) {
                loadCoaches();
                const totalCoachesManage = document.getElementById('totalCoachesManage');
                if (totalCoachesManage) {
                    totalCoachesManage.textContent = window.coaches.length;
                }
            }
        }

        if (typeof refreshCoachesListView === 'function') {
            const coachesListSection = document.getElementById('coachesListSection');
            if (coachesListSection && coachesListSection.classList.contains('active')) {
                refreshCoachesListView();
            }
        }

        if (typeof loadBranches === 'function') {
            const branchesSection = document.getElementById('branchesSection');
            if (branchesSection && branchesSection.classList.contains('active')) {
                loadBranches();
            }
        }

        // Single lucide icons initialization at the end
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }, 0);
}

// Load data from localStorage (fallback)
function loadDataFromStorage() {
    try {
        const storedStudents = localStorage.getItem('students');
        const storedCoaches = localStorage.getItem('coaches');
        const storedBranches = localStorage.getItem('branches');

        // Update arrays in place to maintain reference consistency
        if (storedStudents) {
            const parsedStudents = JSON.parse(storedStudents);
            students.length = 0;
            students.push(...parsedStudents);
            window.students = students;
        }
        if (storedCoaches) {
            const parsedCoaches = JSON.parse(storedCoaches);
            coaches.length = 0;
            coaches.push(...parsedCoaches);
            window.coaches = coaches;
        }
        if (storedBranches) {
            const parsedBranches = JSON.parse(storedBranches);
            branches.length = 0;
            branches.push(...parsedBranches);
            window.branches = branches;
        }
    } catch (error) {
        console.error('Error loading data from localStorage:', error);
    }
}

// Save data to localStorage (fallback only)
function saveDataToStorage() {
    try {
        localStorage.setItem('students', JSON.stringify(window.students));
        localStorage.setItem('coaches', JSON.stringify(window.coaches));
        localStorage.setItem('branches', JSON.stringify(window.branches));
    } catch (error) {
        console.error('Error saving data to localStorage:', error);
    }
}

// Reset data to defaults
function resetDataToDefaults() {
    if (confirm('⚠️ This will reset all data to default values. This action cannot be undone. Continue?')) {
        localStorage.removeItem('students');
        localStorage.removeItem('coaches');
        localStorage.removeItem('branches');
        window.location.reload();
    }
}

// ==================== STUDENT CRUD OPERATIONS ====================

// Create new student
async function createStudent(studentData) {
    try {
        if (isSupabaseAvailable()) {
            // Use Supabase
            const newStudent = await window.supabaseData.addStudent(studentData);
            window.students.push(newStudent);
            return { success: true, student: newStudent };
        } else {
            // Fallback to localStorage
            const maxId = window.students.length > 0 ? Math.max(...window.students.map(s => s.id)) : 0;
            const newStudent = {
                id: maxId + 1,
                firstName: studentData.firstName,
                lastName: studentData.lastName,
                age: parseInt(studentData.age),
                dateOfBirth: studentData.dateOfBirth,
                gender: studentData.gender,
                branch: studentData.branch,
                branchId: studentData.branchId,
                coach: studentData.coach,
                coachId: studentData.coachId,
                razryad: studentData.razryad || null,
                status: studentData.status || 'active',
                currentLevel: parseInt(studentData.currentLevel) || 1,
                currentLesson: parseInt(studentData.currentLesson) || 1,
                totalLessons: parseInt(studentData.totalLessons) || 120,
                parentName: studentData.parentName,
                parentPhone: studentData.parentPhone,
                parentEmail: studentData.parentEmail
            };

            window.students.push(newStudent);
            saveDataToStorage();
            return { success: true, student: newStudent };
        }
    } catch (error) {
        console.error('Error creating student:', error);
        return { success: false, error: error.message };
    }
}

// Read student by ID
function getStudentById(id) {
    // Student IDs from Supabase are strings (UUIDs), so compare as strings
    return window.students.find(s => String(s.id) === String(id));
}

// Update student
async function updateStudent(id, studentData) {
    try {
        if (isSupabaseAvailable()) {
            // Use Supabase
            const updatedStudent = await window.supabaseData.updateStudent(id, studentData);

            // Update local cache
            // Student IDs from Supabase are strings (UUIDs), so compare as strings
            const index = window.students.findIndex(s => String(s.id) === String(id));
            if (index !== -1) {
                window.students[index] = updatedStudent;
            }

            return { success: true, student: updatedStudent };
        } else {
            // Fallback to localStorage
            // Student IDs from Supabase are strings (UUIDs), so compare as strings
            const index = window.students.findIndex(s => String(s.id) === String(id));
            if (index === -1) {
                return { success: false, error: 'Student not found' };
            }

            window.students[index] = {
                ...window.students[index],
                firstName: studentData.firstName,
                lastName: studentData.lastName,
                age: parseInt(studentData.age),
                dateOfBirth: studentData.dateOfBirth,
                gender: studentData.gender,
                branch: studentData.branch,
                branchId: studentData.branchId,
                coach: studentData.coach,
                coachId: studentData.coachId,
                razryad: studentData.razryad || null,
                status: studentData.status,
                currentLevel: parseInt(studentData.currentLevel),
                currentLesson: parseInt(studentData.currentLesson),
                totalLessons: parseInt(studentData.totalLessons),
                parentName: studentData.parentName,
                parentPhone: studentData.parentPhone,
                parentEmail: studentData.parentEmail
            };

            saveDataToStorage();
            return { success: true, student: window.students[index] };
        }
    } catch (error) {
        console.error('Error updating student:', error);
        return { success: false, error: error.message };
    }
}

// Delete student
async function deleteStudent(id) {
    try {
        if (isSupabaseAvailable()) {
            // Use Supabase
            await window.supabaseData.deleteStudent(id);

            // Update local cache
            // Student IDs from Supabase are strings (UUIDs), so compare as strings
            const index = window.students.findIndex(s => String(s.id) === String(id));
            if (index !== -1) {
                const deletedStudent = window.students[index];
                window.students.splice(index, 1);
                return { success: true, student: deletedStudent };
            }

            return { success: true };
        } else {
            // Fallback to localStorage
            // Student IDs from Supabase are strings (UUIDs), so compare as strings
            const index = window.students.findIndex(s => String(s.id) === String(id));
            if (index === -1) {
                return { success: false, error: 'Student not found' };
            }

            const deletedStudent = window.students[index];
            window.students.splice(index, 1);
            saveDataToStorage();
            return { success: true, student: deletedStudent };
        }
    } catch (error) {
        console.error('Error deleting student:', error);
        return { success: false, error: error.message };
    }
}

// ==================== COACH CRUD OPERATIONS ====================

// Create new coach
async function createCoach(coachData) {
    try {
        if (isSupabaseAvailable()) {
            // Use Supabase
            const newCoach = await window.supabaseData.addCoach(coachData);
            window.coaches.push(newCoach);
            console.log('✅ Coach created:', newCoach);
            return { success: true, coach: newCoach };
        } else {
            // Fallback to localStorage
            const maxId = window.coaches.length > 0 ? Math.max(...window.coaches.map(c => c.id)) : 0;
            const newCoach = {
                id: maxId + 1,
                firstName: coachData.firstName,
                lastName: coachData.lastName,
                branch: coachData.branch,
                branchId: coachData.branchId,
                email: coachData.email,
                phone: coachData.phone
            };

            window.coaches.push(newCoach);
            saveDataToStorage();
            return { success: true, coach: newCoach };
        }
    } catch (error) {
        console.error('Error creating coach:', error);
        return { success: false, error: error.message };
    }
}

// Read coach by ID
function getCoachById(id) {
    // Coach IDs from Supabase are strings (UUIDs), so compare as strings
    return window.coaches.find(c => String(c.id) === String(id));
}

// Update coach
async function updateCoach(id, coachData) {
    try {
        if (isSupabaseAvailable()) {
            // Use Supabase
            const updatedCoach = await window.supabaseData.updateCoach(id, coachData);

            // Update local cache
            // Coach IDs from Supabase are strings (UUIDs), so compare as strings
            const index = window.coaches.findIndex(c => String(c.id) === String(id));
            if (index !== -1) {
                window.coaches[index] = updatedCoach;
                console.log('✅ Coach updated:', updatedCoach);
            }

            return { success: true, coach: updatedCoach };
        } else {
            // Fallback to localStorage
            // Coach IDs from Supabase are strings (UUIDs), so compare as strings
            const index = window.coaches.findIndex(c => String(c.id) === String(id));
            if (index === -1) {
                return { success: false, error: 'Coach not found' };
            }

            window.coaches[index] = {
                ...window.coaches[index],
                firstName: coachData.firstName,
                lastName: coachData.lastName,
                branch: coachData.branch,
                branchId: coachData.branchId,
                email: coachData.email,
                phone: coachData.phone
            };

            saveDataToStorage();
            return { success: true, coach: window.coaches[index] };
        }
    } catch (error) {
        console.error('Error updating coach:', error);
        return { success: false, error: error.message };
    }
}

// Delete coach
async function deleteCoach(id) {
    try {
        if (isSupabaseAvailable()) {
            // Use Supabase
            await window.supabaseData.deleteCoach(id);

            // Update local cache
            // Coach IDs from Supabase are strings (UUIDs), so compare as strings
            const index = window.coaches.findIndex(c => String(c.id) === String(id));
            if (index !== -1) {
                const deletedCoach = window.coaches[index];
                window.coaches.splice(index, 1);
                console.log('✅ Coach deleted:', deletedCoach);
                return { success: true, coach: deletedCoach };
            }

            return { success: true };
        } else {
            // Fallback to localStorage
            // Coach IDs from Supabase are strings (UUIDs), so compare as strings
            const index = window.coaches.findIndex(c => String(c.id) === String(id));
            if (index === -1) {
                return { success: false, error: 'Coach not found' };
            }

            // Check if coach has students
            const coachName = `${window.coaches[index].firstName} ${window.coaches[index].lastName}`;
            const hasStudents = window.students.some(s => s.coach === coachName);

            if (hasStudents) {
                return {
                    success: false,
                    error: 'Cannot delete coach with assigned students. Please reassign students first.'
                };
            }

            const deletedCoach = window.coaches[index];
            window.coaches.splice(index, 1);
            saveDataToStorage();
            return { success: true, coach: deletedCoach };
        }
    } catch (error) {
        console.error('Error deleting coach:', error);
        return { success: false, error: error.message };
    }
}

// ==================== BRANCH CRUD OPERATIONS ====================

// Create new branch
async function createBranch(branchData) {
    try {
        if (isSupabaseAvailable()) {
            // Use Supabase
            const newBranch = await window.supabaseData.addBranch(branchData);
            window.branches.push(newBranch);
            return { success: true, branch: newBranch };
        } else {
            // Fallback to localStorage
            const maxId = window.branches.length > 0 ? Math.max(...window.branches.map(b => b.id)) : 0;
            const newBranch = {
                id: maxId + 1,
                name: branchData.name,
                location: branchData.location,
                phone: branchData.phone,
                email: branchData.email
            };

            window.branches.push(newBranch);
            saveDataToStorage();
            return { success: true, branch: newBranch };
        }
    } catch (error) {
        console.error('Error creating branch:', error);
        return { success: false, error: error.message };
    }
}

// Read branch by ID
function getBranchById(id) {
    // Branch IDs from Supabase are strings (UUIDs), so compare as strings
    return window.branches.find(b => String(b.id) === String(id));
}

// Read branch by name
function getBranchByName(name) {
    return window.branches.find(b => b.name === name);
}

// Update branch
async function updateBranch(id, branchData) {
    try {
        if (isSupabaseAvailable()) {
            // Use Supabase
            const updatedBranch = await window.supabaseData.updateBranch(id, branchData);

            // Update local cache
            // Branch IDs from Supabase are strings (UUIDs), so compare as strings
            const index = window.branches.findIndex(b => String(b.id) === String(id));
            if (index !== -1) {
                window.branches[index] = updatedBranch;
            }

            return { success: true, branch: updatedBranch };
        } else {
            // Fallback to localStorage
            // Branch IDs from Supabase are strings (UUIDs), so compare as strings
            const index = window.branches.findIndex(b => String(b.id) === String(id));
            if (index === -1) {
                return { success: false, error: 'Branch not found' };
            }

            const oldName = window.branches[index].name;
            const newName = branchData.name;

            window.branches[index] = {
                ...window.branches[index],
                name: newName,
                location: branchData.location,
                phone: branchData.phone,
                email: branchData.email
            };

            // Update branch name in students and coaches if changed
            if (oldName !== newName) {
                window.students.forEach(student => {
                    if (student.branch === oldName) {
                        student.branch = newName;
                    }
                });

                window.coaches.forEach(coach => {
                    if (coach.branch === oldName) {
                        coach.branch = newName;
                    }
                });
            }

            saveDataToStorage();
            return { success: true, branch: window.branches[index] };
        }
    } catch (error) {
        console.error('Error updating branch:', error);
        return { success: false, error: error.message };
    }
}

// Delete branch
async function deleteBranch(id) {
    try {
        if (isSupabaseAvailable()) {
            // Use Supabase
            await window.supabaseData.deleteBranch(id);

            // Update local cache
            // Branch IDs from Supabase are strings (UUIDs), so compare as strings
            const index = window.branches.findIndex(b => String(b.id) === String(id));
            if (index !== -1) {
                const deletedBranch = window.branches[index];
                window.branches.splice(index, 1);
                return { success: true, branch: deletedBranch };
            }

            return { success: true };
        } else {
            // Fallback to localStorage
            // Branch IDs from Supabase are strings (UUIDs), so compare as strings
            const index = window.branches.findIndex(b => String(b.id) === String(id));
            if (index === -1) {
                return { success: false, error: 'Branch not found' };
            }

            const branchName = window.branches[index].name;

            // Check if branch has students or coaches
            const hasStudents = window.students.some(s => s.branch === branchName);
            const hasCoaches = window.coaches.some(c => c.branch === branchName);

            if (hasStudents || hasCoaches) {
                return {
                    success: false,
                    error: 'Cannot delete branch with students or coaches. Please reassign them first.'
                };
            }

            const deletedBranch = window.branches[index];
            window.branches.splice(index, 1);
            saveDataToStorage();
            return { success: true, branch: deletedBranch };
        }
    } catch (error) {
        console.error('Error deleting branch:', error);
        return { success: false, error: error.message };
    }
}

// ==================== HELPER FUNCTIONS ====================

// Get all branches
function getAllBranches() {
    return window.branches;
}

// Get all coaches
function getAllCoaches() {
    return window.coaches;
}

// Get all students
function getAllStudents() {
    return window.students;
}

// Get coaches by branch (NEW: check branchNames array for multi-branch support)
function getCoachesByBranch(branchName) {
    return window.coaches.filter(c =>
        c.branchNames && c.branchNames.includes(branchName)
    );
}

// Get students by branch
function getStudentsByBranch(branchName) {
    return window.students.filter(s => s.branch === branchName);
}

// Get students by coach
function getStudentsByCoach(coachName) {
    return window.students.filter(s => s.coach === coachName);
}

// Export data as JSON
function exportDataAsJSON() {
    const data = {
        students: window.students,
        coaches: window.coaches,
        branches: window.branches,
        exportDate: new Date().toISOString()
    };

    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chess-empire-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Import data from JSON
async function importDataFromJSON(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            let data = JSON.parse(e.target.result);

            if (isSupabaseAvailable()) {
                // Detect and normalize JSON format
                let studentsArray = [];

                // Format 1: {"students": [...]}
                if (data.students && Array.isArray(data.students)) {
                    studentsArray = data.students;
                }
                // Format 2: Direct array with "Student Name", "Branch", "Coach" keys
                else if (Array.isArray(data) && data.length > 0 && data[0]["Student Name"]) {
                    console.log('📋 Detected simplified format, converting...');
                    studentsArray = data.map(item => {
                        // Split "Student Name" into first and last name
                        const nameParts = (item["Student Name"] || "").trim().split(/\s+/);
                        const firstName = nameParts[0] || "Unknown";
                        const lastName = nameParts.slice(1).join(" ") || "Unknown";

                        return {
                            firstName: firstName,
                            lastName: lastName,
                            branch: item.Branch || item.branch,
                            coach: item.Coach || item.coach
                        };
                    });
                }
                // Format 3: Direct array [{firstName, lastName, ...}]
                else if (Array.isArray(data)) {
                    studentsArray = data;
                }
                else {
                    showToast('❌ Invalid JSON format. Expected:\n- {"students": [...]}\n- [{Student Name, Branch, Coach}]\n- [{firstName, lastName, ...}]', 'error');
                    return;
                }

                if (studentsArray.length === 0) {
                    showToast('❌ No students found in JSON file', 'error');
                    return;
                }

                if (!confirm(`⚠️ This will import ${studentsArray.length} students into Supabase. Continue?`)) {
                    return;
                }

                // Show loading overlay during import
                showLoadingOverlay(`Importing ${studentsArray.length} students...`);

                console.log(`📥 Starting import of ${studentsArray.length} students...`);
                let successCount = 0;
                let errorCount = 0;
                const errors = [];

                for (let i = 0; i < studentsArray.length; i++) {
                    const studentData = studentsArray[i];
                    try {
                        // Check for duplicate student (by first name + last name)
                        const existingStudent = window.students.find(s =>
                            s.firstName.toLowerCase() === studentData.firstName.toLowerCase() &&
                            s.lastName.toLowerCase() === studentData.lastName.toLowerCase()
                        );

                        if (existingStudent) {
                            console.log(`⏭️ Skipping duplicate student ${i + 1}/${studentsArray.length}: ${studentData.firstName} ${studentData.lastName}`);
                            successCount++; // Count as success since student exists
                            continue;
                        }

                        // Find branch by name (fuzzy matching for common variations)
                        let branchId = studentData.branchId;
                        let branch = null;

                        if (!branchId && studentData.branch) {
                            const searchName = studentData.branch.toLowerCase().trim();
                            branch = window.branches.find(b => {
                                const branchName = b.name.toLowerCase().trim();
                                // Exact match
                                if (branchName === searchName) return true;
                                // Handle common variations (Khalyk/Halyk)
                                if (searchName.includes('khalyk') && branchName.includes('halyk')) return true;
                                if (searchName.includes('halyk') && branchName.includes('halyk')) return true;
                                // Partial match for unique names
                                if (searchName.includes('gagarin') && branchName.includes('gagarin')) return true;
                                if (searchName.includes('debut') && branchName.includes('debut')) return true;
                                if (searchName.includes('arena') && branchName.includes('arena') &&
                                    (searchName.includes('almaty') && branchName.includes('almaty'))) return true;
                                if (searchName.includes('zhandosov') && branchName.includes('zhandosov')) return true;
                                if (searchName.includes('abaya') && branchName.includes('abaya')) return true;
                                if (searchName.includes('almaty 1') && branchName.includes('almaty 1')) return true;
                                return false;
                            });

                            // Auto-create branch if not found
                            if (!branch && studentData.branch.trim()) {
                                console.log(`➕ Creating new branch: ${studentData.branch}`);
                                const newBranch = await window.supabaseData.addBranch({
                                    name: studentData.branch.trim(),
                                    location: 'Auto-created from import',
                                    phone: null,
                                    email: null
                                });
                                window.branches.push(newBranch);
                                branch = newBranch;
                                branchId = newBranch.id;
                            } else {
                                branchId = branch ? branch.id : null;
                            }
                        }

                        // Find coach by name (fuzzy matching)
                        let coachId = studentData.coachId;
                        let coach = null;

                        if (!coachId && studentData.coach && studentData.coach.trim()) {
                            const searchCoach = studentData.coach.toLowerCase().trim();
                            coach = window.coaches.find(c => {
                                const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
                                // Exact match
                                if (fullName === searchCoach) return true;
                                // Check if search contains coach's first name
                                if (searchCoach.includes(c.firstName.toLowerCase())) return true;
                                // Check if search contains coach's last name
                                if (searchCoach.includes(c.lastName.toLowerCase())) return true;
                                return false;
                            });

                            // Auto-create coach if not found
                            if (!coach && studentData.coach.trim()) {
                                console.log(`➕ Creating new coach: ${studentData.coach}`);
                                // Parse coach name (could be "FirstName LastName" or "FirstName Patronymic")
                                const coachParts = studentData.coach.trim().split(/\s+/);
                                const newCoach = await window.supabaseData.addCoach({
                                    firstName: coachParts[0] || studentData.coach.trim(),
                                    lastName: coachParts.slice(1).join(" ") || "",
                                    phone: null,
                                    email: null,
                                    branchId: branchId // Assign to same branch as student
                                });
                                window.coaches.push(newCoach);
                                coach = newCoach;
                                coachId = newCoach.id;
                            } else {
                                coachId = coach ? coach.id : null;
                            }
                        }

                        // Prepare student data for Supabase
                        const supabaseStudentData = {
                            firstName: studentData.firstName,
                            lastName: studentData.lastName,
                            age: studentData.age,
                            dateOfBirth: studentData.dateOfBirth,
                            gender: studentData.gender,
                            photoUrl: studentData.photoUrl,
                            branchId: branchId,
                            coachId: coachId,
                            razryad: studentData.razryad || 'none',
                            status: studentData.status || 'active',
                            currentLevel: studentData.currentLevel || 1,
                            currentLesson: studentData.currentLesson || 1,
                            totalLessons: studentData.totalLessons || 120,
                            parentName: studentData.parentName,
                            parentPhone: studentData.parentPhone,
                            parentEmail: studentData.parentEmail
                        };

                        // Add student to Supabase
                        await window.supabaseData.addStudent(supabaseStudentData);
                        successCount++;
                        console.log(`✅ Imported student ${i + 1}/${studentsArray.length}: ${studentData.firstName} ${studentData.lastName}`);
                    } catch (error) {
                        errorCount++;
                        errors.push({
                            student: `${studentData.firstName} ${studentData.lastName}`,
                            error: error.message
                        });
                        console.error(`❌ Failed to import student ${i + 1}:`, studentData, error);
                    }
                }

                console.log(`📊 Import complete: ${successCount} success, ${errorCount} errors`);

                // Hide loading overlay
                hideLoadingOverlay();

                if (errorCount > 0) {
                    console.error('Import errors:', errors);
                    showToast(`⚠️ Import completed with errors:\n✅ ${successCount} students imported\n❌ ${errorCount} students failed\n\nCheck console for details.`, 'warning');
                } else {
                    showToast(`✅ Successfully imported ${successCount} students!`, 'success');
                }

                // Reload data from Supabase to refresh UI
                await initializeData();
            } else {
                // Fallback localStorage import
                if (confirm('⚠️ This will replace all current data with imported data. Continue?')) {
                    if (data.students) window.students = data.students;
                    if (data.coaches) window.coaches = data.coaches;
                    if (data.branches) window.branches = data.branches;

                    saveDataToStorage();
                    window.location.reload();
                }
            }
        } catch (error) {
            hideLoadingOverlay();
            showToast('❌ Error importing data: ' + error.message, 'error');
            console.error('Import error:', error);
        }
    };
    reader.readAsText(file);
}

// ==========================================
// EXPOSE FUNCTIONS TO GLOBAL SCOPE
// ==========================================
// CRITICAL: Functions must be exposed to window for access from other scripts
// (student.js, admin.js, app.js, etc.)
if (typeof window !== 'undefined') {
    window.initializeData = initializeData;
    window.loadDataFromSupabase = loadDataFromSupabase;
    window.loadDataFromStorage = loadDataFromStorage;
    window.refreshAllUIComponents = refreshAllUIComponents;
    window.showLoadingOverlay = showLoadingOverlay;
    window.hideLoadingOverlay = hideLoadingOverlay;
    console.log('✅ CRUD functions exposed to global scope');
    console.log('  window.initializeData:', typeof window.initializeData);
    console.log('  window.loadDataFromSupabase:', typeof window.loadDataFromSupabase);
}

// Initialize data on page load
// NOTE: Do NOT auto-initialize here - admin.js handles initialization explicitly
// to ensure proper sequencing with authentication and UI setup.
// if (typeof window !== 'undefined') {
//     window.addEventListener('DOMContentLoaded', initializeData);
// }
