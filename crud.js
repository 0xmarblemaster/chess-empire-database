// CRUD Operations Module with LocalStorage Persistence
// This module handles Create, Read, Update, Delete operations for students, coaches, and branches

// Initialize data from localStorage or use defaults
function initializeData() {
    // Load from localStorage or use default data
    if (!localStorage.getItem('students')) {
        localStorage.setItem('students', JSON.stringify(students));
    }
    if (!localStorage.getItem('coaches')) {
        localStorage.setItem('coaches', JSON.stringify(coaches));
    }
    if (!localStorage.getItem('branches')) {
        localStorage.setItem('branches', JSON.stringify(branches));
    }

    // Load data from localStorage
    loadDataFromStorage();
}

// Load data from localStorage
function loadDataFromStorage() {
    try {
        const storedStudents = localStorage.getItem('students');
        const storedCoaches = localStorage.getItem('coaches');
        const storedBranches = localStorage.getItem('branches');

        if (storedStudents) students = JSON.parse(storedStudents);
        if (storedCoaches) coaches = JSON.parse(storedCoaches);
        if (storedBranches) branches = JSON.parse(storedBranches);
    } catch (error) {
        console.error('Error loading data from localStorage:', error);
    }
}

// Save data to localStorage
function saveDataToStorage() {
    try {
        localStorage.setItem('students', JSON.stringify(students));
        localStorage.setItem('coaches', JSON.stringify(coaches));
        localStorage.setItem('branches', JSON.stringify(branches));
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
function createStudent(studentData) {
    try {
        // Generate new ID
        const maxId = students.length > 0 ? Math.max(...students.map(s => s.id)) : 0;
        const newStudent = {
            id: maxId + 1,
            firstName: studentData.firstName,
            lastName: studentData.lastName,
            age: parseInt(studentData.age),
            branch: studentData.branch,
            coach: studentData.coach,
            razryad: studentData.razryad || null,
            status: studentData.status || 'active',
            currentLevel: parseInt(studentData.currentLevel) || 1,
            currentLesson: parseInt(studentData.currentLesson) || 1,
            totalLessons: parseInt(studentData.totalLessons) || 40
        };

        students.push(newStudent);
        saveDataToStorage();
        return { success: true, student: newStudent };
    } catch (error) {
        console.error('Error creating student:', error);
        return { success: false, error: error.message };
    }
}

// Read student by ID
function getStudentById(id) {
    return students.find(s => s.id === parseInt(id));
}

// Update student
function updateStudent(id, studentData) {
    try {
        const index = students.findIndex(s => s.id === parseInt(id));
        if (index === -1) {
            return { success: false, error: 'Student not found' };
        }

        students[index] = {
            ...students[index],
            firstName: studentData.firstName,
            lastName: studentData.lastName,
            age: parseInt(studentData.age),
            branch: studentData.branch,
            coach: studentData.coach,
            razryad: studentData.razryad || null,
            status: studentData.status,
            currentLevel: parseInt(studentData.currentLevel),
            currentLesson: parseInt(studentData.currentLesson),
            totalLessons: parseInt(studentData.totalLessons)
        };

        saveDataToStorage();
        return { success: true, student: students[index] };
    } catch (error) {
        console.error('Error updating student:', error);
        return { success: false, error: error.message };
    }
}

// Delete student
function deleteStudent(id) {
    try {
        const index = students.findIndex(s => s.id === parseInt(id));
        if (index === -1) {
            return { success: false, error: 'Student not found' };
        }

        const deletedStudent = students[index];
        students.splice(index, 1);
        saveDataToStorage();
        return { success: true, student: deletedStudent };
    } catch (error) {
        console.error('Error deleting student:', error);
        return { success: false, error: error.message };
    }
}

// ==================== COACH CRUD OPERATIONS ====================

// Create new coach
function createCoach(coachData) {
    try {
        const maxId = coaches.length > 0 ? Math.max(...coaches.map(c => c.id)) : 0;
        const newCoach = {
            id: maxId + 1,
            firstName: coachData.firstName,
            lastName: coachData.lastName,
            branch: coachData.branch,
            email: coachData.email,
            phone: coachData.phone
        };

        coaches.push(newCoach);
        saveDataToStorage();
        return { success: true, coach: newCoach };
    } catch (error) {
        console.error('Error creating coach:', error);
        return { success: false, error: error.message };
    }
}

// Read coach by ID
function getCoachById(id) {
    return coaches.find(c => c.id === parseInt(id));
}

// Update coach
function updateCoach(id, coachData) {
    try {
        const index = coaches.findIndex(c => c.id === parseInt(id));
        if (index === -1) {
            return { success: false, error: 'Coach not found' };
        }

        coaches[index] = {
            ...coaches[index],
            firstName: coachData.firstName,
            lastName: coachData.lastName,
            branch: coachData.branch,
            email: coachData.email,
            phone: coachData.phone
        };

        saveDataToStorage();
        return { success: true, coach: coaches[index] };
    } catch (error) {
        console.error('Error updating coach:', error);
        return { success: false, error: error.message };
    }
}

// Delete coach
function deleteCoach(id) {
    try {
        const index = coaches.findIndex(c => c.id === parseInt(id));
        if (index === -1) {
            return { success: false, error: 'Coach not found' };
        }

        // Check if coach has students
        const coachName = `${coaches[index].firstName} ${coaches[index].lastName}`;
        const hasStudents = students.some(s => s.coach === coachName);

        if (hasStudents) {
            return {
                success: false,
                error: 'Cannot delete coach with assigned students. Please reassign students first.'
            };
        }

        const deletedCoach = coaches[index];
        coaches.splice(index, 1);
        saveDataToStorage();
        return { success: true, coach: deletedCoach };
    } catch (error) {
        console.error('Error deleting coach:', error);
        return { success: false, error: error.message };
    }
}

// ==================== BRANCH CRUD OPERATIONS ====================

// Create new branch
function createBranch(branchData) {
    try {
        const maxId = branches.length > 0 ? Math.max(...branches.map(b => b.id)) : 0;
        const newBranch = {
            id: maxId + 1,
            name: branchData.name,
            location: branchData.location,
            phone: branchData.phone,
            email: branchData.email
        };

        branches.push(newBranch);
        saveDataToStorage();
        return { success: true, branch: newBranch };
    } catch (error) {
        console.error('Error creating branch:', error);
        return { success: false, error: error.message };
    }
}

// Read branch by ID
function getBranchById(id) {
    return branches.find(b => b.id === parseInt(id));
}

// Read branch by name
function getBranchByName(name) {
    return branches.find(b => b.name === name);
}

// Update branch
function updateBranch(id, branchData) {
    try {
        const index = branches.findIndex(b => b.id === parseInt(id));
        if (index === -1) {
            return { success: false, error: 'Branch not found' };
        }

        const oldName = branches[index].name;
        const newName = branchData.name;

        branches[index] = {
            ...branches[index],
            name: newName,
            location: branchData.location,
            phone: branchData.phone,
            email: branchData.email
        };

        // Update branch name in students and coaches if changed
        if (oldName !== newName) {
            students.forEach(student => {
                if (student.branch === oldName) {
                    student.branch = newName;
                }
            });

            coaches.forEach(coach => {
                if (coach.branch === oldName) {
                    coach.branch = newName;
                }
            });
        }

        saveDataToStorage();
        return { success: true, branch: branches[index] };
    } catch (error) {
        console.error('Error updating branch:', error);
        return { success: false, error: error.message };
    }
}

// Delete branch
function deleteBranch(id) {
    try {
        const index = branches.findIndex(b => b.id === parseInt(id));
        if (index === -1) {
            return { success: false, error: 'Branch not found' };
        }

        const branchName = branches[index].name;

        // Check if branch has students or coaches
        const hasStudents = students.some(s => s.branch === branchName);
        const hasCoaches = coaches.some(c => c.branch === branchName);

        if (hasStudents || hasCoaches) {
            return {
                success: false,
                error: 'Cannot delete branch with students or coaches. Please reassign them first.'
            };
        }

        const deletedBranch = branches[index];
        branches.splice(index, 1);
        saveDataToStorage();
        return { success: true, branch: deletedBranch };
    } catch (error) {
        console.error('Error deleting branch:', error);
        return { success: false, error: error.message };
    }
}

// ==================== HELPER FUNCTIONS ====================

// Get all branches
function getAllBranches() {
    return branches;
}

// Get all coaches
function getAllCoaches() {
    return coaches;
}

// Get all students
function getAllStudents() {
    return students;
}

// Get coaches by branch
function getCoachesByBranch(branchName) {
    return coaches.filter(c => c.branch === branchName);
}

// Get students by branch
function getStudentsByBranch(branchName) {
    return students.filter(s => s.branch === branchName);
}

// Get students by coach
function getStudentsByCoach(coachName) {
    return students.filter(s => s.coach === coachName);
}

// Export data as JSON
function exportDataAsJSON() {
    const data = {
        students: students,
        coaches: coaches,
        branches: branches,
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
function importDataFromJSON(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);

            if (confirm('⚠️ This will replace all current data with imported data. Continue?')) {
                if (data.students) students = data.students;
                if (data.coaches) coaches = data.coaches;
                if (data.branches) branches = data.branches;

                saveDataToStorage();
                window.location.reload();
            }
        } catch (error) {
            alert('❌ Error importing data: ' + error.message);
        }
    };
    reader.readAsText(file);
}

// Initialize data on page load
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', initializeData);
}
