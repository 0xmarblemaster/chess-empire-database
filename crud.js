// CRUD Operations Module with Supabase Integration
// This module handles Create, Read, Update, Delete operations for students, coaches, and branches
// IMPORTANT: Uses global variables from data.js (students, coaches, branches)

// Flag to check if Supabase is available
const useSupabase = typeof window !== 'undefined' && window.supabaseClient && window.supabaseData;

// Initialize data - load from Supabase or fallback to localStorage
async function initializeData() {
    if (useSupabase) {
        console.log('📊 Initializing data from Supabase...');
        await loadDataFromSupabase();
    } else {
        console.log('📊 Supabase not available, using localStorage fallback...');
        loadDataFromStorage();
    }
}

// Load data from Supabase and update global variables
async function loadDataFromSupabase() {
    try {
        // Fetch data from Supabase
        const supabaseStudents = await window.supabaseData.getStudents();
        const supabaseCoaches = await window.supabaseData.getCoaches();
        const supabaseBranches = await window.supabaseData.getBranches();
        
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

        console.log('✅ Loaded from Supabase:', {
            students: students.length,
            coaches: coaches.length,
            branches: branches.length
        });
        console.log('👥 Coaches loaded:', coaches.map(c => `${c.firstName} ${c.lastName}`).join(', '));

        // Trigger UI refresh after data is loaded
        refreshAllUIComponents();
    } catch (error) {
        console.error('❌ Error loading data from Supabase:', error);
        // Fallback to localStorage on error
        loadDataFromStorage();
    }
}

// Refresh all UI components after data loads
function refreshAllUIComponents() {
    // Priority 1: Critical UI updates (synchronous)
    // Load students list first (most important)
    if (typeof loadStudents === 'function') {
        loadStudents();
    }

    // Priority 2: Defer non-critical updates to next frame
    requestAnimationFrame(() => {
        // Load statistics
        if (typeof loadStatistics === 'function') {
            loadStatistics();
        }

        // Refresh dashboard stats
        const totalCoaches = document.querySelector('.stat-card:has([data-lucide="users"]) .stat-value');
        if (totalCoaches) {
            totalCoaches.textContent = window.coaches.length;
        }
    });

    // Priority 3: Defer dropdowns to next frame after stats
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            // Populate sidebar dropdowns with Supabase data
            if (typeof populateCoachDropdown === 'function') {
                populateCoachDropdown();
            }

            if (typeof populateBranchDropdown === 'function') {
                populateBranchDropdown();
            }

            // Update filter dropdowns
            if (typeof populateFilterDropdowns === 'function') {
                populateFilterDropdowns();
            }
        });
    });

    // Priority 4: Only refresh section-specific views if they're visible
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // Refresh coaches management if it's visible
                if (typeof loadCoaches === 'function') {
                    const coachesSection = document.getElementById('coachesSection');
                    if (coachesSection && coachesSection.classList.contains('active')) {
                        loadCoaches();
                        // Update stats
                        const totalCoachesManage = document.getElementById('totalCoachesManage');
                        if (totalCoachesManage) {
                            totalCoachesManage.textContent = window.coaches.length;
                        }
                    }
                }

                // Refresh coaches list view (Main menu) if it's visible
                if (typeof refreshCoachesListView === 'function') {
                    const coachesListSection = document.getElementById('coachesListSection');
                    if (coachesListSection && coachesListSection.classList.contains('active')) {
                        refreshCoachesListView();
                    }
                }

                // Refresh branches management if it's visible
                if (typeof loadBranches === 'function') {
                    const branchesSection = document.getElementById('branchesSection');
                    if (branchesSection && branchesSection.classList.contains('active')) {
                        loadBranches();
                    }
                }

                console.log('🔄 UI components refreshed with Supabase data');
            });
        });
    });
}

// Load data from localStorage (fallback)
function loadDataFromStorage() {
    try {
        const storedStudents = localStorage.getItem('students');
        const storedCoaches = localStorage.getItem('coaches');
        const storedBranches = localStorage.getItem('branches');

        if (storedStudents) window.students = JSON.parse(storedStudents);
        if (storedCoaches) window.coaches = JSON.parse(storedCoaches);
        if (storedBranches) window.branches = JSON.parse(storedBranches);
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
        if (useSupabase) {
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
                totalLessons: parseInt(studentData.totalLessons) || 40,
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
        if (useSupabase) {
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
        if (useSupabase) {
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
        if (useSupabase) {
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
        if (useSupabase) {
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
        if (useSupabase) {
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
        if (useSupabase) {
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
        if (useSupabase) {
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
        if (useSupabase) {
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

// Get coaches by branch
function getCoachesByBranch(branchName) {
    return window.coaches.filter(c => c.branch === branchName);
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
            const data = JSON.parse(e.target.result);

            if (useSupabase && window.supabaseData) {
                // Supabase import - add students to database
                if (!data.students || !Array.isArray(data.students)) {
                    alert('❌ Invalid JSON format. Expected {"students": [...]}');
                    return;
                }

                if (!confirm(`⚠️ This will import ${data.students.length} students into Supabase. Continue?`)) {
                    return;
                }

                console.log(`📥 Starting import of ${data.students.length} students...`);
                let successCount = 0;
                let errorCount = 0;
                const errors = [];

                for (let i = 0; i < data.students.length; i++) {
                    const studentData = data.students[i];
                    try {
                        // Find branch by name
                        let branchId = studentData.branchId;
                        if (!branchId && studentData.branch) {
                            const branch = window.branches.find(b => b.name === studentData.branch);
                            branchId = branch ? branch.id : null;
                        }

                        // Find coach by name
                        let coachId = studentData.coachId;
                        if (!coachId && studentData.coach) {
                            const coach = window.coaches.find(c => `${c.firstName} ${c.lastName}` === studentData.coach);
                            coachId = coach ? coach.id : null;
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
                            totalLessons: studentData.totalLessons || 40,
                            parentName: studentData.parentName,
                            parentPhone: studentData.parentPhone,
                            parentEmail: studentData.parentEmail
                        };

                        // Add student to Supabase
                        await window.supabaseData.addStudent(supabaseStudentData);
                        successCount++;
                        console.log(`✅ Imported student ${i + 1}/${data.students.length}: ${studentData.firstName} ${studentData.lastName}`);
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

                if (errorCount > 0) {
                    console.error('Import errors:', errors);
                    alert(`⚠️ Import completed with errors:\n✅ ${successCount} students imported\n❌ ${errorCount} students failed\n\nCheck console for details.`);
                } else {
                    alert(`✅ Successfully imported ${successCount} students!`);
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
            alert('❌ Error importing data: ' + error.message);
            console.error('Import error:', error);
        }
    };
    reader.readAsText(file);
}

// Initialize data on page load
// NOTE: Do NOT auto-initialize here - admin.js handles initialization explicitly
// to ensure proper sequencing with authentication and UI setup.
// if (typeof window !== 'undefined') {
//     window.addEventListener('DOMContentLoaded', initializeData);
// }
