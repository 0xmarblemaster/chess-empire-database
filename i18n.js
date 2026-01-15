const razryadDictionary = {
    'KMS': { en: 'KMS', ru: 'КМС', kk: 'ХШҚ' },
    '1st': { en: '1st', ru: '1', kk: '1' },
    '2nd': { en: '2nd', ru: '2', kk: '2' },
    '3rd': { en: '3rd', ru: '3', kk: '3' },
    '4th': { en: '4th', ru: '4', kk: '4' },
    'None': { en: 'No', ru: 'нет', kk: 'жоқ' },
    'none': { en: 'No', ru: 'нет', kk: 'жоқ' }
};

const statusDictionary = {
    active: { en: 'Active', ru: 'Активен', kk: 'Белсенді' },
    frozen: { en: 'Frozen', ru: 'Заморожен', kk: 'Мұздатылған' },
    left: { en: 'Left', ru: 'Ушел', kk: 'Кетті' },
    inactive: { en: 'Inactive', ru: 'Неактивен', kk: 'Белсенді емес' },
    pending: { en: 'Pending', ru: 'В ожидании', kk: 'Күтуде' }
};

const translations = {
    en: {
        // Common
        "common.brand": "Chess Empire",
        "common.brand.full": "Chess Empire - Student Database",
        "common.login": "Login",
        "common.dashboard": "Dashboard",
        "common.backToSearch": "Back to Search",
        "common.backToDashboard": "Back to Dashboard",
        "common.editBranch": "Edit Branch",
        "common.allStudents": "All Students",
        "common.coaches": "Coaches",
        "common.close": "Close",
        "common.branch": "Branch",
        "common.phone": "Phone",
        "common.email": "Email",
        "common.cancel": "Cancel",
        "common.next": "Next",
        "common.back": "Back",
        "common.saveChanges": "Save Changes",
        "common.addStudent": "Add Student",
        "common.logout": "Logout",
        "common.students": "Students",
        "common.level": "Level",
        "common.razryad": "Razryad",
        "common.status": "Status",
        "common.actions": "Actions",
        "common.age": "Age",
        "common.search": "Search",
        "common.searchStudentsPlaceholder": "Search students...",
        "common.showingResults": "Showing {{count}} of {{total}} students",
        "common.noData": "No data available",
        "common.totalStudents": "Total Students",
        "common.activeStudents": "Active Students",
        "common.totalCoaches": "Coaches",
        "common.totalBranches": "Branches",
        "common.avgLevel": "Average Level",
        "common.levelDistribution": "Level Distribution",
        "common.razryadDistribution": "Razryad Distribution",
        "common.studentsDistribution": "Students",
        "common.languageLabel": "Language",
        "common.languageEnglish": "English",
        "common.languageRussian": "Русский",
        "common.languageToggle": "Switch language",
        "common.loading": "Searching...",
        "common.years": "years",

        // Index
        "index.title": "Chess Empire - Student Database",
        "index.searchPlaceholder": "Search for a student...",
        "index.noStudents": "No students found",
        "index.coachLabel": "Coach: {{coach}}",
        "index.razryadBadge": "{{razryad}} Razryad",

        // Student Page
        "student.title": "Student Profile - Chess Empire",
        "student.back": "Back to Search",
        "student.statusActive": "Active Student",
        "student.age": "Age",
        "student.ageValue": "{{count}} years",
        "student.dateOfBirth": "Date of Birth",
        "student.calculatedAge": "Age: {{count}} years",
        "student.branch": "Branch",
        "student.coach": "Coach",
        "student.razryad": "Razryad",
        "student.razryadNotYet": "Not yet",
        "student.learningProgress": "Learning Progress",
        "student.currentLevel": "Current Level",
        "student.levelLabel": "Level",
        "student.levelDetail": "Level {{current}} of 8",
        "student.currentLesson": "Current Lesson",
        "student.lessonDetail": "Lesson {{current}} of {{total}}",
        "student.lessonsCompleted": "{{count}} Lessons Completed",
        "student.attendance": "90% Attendance",
        "student.streak": "5 Week Streak",
        "student.edit": "Edit",
        "student.editProfile": "Edit Student Profile",
        "student.firstName": "First Name",
        "student.lastName": "Last Name",
        "student.photoUrl": "Photo URL",
        "student.status": "Status",
        "student.statusActive": "Active",
        "student.statusInactive": "Inactive",
        "student.statusGraduated": "Graduated",
        "student.save": "Save Changes",
        "student.editSuccess": "Student profile updated successfully",
        "student.editError": "Failed to update student profile",

        // Branch Page
        "branch.title": "Branch - Chess Empire",
        "branch.pageTitle": "{{branch}} - Chess Empire",
        "branch.back": "Back to Dashboard",
        "branch.edit": "Edit Branch",
        "branch.totalStudents": "Total Students",
        "branch.activeStudents": "Active Students",
        "branch.totalCoaches": "Coaches",
        "branch.avgLevel": "Average Level",
        "branch.coaches": "Coaches",
        "branch.students": "All Students",
        "branch.studentsAtLevel": "Level {{level}} Students",
        "branch.noCoaches": "No coaches assigned to this branch yet.",
        "branch.noStudents": "No students in this branch yet.",
        "branch.coachCount": "{{count}} students",
        "branch.studentMeta": "Age {{age}} • {{coach}}",
        "branch.studentLevel": "Level {{level}}",
        "branch.alert.noBranch": "No branch specified. Redirecting to admin dashboard...",
        "branch.alert.notFound": "Branch \"{{branch}}\" not found. Redirecting to admin dashboard...",
        "branch.alert.coachSoon": "Coach profile page will be implemented soon.\n\nCoach ID: {{id}}\n\nThis will show:\n- Coach information\n- Student list\n- Performance statistics\n- Class schedule",
        "branch.alert.editPending": "Edit branch functionality will be implemented soon.",
        "branch.razryadDistribution": "Razryad Distribution",
        "branch.levelDistribution": "Level Distribution",
        "branch.ageDistribution": "Age Distribution",
        "branch.studentsAtAge": "Age {{age}} Students",
        "branch.chart.razryadLabels": ["KMS", "1st Razryad", "2nd Razryad", "3rd Razryad", "4th Razryad", "No Razryad"],
        "branch.chart.studentsLabel": "Number of Students",
        "branch.chart.tooltip": "Students: {{count}}",
        "branch.chart.tooltipWithPercent": "{{label}}: {{value}} ({{percent}}%)",
        "branch.chart.levelLabel": "Level {{level}}",

        // Admin Dashboard
        "admin.title": "Admin Dashboard - Chess Empire",
        "admin.sidebar.main": "Main",
        "admin.sidebar.students": "Students",
        "admin.sidebar.branches": "Branches",
        "admin.sidebar.coaches": "Coaches",
        "admin.sidebar.management": "Management",
        "admin.sidebar.manageCoaches": "Manage Coaches",
        "admin.sidebar.manageBranches": "Manage Branches",
        "admin.sidebar.dataManagement": "Data Management",
        "admin.sidebar.attendance": "Attendance",
        "admin.header.students": "Students",
        "admin.header.coaches": "Coaches",
        "admin.header.attendance": "Attendance",
        "admin.header.settings": "More",
        "admin.nav.students": "Students",
        "admin.nav.coaches": "Coaches",
        "admin.nav.attendance": "Attendance",
        "admin.nav.settings": "More",
        "admin.actions.addStudent": "Add Student",
        "admin.stats.branches": "Branches",
        "admin.filters.status": "Status",
        "admin.filters.status.all": "All Students",
        "admin.filters.status.active": "Active",
        "admin.filters.status.frozen": "Frozen",
        "admin.filters.status.left": "Left",
        "admin.filters.branch": "Branch",
        "admin.filters.branch.all": "All Branches",
        "admin.filters.coach": "Coach",
        "admin.filters.coach.all": "All Coaches",
        "admin.filters.level": "Level",
        "admin.filters.level.all": "All Levels",
        "admin.filters.level.option": "Level {{level}}",
        "admin.table.title": "All Students",
        "admin.table.student": "Student",
        "admin.table.age": "Age",
        "admin.table.branch": "Branch",
        "admin.table.coach": "Coach",
        "admin.table.level": "Level",
        "admin.table.razryad": "Razryad",
        "admin.table.status": "Status",
        "admin.table.actions": "Actions",
        "admin.table.pagination": "Showing {{count}} of {{total}} students",
        "admin.empty.table": "No students found",
        "admin.empty.hint": "Try adjusting your filters or search query",
        "admin.coach.noStudents": "No students assigned to this coach",
        "admin.coach.kms": "Titled Students",
        "admin.coach.placeholder": "Coach Name",
        "admin.form.fileTooLarge": "File size must be less than 2MB",
        "admin.form.imageRequired": "Please select an image file",
        "admin.form.photoUploadFailed": "Photo upload failed, student saved without photo",
        "admin.form.requiredFields": "Please fill in all required fields",
        "admin.form.addSuccess": "Student added successfully!",
        "admin.form.editSuccess": "Student updated successfully!",
        "admin.form.deleteSuccess": "Student deleted successfully!",
        "admin.error.studentNotFound": "Student not found",
        "admin.branches.management": "Branches Management",
        "admin.branches.addBranch": "Add Branch",
        "admin.branches.totalBranches": "Total Branches",
        "admin.branches.totalStudents": "Total Students",
        "admin.branches.tableStudents": "Students",
        "admin.branches.tableCoaches": "Coaches",
        "admin.coaches.management": "Coaches Management",
        "admin.coaches.addCoach": "Add Coach",
        "admin.coaches.totalCoaches": "Total Coaches",
        "admin.coaches.tableCoach": "Coach",
        "admin.data.management": "Data Management",
        "admin.data.export": "Export Data",
        "admin.data.exportDesc": "Download all data as JSON",
        "admin.data.import": "Import Data",
        "admin.data.importDesc": "Upload JSON data file",
        "admin.data.reset": "Reset Data",
        "admin.data.resetDesc": "Restore default data",
        "admin.data.statistics": "Current Database Statistics",
        "admin.branch.title": "Branch Name",
        "admin.branch.location": "Location",
        "admin.branch.phone": "Phone",
        "admin.branch.email": "Email",
        "admin.modals.add.title": "Add New Student",
        "admin.modals.add.studentInfo": "Student Information",
        "admin.modals.add.firstName": "First Name *",
        "admin.modals.add.lastName": "Last Name *",
        "admin.modals.add.firstNamePlaceholder": "Enter first name",
        "admin.modals.add.lastNamePlaceholder": "Enter last name",
        "admin.modals.add.age": "Age *",
        "admin.modals.add.agePlaceholder": "Enter age",
        "admin.modals.add.dateOfBirth": "Date of Birth",
        "admin.modals.add.gender": "Gender",
        "admin.modals.add.genderSelect": "Select gender",
        "admin.modals.add.genderMale": "Male",
        "admin.modals.add.genderFemale": "Female",
        "admin.modals.add.photo": "Student Photo",
        "admin.modals.add.uploadPhoto": "Upload Photo",
        "admin.modals.add.uploadHint": "JPG, PNG or GIF (max 2MB)",
        "admin.modals.add.branchCoach": "Branch & Coach Assignment",
        "admin.modals.add.branch": "Branch *",
        "admin.modals.add.branchSelect": "Select branch",
        "admin.modals.add.coach": "Coach *",
        "admin.modals.add.coachSelect": "Select coach",
        "admin.modals.add.levelPlacement": "Initial Level Placement",
        "admin.modals.add.razryad": "Razryad",
        "admin.modals.add.noRazryad": "No razryad yet",
        "admin.modals.add.razryadOption": "{{label}}",
        "admin.modals.add.status": "Status *",
        "admin.modals.add.statusActive": "Active",
        "admin.modals.add.statusFrozen": "Frozen",
        "admin.modals.add.statusLeft": "Left",
        "admin.modals.add.contact": "Contact Information (Optional)",
        "admin.modals.add.parentName": "Parent/Guardian Name",
        "admin.modals.add.parentPlaceholder": "Enter parent name",
        "admin.modals.add.phone": "Phone Number",
        "admin.modals.add.phonePlaceholder": "+7 (XXX) XXX-XX-XX",
        "admin.modals.add.email": "Email",
        "admin.modals.add.emailPlaceholder": "student@example.com",
        "admin.modals.add.cancel": "Cancel",
        "admin.modals.add.submit": "Add Student",
        "admin.razryad.none": "No razryad yet",
        "admin.razryad.4th": "4th Razryad",
        "admin.razryad.3rd": "3rd Razryad",
        "admin.razryad.2nd": "2nd Razryad",
        "admin.razryad.1st": "1st Razryad",
        "admin.razryad.kms": "KMS (Candidate Master)",
        "admin.modals.edit.title": "Edit Student",
        "admin.modals.edit.save": "Save Changes",
        "admin.modals.edit.removePhoto": "Remove Photo",
        "admin.modals.edit.level": "Level & Progress",
        "admin.modals.edit.currentLevel": "Current Level",
        "admin.modals.edit.currentLesson": "Current Lesson",
        "admin.modals.edit.agePlaceholder": "Enter age",
        "admin.modals.edit.genderUnknown": "Not specified",
        "admin.modals.edit.levelPlaceholder": "1-10",
        "admin.modals.edit.lessonPlaceholder": "1-40",
        "admin.modals.edit.botProgress": "Bot Progress",
        "admin.modals.edit.botProgressHint": "Check bots the student has defeated",
        "admin.modals.edit.puzzleRush": "Puzzle Rush",
        "admin.modals.edit.puzzleRushHint": "Enter the student's best Puzzle Rush score",
        "admin.modals.edit.puzzleRushScore": "Best Score",
        "admin.modals.edit.rating": "Rating",
        "admin.alert.addStudent": "Add Student functionality will be implemented in the next phase.\n\nThis will include:\n- Student information form\n- Photo upload\n- Branch and coach assignment\n- Initial level placement",
        "admin.alert.export": "Export functionality will be implemented soon.\n\nSupported formats:\n- Excel (.xlsx)\n- CSV\n- PDF Report",
        "admin.alert.coaches": "Coaches section will be implemented in the next phase.\n\nThis will include:\n- Coach list with statistics\n- Individual coach profiles\n- Student assignments\n- Performance metrics",
        "admin.alert.editStudent": "Edit functionality for student ID {{id}} will be implemented soon.\n\nFor now, this is a demo interface.",
        "admin.status.active": "Active",
        "admin.status.frozen": "Frozen",
        "admin.status.left": "Left",
        "admin.status.inactive": "Inactive",
        "admin.status.pending": "Pending",
        "admin.studentCard.status": "Status: {{status}}",
        "admin.studentCard.lesson": "Lesson {{current}} of {{total}}",
        "admin.studentCard.level": "Level {{level}}",
        "admin.studentCard.view": "View",
        "admin.studentCard.edit": "Edit",

        // Coach Management Modals
        "admin.modals.coach.addTitle": "Add New Coach",
        "admin.modals.coach.editTitle": "Edit Coach",
        "admin.modals.coach.coachInfo": "Coach Information",
        "admin.modals.coach.firstName": "First Name",
        "admin.modals.coach.lastName": "Last Name",
        "admin.modals.coach.firstNamePlaceholder": "Enter first name",
        "admin.modals.coach.lastNamePlaceholder": "Enter last name",
        "admin.modals.coach.contactInfo": "Contact Information",
        "admin.modals.coach.email": "Email",
        "admin.modals.coach.phone": "Phone",
        "admin.modals.coach.emailPlaceholder": "coach@example.com",
        "admin.modals.coach.phonePlaceholder": "+7 (XXX) XXX-XX-XX",
        "admin.modals.coach.branchAssignment": "Branch Assignment",
        "admin.modals.coach.branch": "Branch",
        "admin.modals.coach.branchSelect": "Select Branch",
        "admin.modals.coach.cancel": "Cancel",
        "admin.modals.coach.addSubmit": "Add Coach",
        "admin.modals.coach.editSubmit": "Save Changes",
        "admin.modals.coach.addSuccess": "Coach added successfully!",
        "admin.modals.coach.editSuccess": "Coach updated successfully!",
        "admin.modals.coach.deleteSuccess": "Coach deleted successfully!",
        "admin.modals.coach.deleteConfirm": "Are you sure you want to delete coach \"{{name}}\"?",
        "admin.modals.coach.deleteWarning": "Warning: This coach has {{count}} student(s) assigned. These students will need to be reassigned.",
        "admin.modals.coach.notFound": "Coach not found",
        "admin.modals.coach.photo": "Photo",
        "admin.modals.coach.uploadPhoto": "Upload Photo",
        "admin.modals.coach.removePhoto": "Remove",
        "admin.modals.coach.bio": "Bio",
        "admin.modals.coach.bioPlaceholder": "Tell us about your coaching experience...",
        "admin.modals.coach.socialLinks": "Social Links",
        "admin.modals.coach.selectBranch": "Select branch...",
        "admin.modals.coach.save": "Save Coach",

        // Coach Card translations
        "admin.coaches.noCoaches": "No coaches found",
        "admin.coaches.loadingData": "Coaches data is loading...",
        "admin.coaches.defaultBio": "Chess coach at Chess Empire",
        "admin.coaches.students": "Students",
        "admin.coaches.unassigned": "Unassigned",

        // Coach Profile Page
        "coach.title": "Coach Profile - Chess Empire",
        "coach.back": "Back",
        "coach.edit": "Edit",
        "coach.notFound": "Coach not found",
        "coach.noBranch": "No Branch",
        "coach.totalStudents": "Total Students",
        "coach.activeStudents": "Active",
        "coach.avgLevel": "Avg Level",
        "coach.titledStudents": "Titled",
        "coach.contactInfo": "Contact Information",
        "coach.myStudents": "My Students",
        "coach.level": "Level",
        "coach.andMore": "And {{count}} more students...",

        // Search Results
        "index.coaches": "Coaches",
        "index.students": "Students",
        "index.coachBadge": "Coach",
        "index.noResults": "No results found",

        // Branch Management Modals
        "admin.modals.branch.addTitle": "Add New Branch",
        "admin.modals.branch.editTitle": "Edit Branch",
        "admin.modals.branch.branchInfo": "Branch Information",
        "admin.modals.branch.name": "Branch Name",
        "admin.modals.branch.location": "Location",
        "admin.modals.branch.namePlaceholder": "Enter branch name",
        "admin.modals.branch.locationPlaceholder": "Enter location address",
        "admin.modals.branch.contactInfo": "Contact Information",
        "admin.modals.branch.email": "Email",
        "admin.modals.branch.phone": "Phone",
        "admin.modals.branch.emailPlaceholder": "branch@example.com",
        "admin.modals.branch.phonePlaceholder": "+7 (XXX) XXX-XX-XX",
        "admin.modals.branch.cancel": "Cancel",
        "admin.modals.branch.addSubmit": "Add Branch",
        "admin.modals.branch.editSubmit": "Save Changes",
        "admin.modals.branch.addSuccess": "Branch added successfully!",
        "admin.modals.branch.editSuccess": "Branch updated successfully!",
        "admin.modals.branch.deleteSuccess": "Branch deleted successfully!",
        "admin.modals.branch.deleteConfirm": "Are you sure you want to delete branch \"{{name}}\"?",
        "admin.modals.branch.deleteWarningStudents": "- {{count}} student(s)",
        "admin.modals.branch.deleteWarningCoaches": "- {{count}} coach(es)",
        "admin.modals.branch.deleteWarningReassign": "These will need to be reassigned.",
        "admin.modals.branch.notFound": "Branch not found",

        // Admin Logout
        "admin.logout.confirm": "Are you sure you want to logout?",

        // Language toggle
        "language.toggle.label": "Language",
        "language.toggle.english": "EN",
        "language.toggle.russian": "RU",

        // Login Page
        "login.backToHome": "Back to Home",
        "login.subtitle": "Sign in to your account",
        "login.emailLabel": "Email",
        "login.emailPlaceholder": "Enter your email",
        "login.passwordLabel": "Password",
        "login.passwordPlaceholder": "Enter your password",
        "login.signInButton": "Sign In",

        // Register Page
        "register.backToHome": "Back to Home",
        "register.subtitle": "Create your account",
        "register.emailLabel": "Email",
        "register.emailPlaceholder": "Enter your email",
        "register.passwordLabel": "Password",
        "register.passwordPlaceholder": "Create a strong password",
        "register.confirmPasswordLabel": "Confirm Password",
        "register.confirmPasswordPlaceholder": "Re-enter your password",
        "register.createAccountButton": "Create Account",

        // App Access Management
        "access.sidebar.appAccess": "App Access",
        "access.header.title": "App Access Management",
        "access.header.subtitle": "Manage user roles and permissions",
        "access.invite.title": "Invite New User",
        "access.invite.description": "Send an invitation email to grant access to the system",
        "access.invite.emailLabel": "Email Address",
        "access.invite.emailPlaceholder": "user@example.com",
        "access.invite.sendButton": "Send Invite",
        "access.users.title": "User Management",
        "access.users.description": "Manage existing user roles and permissions",
        "access.users.loading": "Loading users...",
        "access.users.empty": "No users found",
        "access.users.unknownUser": "Unknown User",
        "access.users.noEmail": "Email not available",
        "access.users.adminHint": "Administrators have full access to all features",
        "access.users.deleteUser": "Delete User",
        "access.users.confirmDelete": "Are you sure you want to delete user {{email}}?\n\nThis will:\n- Remove the user from the dashboard\n- Delete the user account from the database\n\nThis action cannot be undone.",
        "access.users.deleteSuccess": "User {{email}} deleted successfully",
        "access.users.deleteError": "Failed to delete user. Please try again.",
        "access.roles.admin": "Administrator",
        "access.roles.coach": "Coach",
        "access.roles.viewer": "Viewer",
        "access.permissions.manageAppAccess": "App Access",
        "access.permissions.editStudents": "Edit Students",
        "access.permissions.manageBranches": "Manage Branches",
        "access.permissions.manageCoaches": "Manage Coaches",
        "access.permissions.updated": "Permission updated successfully.",
        "access.invite.success": "Invitation sent successfully to {{email}}!",
        "access.invite.demoSuccess": "Demo mode: Invitation would be sent to {{email}}",

        // Tabs
        "tabs.overview": "Overview",
        "tabs.bots": "Bots",
        "tabs.puzzles": "Puzzles",
        "tabs.stats": "Stats",

        // Rankings
        "rankings.beginner": "Beginner",
        "rankings.noScore": "No Score",
        "rankings.inBranch": "in Branch",
        "rankings.inSchool": "in School",
        "rankings.levelInBranch": "by Level in Branch",
        "rankings.levelInSchool": "by Level in School",
        "rankings.topPercent": "Top {{percent}}%",
        "rankings.branchRank": "Branch Rank",
        "rankings.schoolRank": "School Rank",
        "rankings.ofTotal": "of {{total}}",
        "rankings.noRank": "No rank yet",

        // Bots
        "bots.progress": "Bot Progress",
        "bots.defeated": "Bots Defeated",
        "bots.strongestBot": "Strongest Bot",
        "bots.nextTarget": "Next Target",
        "bots.tierBeginner": "Beginner",
        "bots.tierIntermediate": "Intermediate",
        "bots.tierAdvanced": "Advanced",
        "bots.tierExpert": "Expert",
        "bots.tierMaster": "Master",
        "bots.tierGrandmaster": "Grandmaster",

        // Survival Mode
        "survival.bestScore": "Best Score",
        "survival.recentScores": "Recent Scores",
        "survival.mode3": "3 Lives",
        "survival.mode5": "5 Lives",

        // Puzzle Rush
        "puzzleRush.title": "Puzzle Rush",
        "puzzleRush.bestScore": "Survival - Best Score",
        "puzzleRush.level": "Level",
        "puzzleRush.target": "puzzles",
        "puzzleRush.completed": "Completed",
        "puzzleRush.nextTarget": "Next Target",
        "puzzleRush.locked": "Locked",
        "puzzleRush.levelsCompleted": "Levels Completed",
        "puzzleRush.tierBeginner": "Beginner",
        "puzzleRush.tierIntermediate": "Intermediate",
        "puzzleRush.tierAdvanced": "Advanced",
        "puzzleRush.tierExpert": "Expert",
        "puzzleRush.tierMaster": "Master",
        "puzzleRush.tierGrandmaster": "Grandmaster",
        "puzzleRush.progress": "Puzzle Rush Progress",

        // Stats
        "stats.rating": "Rating",
        "stats.ratingHistory": "Rating History",
        "stats.achievements": "Achievements",
        "stats.noAchievements": "No achievements earned yet",
        "stats.asOf": "As of",

        // Leagues
        "leagues.beginner": "Beginner",
        "leagues.leagueC": "League C",
        "leagues.leagueB": "League B",
        "leagues.leagueA": "League A",
        "leagues.leagueAPlus": "League A+",

        // Admin Ratings
        "admin.ratings.title": "Ratings Management",
        "admin.ratings.import": "Import Ratings",
        "admin.ratings.importCSV": "Import CSV",
        "admin.ratings.addRating": "Add/Update Rating",
        "admin.ratings.history": "Rating History",
        "admin.ratings.ratingHistory": "Rating History",
        "admin.ratings.currentRating": "Current Rating",
        "admin.ratings.league": "League",
        "admin.ratings.source": "Source",
        "admin.ratings.date": "Date",
        "admin.ratings.ratedStudents": "Rated Students",
        "admin.ratings.avgRating": "Average Rating",
        "admin.ratings.leagueA": "League A+/A",
        "admin.ratings.recentUpdates": "This Week",
        "admin.ratings.selectStudent": "Select Student",
        "admin.ratings.selectStudentPlaceholder": "Search and select student...",
        "admin.ratings.rating": "Rating",
        "admin.ratings.add": "Add",
        "admin.ratings.allRatings": "All Student Ratings",
        "admin.ratings.searchPlaceholder": "Search students...",
        "admin.ratings.lastUpdated": "Last Updated",
        "admin.ratings.viewHistory": "View History",
        "admin.ratings.edit": "Edit Rating",
        "admin.ratings.noRatingYet": "No rating recorded yet",
        "admin.ratings.noHistory": "No rating history available",
        "admin.ratings.selectStudentError": "Please select a student",
        "admin.ratings.invalidRating": "Invalid rating (must be 100-3000)",
        "admin.ratings.selectDateError": "Please select a date",
        "admin.ratings.ratingAdded": "Rating added successfully",
        "admin.ratings.functionNotAvailable": "Rating function not available",
        "admin.ratings.addError": "Error adding rating",
        "admin.ratings.loadError": "Error loading rating history",
        "admin.ratings.csvFormat": "CSV Format",
        "admin.ratings.csvFormatHint": "CSV should have columns: student_name (or first_name, last_name), rating, date (optional)",
        "admin.ratings.selectFile": "Select File",
        "admin.ratings.chooseFile": "Choose CSV File",
        "admin.ratings.preview": "Preview",
        "admin.ratings.csvEmpty": "CSV file is empty or has no data rows",
        "admin.ratings.csvMissingRating": "CSV must have a 'rating' column",
        "admin.ratings.csvMissingName": "CSV must have 'student_name' or 'first_name' and 'last_name' columns",
        "admin.ratings.studentNotFound": "Student not found",
        "admin.ratings.csvParseError": "Error parsing CSV file",
        "admin.ratings.noValidData": "No valid data to import",
        "admin.ratings.importComplete": "Import complete: {{success}} successful, {{errors}} errors",
        "admin.ratings.importError": "Error importing ratings",
        "admin.ratings.noRatingsYet": "No students with ratings yet",
        "admin.ratings.importHint": "Import ratings from Excel/CSV or add them manually above",
        "admin.ratings.importExcel": "Import Ratings from Excel/CSV",
        "admin.ratings.excelFormatHint": "Excel/CSV should have Name in column A and Rating in column B",
        "admin.ratings.unmatchedStudents": "Unmatched Students",
        "admin.ratings.unmatchedHint": "The following students from the rating list were not found in the database and were skipped:",
        "admin.ratings.totalUnmatched": "Total unmatched:",
        "admin.ratings.copyList": "Copy List",
        "admin.ratings.importSummary": "Imported {{matched}} ratings, skipped {{unmatched}} unmatched",
        "admin.ratings.listCopied": "List copied to clipboard",
        "admin.ratings.matched": "Matched",
        "admin.ratings.unmatched": "Not found",
        "admin.ratings.fileFormat": "Supported Formats",
        "admin.ratings.fileFormatHint": "Excel (.xlsx, .xls) or CSV with columns: Name (LastName FirstName), Rating",
        "admin.ratings.processing": "Processing...",
        "admin.ratings.importingRatings": "Importing ratings...",
        "admin.ratings.importComplete": "Import complete!",
        "admin.ratings.importFailed": "Import failed!",
        "admin.ratings.googleSheetUrl": "Google Sheets URL",
        "admin.ratings.googleSheetHint": "Sheet must be publicly accessible (shared with \"Anyone with the link\")",
        "admin.ratings.load": "Load",
        "admin.ratings.enterUrl": "Please enter a Google Sheets URL",
        "admin.ratings.invalidUrl": "Invalid Google Sheets URL",
        "admin.ratings.loading": "Loading spreadsheet...",
        "admin.ratings.loadSuccess": "Spreadsheet loaded successfully",
        "admin.ratings.loadFailed": "Failed to load spreadsheet",
        "admin.ratings.fetchFailed": "Failed to fetch spreadsheet. Make sure it is publicly accessible.",

        // Admin Attendance
        "admin.attendance.title": "Attendance Tracking",
        "admin.attendance.importExcel": "Import Excel",
        "admin.attendance.exportExcel": "Export Excel",
        "admin.attendance.selectBranch": "Select Branch",
        "admin.attendance.selectBranchPrompt": "Select a branch to view attendance",
        "admin.attendance.selectBranchError": "Please select a branch",
        "admin.attendance.selectFileError": "Please select an Excel file",
        "admin.attendance.monWed": "Mon-Wed",
        "admin.attendance.tueThu": "Tue-Thu",
        "admin.attendance.satSun": "Sat-Sun",
        "admin.attendance.schedule": "Schedule",
        "admin.attendance.allSchedules": "All Schedules",
        "admin.attendance.timeSlot": "Time Slot",
        "admin.attendance.month": "Month",
        "admin.attendance.allTimeSlots": "All Time Slots",
        "admin.attendance.totalSessions": "Total Sessions",
        "admin.attendance.avgRate": "Avg. Rate",
        "admin.attendance.lowAttendance": "Low Attendance",
        "admin.attendance.studentsTracked": "Students Tracked",
        "admin.attendance.noStudents": "No students found for this branch",
        "admin.attendance.noLowAttendance": "All students have good attendance",
        "admin.attendance.loadError": "Error loading attendance data",
        "admin.attendance.saveError": "Error saving attendance",
        "admin.attendance.importTitle": "Import Attendance from Excel",
        "admin.attendance.step1": "Upload File",
        "admin.attendance.step2": "Select Sheet",
        "admin.attendance.step3": "Match Names",
        "admin.attendance.branch": "Branch",
        "admin.attendance.uploadFile": "Upload Excel File",
        "admin.attendance.dragDrop": "Drag and drop .xlsx file here or",
        "admin.attendance.browseFiles": "browse files",
        "admin.attendance.sheetPreview": "Sheet Preview",
        "admin.attendance.emptySheet": "This sheet is empty",
        "admin.attendance.moreRows": "more rows",
        "admin.attendance.nameMatching": "Name Matching",
        "admin.attendance.excelName": "Name in Excel",
        "admin.attendance.matchedStudent": "Matched Student",
        "admin.attendance.status": "Status",
        "admin.attendance.actions": "Actions",
        "admin.attendance.selectStudent": "Select student...",
        "admin.attendance.matched": "Matched",
        "admin.attendance.unmatched": "Unmatched",
        "admin.attendance.match": "match",
        "admin.attendance.aliasMatch": "Alias Match",
        "admin.attendance.exactMatch": "Exact Match",
        "admin.attendance.saveAlias": "Save alias for future imports",
        "admin.attendance.aliasSaved": "Alias saved successfully",
        "admin.attendance.aliasSaveError": "Error saving alias",
        "admin.attendance.import": "Import",
        "admin.attendance.importData": "Import Data",
        "admin.attendance.noMatchedStudents": "No students matched - please match at least one student",
        "admin.attendance.branchNotFound": "Branch not found",
        "admin.attendance.parseError": "Error parsing Excel file",
        "admin.attendance.importSuccess": "Successfully imported {{count}} attendance records",
        "admin.attendance.importError": "Error importing attendance",
        "admin.attendance.exportSuccess": "Attendance exported successfully",
        "admin.attendance.exportError": "Error exporting attendance",
        "admin.attendance.invalidFileType": "Please select a valid .xlsx file",
        "admin.attendance.legend": "Legend",
        "admin.attendance.present": "Present",
        "admin.attendance.absent": "Absent",
        "admin.attendance.late": "Late",
        "admin.attendance.excused": "Excused",
        "admin.attendance.lowAttendanceAlerts": "Low Attendance Alerts",
        "admin.attendance.clickToChange": "Click cell to change status",
        "admin.attendance.noAlerts": "No low attendance alerts",
        "admin.attendance.hideEmptyRows": "Hide Empty Rows",
        "admin.attendance.step1Upload": "Upload File",
        "admin.attendance.step2Sheet": "Select Sheet",
        "admin.attendance.step3Match": "Match Names",
        "admin.attendance.selectBranchFirst": "Select Branch",
        "admin.attendance.uploadExcelFile": "Upload Excel File",
        "admin.attendance.excelFormatHint": "Upload attendance journal in .xlsx format (sheets: Mon-Wed, Tue-Thu, Sat-Sun)",
        "admin.attendance.chooseFile": "Choose Excel File",
        "admin.attendance.dragDropHint": "or drag and drop your file here",
        "admin.attendance.selectSheets": "Select Sheets to Import",
        "admin.attendance.sheetSelectionHint": "Choose which sheets contain attendance data to import.",
        "admin.attendance.selectSheetToPreview": "Select a sheet to preview",
        "admin.attendance.rowsFound": "rows found",
        "admin.attendance.datesFound": "dates found",
        "admin.attendance.matchStudentNames": "Match Student Names",
        "admin.attendance.nameMatchingHint": "Review and confirm the matching between Russian names from Excel and students in the database.",
        "admin.attendance.totalRecords": "Records",
        "admin.attendance.confidence": "Confidence",
        "admin.attendance.studentMoved": "Moved {name} to {slot}",
        "admin.attendance.slotFull": "This time slot is full (10 students max)",
        "admin.attendance.addStudent": "Add Student",
        "admin.attendance.addStudentToCalendar": "Add Student to Calendar",
        "admin.attendance.searchStudent": "Search student...",
        "admin.attendance.selectTimeSlot": "Select Time Slot",
        "admin.attendance.deleteFromCalendar": "Remove from calendar",
        "admin.attendance.studentAddedSuccess": "{name} added to calendar",
        "admin.attendance.more": "more",
        "admin.attendance.noStudentsFound": "No students found",
        "admin.attendance.selectStudentError": "Please select a student",
        "admin.attendance.selectScheduleError": "Please select a schedule",
        "admin.attendance.selectTimeSlotError": "Please select a time slot",
        "admin.attendance.addStudentError": "Error adding student",
        "admin.attendance.confirmDeleteStudent": "Are you sure you want to remove {name} from the calendar?",
        "admin.attendance.studentNotFound": "Student not found",
        "admin.attendance.deleteError": "Failed to remove student from calendar",
        "admin.attendance.studentDeleted": "{name} removed from calendar",
        "admin.attendance.saveFailed": "Warning: Could not save to database. Changes may not persist.",
        "admin.attendance.student": "Student",
        "admin.attendance.scheduleType": "Schedule",

        // Admin Bots
        "admin.bots.title": "Bot Battles",
        "admin.bots.defeated": "Defeated Bots",
        "admin.bots.addWin": "Add Win",
        "admin.bots.removeWin": "Remove Win",

        // Admin Survival
        "admin.survival.title": "Survival Scores",
        "admin.survival.addScore": "Add Score",
        "admin.survival.bestScore": "Best Score",

        // Coach Edit Controls
        "coach.clickToToggle": "Click on a bot to toggle defeated status",
        "coach.addScore": "Add New Score",
        "coach.scorePlaceholder": "Enter score...",
        "coach.add": "Add",
        "coach.noPermission": "You do not have permission to edit",
        "coach.noStudent": "No student selected",
        "coach.botAdded": "Added {{name}} to defeated bots",
        "coach.botRemoved": "Removed {{name}} from defeated bots",
        "coach.scoreAdded": "Score of {{score}} added successfully",
        "coach.updateFailed": "Failed to update",
        "coach.invalidScore": "Please enter a valid score (0-100)"
    },
    kk: {
        "common.brand": "Chess Empire",
        "common.brand.full": "Chess Empire - Оқушылар базасы",
        "common.login": "Кіру",
        "common.dashboard": "Панель",
        "common.backToSearch": "Іздеуге қайту",
        "common.backToDashboard": "Панельге оралу",
        "common.editBranch": "Бөлімшені өңдеу",
        "common.allStudents": "Барлық оқушылар",
        "common.coaches": "Тренерлер",
        "common.close": "Жабу",
        "common.branch": "Бөлімше",
        "common.phone": "Телефон",
        "common.email": "Email",
        "common.cancel": "Бас тарту",
        "common.next": "Келесі",
        "common.back": "Артқа",
        "common.saveChanges": "Өзгерістерді сақтау",
        "common.addStudent": "Оқушы қосу",
        "common.logout": "Шығу",
        "common.students": "Оқушылар",
        "common.level": "Деңгей",
        "common.razryad": "Разряд",
        "common.status": "Мәртебе",
        "common.actions": "Әрекеттер",
        "common.age": "Жасы",
        "common.search": "Іздеу",
        "common.searchStudentsPlaceholder": "Оқушыны іздеу...",
        "common.showingResults": "Көрсетілгені: {{count}} / {{total}} оқушы",
        "common.noData": "Дерек жоқ",
        "common.totalStudents": "Барлық оқушылар",
        "common.activeStudents": "Белсенді оқушылар",
        "common.totalCoaches": "Тренерлер",
        "common.totalBranches": "Бөлімшелер",
        "common.avgLevel": "Орташа деңгей",
        "common.levelDistribution": "Деңгейлер бойынша",
        "common.razryadDistribution": "Разряд бойынша",
        "common.studentsDistribution": "Оқушылар",
        "common.languageLabel": "Тіл",
        "common.languageEnglish": "English",
        "common.languageRussian": "Русский",
        "common.languageToggle": "Тілді ауыстыру",
        "common.loading": "Іздеу...",
        "common.years": "жас",
        "index.title": "Chess Empire - Оқушылар базасы",
        "index.searchPlaceholder": "Оқушыны іздеу...",
        "index.noStudents": "Оқушылар табылмады",
        "index.coachLabel": "Тренер: {{coach}}",
        "index.razryadBadge": "{{razryad}} разряд",
        "student.title": "Оқушы профилі - Chess Empire",
        "student.back": "Іздеуге қайту",
        "student.statusActive": "Белсенді оқушы",
        "student.age": "Жасы",
        "student.ageValue": "{{count}} жас",
        "student.dateOfBirth": "Туған күні",
        "student.calculatedAge": "Жасы: {{count}} жас",
        "student.branch": "Бөлімше",
        "student.coach": "Тренер",
        "student.razryad": "Разряд",
        "student.razryadNotYet": "Әзірге жоқ",
        "student.learningProgress": "Оқу барысы",
        "student.currentLevel": "Ағымдағы деңгей",
        "student.levelLabel": "Деңгей",
        "student.levelDetail": "{{current}} / 8 деңгей",
        "student.currentLesson": "Ағымдағы сабақ",
        "student.lessonDetail": "Сабақ {{current}} / {{total}}",
        "student.lessonsCompleted": "{{count}} сабақ аяқталды",
        "student.attendance": "Қатысуы 90%",
        "student.streak": "{{count}} апта қатар",
        "student.edit": "Өңдеу",
        "student.editProfile": "Оқушы профилін өңдеу",
        "student.firstName": "Аты",
        "student.lastName": "Тегі",
        "student.photoUrl": "Фото сілтемесі",
        "student.status": "Мәртебесі",
        "student.statusActive": "Белсенді",
        "student.statusInactive": "Белсенді емес",
        "student.statusGraduated": "Бітірген",
        "student.save": "Өзгерістерді сақтау",
        "student.editSuccess": "Оқушы профилі сәтті жаңартылды",
        "student.editError": "Оқушы профилін жаңарту сәтсіз аяқталды",
        "branch.title": "Бөлімше - Chess Empire",
        "branch.pageTitle": "{{branch}} - Chess Empire",
        "branch.back": "Панельге оралу",
        "branch.edit": "Бөлімшені өңдеу",
        "branch.totalStudents": "Барлық оқушылар",
        "branch.activeStudents": "Белсенді оқушылар",
        "branch.totalCoaches": "Тренерлер",
        "branch.avgLevel": "Орташа деңгей",
        "branch.coaches": "Тренерлер",
        "branch.students": "Барлық оқушылар",
        "branch.studentsAtLevel": "{{level}} деңгей оқушылары",
        "branch.noCoaches": "Бұл бөлімшеде тренерлер әлі жоқ.",
        "branch.noStudents": "Бұл бөлімшеде оқушылар жоқ.",
        "branch.coachCount": "{{count}} оқушы",
        "branch.studentMeta": "Жасы {{age}} • {{coach}}",
        "branch.studentLevel": "Деңгей {{level}}",
        "branch.alert.noBranch": "Бөлімше көрсетілмеген. Админ-панельге бағыттаймыз...",
        "branch.alert.notFound": "\"{{branch}}\" бөлімшесі табылмады. Админ-панельге қайтарамыз...",
        "branch.alert.coachSoon": "Тренер профилі жақында қолжетімді болады.\n\nТренер ID: {{id}}\n\nКөрсетіледі:\n- Тренер ақпараты\n- Оқушылар тізімі\n- Нәтиже статистикасы\n- Сабақ кестесі",
        "branch.razryadDistribution": "Разряд бойынша бөлу",
        "branch.levelDistribution": "Деңгейлер бойынша бөлу",
        "branch.ageDistribution": "Жас бойынша бөлу",
        "branch.studentsAtAge": "{{age}} жастағы оқушылар",
        "branch.chart.razryadLabels": ["КМС", "1-разряд", "2-разряд", "3-разряд", "4-разряд", "Разряд жоқ"],
        "branch.chart.studentsLabel": "Оқушылар саны",
        "branch.chart.tooltip": "Оқушылар: {{count}}",
        "branch.chart.tooltipWithPercent": "{{label}}: {{value}} ({{percent}}%)",
        "branch.chart.levelLabel": "Деңгей {{level}}",
        "admin.title": "Админ панелі - Chess Empire",
        "admin.sidebar.main": "Басты",
        "admin.sidebar.students": "Оқушылар",
        "admin.sidebar.branches": "Бөлімшелер",
        "admin.sidebar.coaches": "Тренерлер",
        "admin.sidebar.management": "Басқару",
        "admin.sidebar.manageCoaches": "Тренерлерді басқару",
        "admin.sidebar.manageBranches": "Бөлімшелерді басқару",
        "admin.sidebar.dataManagement": "Деректерді басқару",
        "admin.sidebar.attendance": "Қатысу",
        "admin.header.students": "Оқушылар",
        "admin.header.coaches": "Тренерлер",
        "admin.header.branches": "Бөлімшелер",
        "admin.header.settings": "Тағы",
        "admin.nav.students": "Оқушылар",
        "admin.nav.coaches": "Тренерлер",
        "admin.nav.branches": "Бөлімшелер",
        "admin.nav.settings": "Тағы",
        "admin.actions.addStudent": "Оқушы қосу",
        "admin.stats.branches": "Бөлімшелер",
        "admin.filters.status": "Мәртебе",
        "admin.filters.status.all": "Барлық оқушылар",
        "admin.filters.status.active": "Белсенді",
        "admin.filters.status.frozen": "Тоқтатылған",
        "admin.filters.status.left": "Кеткен",
        "admin.filters.branch": "Бөлімше",
        "admin.filters.branch.all": "Барлық бөлімшелер",
        "admin.filters.coach": "Тренер",
        "admin.filters.coach.all": "Барлық тренерлер",
        "admin.filters.level": "Деңгей",
        "admin.filters.level.all": "Барлық деңгейлер",
        "admin.filters.level.option": "Деңгей {{level}}",
        "admin.table.title": "Барлық оқушылар",
        "admin.table.student": "Оқушы",
        "admin.table.age": "Жасы",
        "admin.table.branch": "Бөлімше",
        "admin.table.coach": "Тренер",
        "admin.table.level": "Деңгей",
        "admin.table.razryad": "Разряд",
        "admin.table.status": "Мәртебе",
        "admin.table.actions": "Әрекеттер",
        "admin.table.pagination": "Көрсетілгені: {{count}} / {{total}} оқушы",
        "admin.branch.title": "Бөлімше атауы",
        "admin.branch.location": "Мекенжай",
        "admin.branch.phone": "Телефон",
        "admin.branch.email": "Email",
        "admin.modals.add.title": "Жаңа оқушы қосу",
        "admin.modals.add.studentInfo": "Оқушы ақпараты",
        "admin.modals.add.firstName": "Аты *",
        "admin.modals.add.lastName": "Тегі *",
        "admin.modals.add.firstNamePlaceholder": "Атын енгізіңіз",
        "admin.modals.add.lastNamePlaceholder": "Тегін енгізіңіз",
        "admin.modals.add.age": "Жасы *",
        "admin.modals.add.agePlaceholder": "Жасын енгізіңіз",
        "admin.modals.add.dateOfBirth": "Туған күні",
        "admin.modals.add.gender": "Жынысы",
        "admin.modals.add.genderSelect": "Жынысын таңдаңыз",
        "admin.modals.add.genderMale": "Ер",
        "admin.modals.add.genderFemale": "Әйел",
        "admin.modals.add.photo": "Оқушы фотосы",
        "admin.modals.add.uploadPhoto": "Фото жүктеу",
        "admin.modals.add.uploadHint": "JPG, PNG немесе GIF (2 МБ дейін)",
        "admin.modals.add.branchCoach": "Бөлімше және тренер",
        "admin.modals.add.branch": "Бөлімше *",
        "admin.modals.add.branchSelect": "Бөлімшені таңдаңыз",
        "admin.modals.add.coach": "Тренер *",
        "admin.modals.add.coachSelect": "Тренерді таңдаңыз",
        "admin.modals.add.levelPlacement": "Бастапқы деңгей",
        "admin.modals.add.razryad": "Разряд",
        "admin.modals.add.noRazryad": "Разряд жоқ",
        "admin.modals.add.razryadOption": "{{label}}",
        "admin.modals.add.status": "Мәртебе *",
        "admin.modals.add.statusActive": "Белсенді",
        "admin.modals.add.statusFrozen": "Мұздатылған",
        "admin.modals.add.statusLeft": "Кетті",
        "admin.modals.add.contact": "Байланыс ақпараты (міндетті емес)",
        "admin.modals.add.parentName": "Ата-ана/Қамқоршы аты",
        "admin.modals.add.parentPlaceholder": "Ата-ана атын енгізіңіз",
        "admin.modals.add.phone": "Телефон нөмірі",
        "admin.modals.add.phonePlaceholder": "+7 (XXX) XXX-XX-XX",
        "admin.modals.add.email": "Email",
        "admin.modals.add.emailPlaceholder": "student@example.com",
        "admin.modals.add.cancel": "Бас тарту",
        "admin.modals.add.submit": "Оқушы қосу",
        "admin.modals.edit.title": "Оқушыны өңдеу",
        "admin.modals.edit.save": "Сақтау",
        "admin.modals.edit.removePhoto": "Фотоны жою",
        "admin.modals.edit.level": "Деңгей және прогресс",
        "admin.modals.edit.currentLevel": "Ағымдағы деңгей",
        "admin.modals.edit.currentLesson": "Ағымдағы сабақ",
        "admin.modals.edit.botProgress": "Боттар прогресі",
        "admin.modals.edit.botProgressHint": "Оқушы жеңген боттарды белгілеңіз",
        "admin.modals.edit.puzzleRush": "Puzzle Rush",
        "admin.modals.edit.puzzleRushHint": "Оқушының ең жақсы Puzzle Rush нәтижесін енгізіңіз",
        "admin.modals.edit.puzzleRushScore": "Ең жақсы нәтиже",
        "admin.modals.edit.rating": "Рейтинг",
        "admin.alert.addStudent": "Оқушы қосу мүмкіндігі келесі кезеңде іске асады.\n\nЖоспарда:\n- Оқушы деректер формасы\n- Фото жүктеу\n- Бөлімше мен тренер тағайындау\n- Бастапқы деңгейді анықтау",
        "admin.alert.export": "Экспорт мүмкіндігі кейін қосылады.\n\nПішімдер:\n- Excel (.xlsx)\n- CSV\n- PDF есеп",
        "admin.alert.coaches": "Тренерлер бөлімі келесі кезеңде іске асады.\n\nЖоспарда:\n- Статистикасы бар тізім\n- Жеке тренер профилі\n- Оқушыларды бекіту\n- Нәтиже көрсеткіштері",
        "admin.alert.editStudent": "{{id}} ID оқушыны өңдеу кейінірек қолжетімді болады.\n\nҚазір бұл демо интерфейс.",
        "admin.empty.table": "Оқушылар табылмады",
        "admin.empty.hint": "Сүзгілерді немесе іздеу сұранысын өзгертіп көріңіз",
        "admin.coach.noStudents": "Бұл тренерге әлі оқушылар бекітілмеген",
        "admin.coach.kms": "Разрядтылар",
        "admin.coach.placeholder": "Тренер аты",
        "admin.status.active": "Белсенді",
        "admin.status.frozen": "Тоқтатылған",
        "admin.status.left": "Кеткен",
        "admin.status.inactive": "Белсенді емес",
        "admin.status.pending": "Күтуде",

        // Coach Management Modals (Kazakh)
        "admin.modals.coach.addTitle": "Жаңа тренер қосу",
        "admin.modals.coach.editTitle": "Тренерді өңдеу",
        "admin.modals.coach.coachInfo": "Тренер ақпараты",
        "admin.modals.coach.firstName": "Аты",
        "admin.modals.coach.lastName": "Тегі",
        "admin.modals.coach.firstNamePlaceholder": "Атын енгізіңіз",
        "admin.modals.coach.lastNamePlaceholder": "Тегін енгізіңіз",
        "admin.modals.coach.contactInfo": "Байланыс ақпараты",
        "admin.modals.coach.email": "Email",
        "admin.modals.coach.phone": "Телефон",
        "admin.modals.coach.emailPlaceholder": "coach@example.com",
        "admin.modals.coach.phonePlaceholder": "+7 (XXX) XXX-XX-XX",
        "admin.modals.coach.branchAssignment": "Бөлімше тағайындау",
        "admin.modals.coach.branch": "Бөлімше",
        "admin.modals.coach.branchSelect": "Бөлімшені таңдаңыз",
        "admin.modals.coach.cancel": "Бас тарту",
        "admin.modals.coach.addSubmit": "Тренер қосу",
        "admin.modals.coach.editSubmit": "Өзгерістерді сақтау",
        "admin.modals.coach.addSuccess": "Тренер сәтті қосылды!",
        "admin.modals.coach.editSuccess": "Тренер сәтті жаңартылды!",
        "admin.modals.coach.deleteSuccess": "Тренер сәтті жойылды!",
        "admin.modals.coach.deleteConfirm": "\"{{name}}\" тренерін жоюға сенімдісіз бе?",
        "admin.modals.coach.deleteWarning": "Ескерту: Бұл тренерге {{count}} оқушы бекітілген. Оларды басқа тренерге ауыстыру керек.",
        "admin.modals.coach.notFound": "Тренер табылмады",
        "admin.modals.coach.photo": "Фото",
        "admin.modals.coach.uploadPhoto": "Фото жүктеу",
        "admin.modals.coach.removePhoto": "Жою",
        "admin.modals.coach.bio": "Өмірбаян",
        "admin.modals.coach.bioPlaceholder": "Тренерлік тәжірибеңіз туралы айтып беріңіз...",
        "admin.modals.coach.socialLinks": "Әлеуметтік желілер",
        "admin.modals.coach.selectBranch": "Бөлімшені таңдаңыз...",
        "admin.modals.coach.save": "Тренерді сақтау",

        // Coach Card translations (Kazakh)
        "admin.coaches.noCoaches": "Тренерлер табылмады",
        "admin.coaches.loadingData": "Тренерлер деректері жүктелуде...",
        "admin.coaches.defaultBio": "Chess Empire шахмат тренері",
        "admin.coaches.students": "Оқушылар",
        "admin.coaches.unassigned": "Тағайындалмаған",

        // Coach Profile Page (Kazakh)
        "coach.title": "Тренер профилі - Chess Empire",
        "coach.back": "Артқа",
        "coach.edit": "Өңдеу",
        "coach.notFound": "Тренер табылмады",
        "coach.noBranch": "Бөлімшесіз",
        "coach.totalStudents": "Барлық оқушылар",
        "coach.activeStudents": "Белсенді",
        "coach.avgLevel": "Орт. деңгей",
        "coach.titledStudents": "Разрядтар",
        "coach.contactInfo": "Байланыс ақпараты",
        "coach.myStudents": "Менің оқушыларым",
        "coach.level": "Деңгей",
        "coach.andMore": "Және тағы {{count}} оқушы...",

        // Search Results (Kazakh)
        "index.coaches": "Тренерлер",
        "index.students": "Оқушылар",
        "index.coachBadge": "Тренер",
        "index.noResults": "Нәтиже табылмады",

        // Branch Management Modals (Kazakh)
        "admin.modals.branch.addTitle": "Жаңа бөлімше қосу",
        "admin.modals.branch.editTitle": "Бөлімшені өңдеу",
        "admin.modals.branch.branchInfo": "Бөлімше ақпараты",
        "admin.modals.branch.name": "Бөлімше атауы",
        "admin.modals.branch.location": "Мекенжай",
        "admin.modals.branch.namePlaceholder": "Бөлімше атауын енгізіңіз",
        "admin.modals.branch.locationPlaceholder": "Мекенжайды енгізіңіз",
        "admin.modals.branch.contactInfo": "Байланыс ақпараты",
        "admin.modals.branch.email": "Email",
        "admin.modals.branch.phone": "Телефон",
        "admin.modals.branch.emailPlaceholder": "branch@example.com",
        "admin.modals.branch.phonePlaceholder": "+7 (XXX) XXX-XX-XX",
        "admin.modals.branch.cancel": "Бас тарту",
        "admin.modals.branch.addSubmit": "Бөлімше қосу",
        "admin.modals.branch.editSubmit": "Өзгерістерді сақтау",
        "admin.modals.branch.addSuccess": "Бөлімше сәтті қосылды!",
        "admin.modals.branch.editSuccess": "Бөлімше сәтті жаңартылды!",
        "admin.modals.branch.deleteSuccess": "Бөлімше сәтті жойылды!",
        "admin.modals.branch.deleteConfirm": "\"{{name}}\" бөлімшесін жоюға сенімдісіз бе?",
        "admin.modals.branch.deleteWarningStudents": "- {{count}} оқушы",
        "admin.modals.branch.deleteWarningCoaches": "- {{count}} тренер",
        "admin.modals.branch.deleteWarningReassign": "Оларды басқа бөлімшеге ауыстыру керек.",
        "admin.modals.branch.notFound": "Бөлімше табылмады",
        "admin.status.inactive": "Белсенді емес",
        "admin.status.pending": "Күтілуде",
        "admin.studentCard.status": "Мәртебе: {{status}}",
        "admin.studentCard.lesson": "Сабақ {{current}} / {{total}}",
        "admin.studentCard.level": "Деңгей {{level}}",
        "admin.studentCard.view": "Ашу",
        "admin.studentCard.edit": "Өңдеу",

        // Admin Logout
        "admin.logout.confirm": "Шығуды растайсыз ба?",

        "language.toggle.label": "Тіл",
        "language.toggle.english": "EN",
        "language.toggle.russian": "RU",

        // Login Page
        "login.backToHome": "Басты бетке",
        "login.subtitle": "Аккаунтқа кіру",
        "login.emailLabel": "Email",
        "login.emailPlaceholder": "Email енгізіңіз",
        "login.passwordLabel": "Құпия сөз",
        "login.passwordPlaceholder": "Құпия сөзді енгізіңіз",
        "login.signInButton": "Кіру",

        // Register Page
        "register.backToHome": "Басты бетке",
        "register.subtitle": "Аккаунт жасаңыз",
        "register.emailLabel": "Email",
        "register.emailPlaceholder": "Email енгізіңіз",
        "register.passwordLabel": "Құпия сөз",
        "register.passwordPlaceholder": "Берік құпия сөз жасаңыз",
        "register.confirmPasswordLabel": "Құпия сөзді растаңыз",
        "register.confirmPasswordPlaceholder": "Құпия сөзді қайта енгізіңіз",
        "register.createAccountButton": "Аккаунт жасау",

        // App Access Management
        "access.sidebar.appAccess": "Қолданба қол жетімділігі",
        "access.header.title": "Қолданба қол жетімділігін басқару",
        "access.header.subtitle": "Пайдаланушы рөлдері мен рұқсаттарын басқару",
        "access.invite.title": "Жаңа пайдаланушыны шақыру",
        "access.invite.description": "Жүйеге қол жеткізу үшін шақыру хатын жіберіңіз",
        "access.invite.emailLabel": "Email мекенжайы",
        "access.invite.emailPlaceholder": "user@example.com",
        "access.invite.sendButton": "Шақыруды жіберу",
        "access.users.title": "Пайдаланушыларды басқару",
        "access.users.description": "Қолданыстағы пайдаланушы рөлдері мен рұқсаттарын басқару",
        "access.users.loading": "Пайдаланушылар жүктелуде...",
        "access.users.empty": "Пайдаланушылар табылмады",
        "access.users.unknownUser": "Белгісіз пайдаланушы",
        "access.users.noEmail": "Электрондық пошта қолжетімсіз",
        "access.users.adminHint": "Әкімшілер барлық мүмкіндіктерге толық қол жеткізе алады",
        "access.users.deleteUser": "Пайдаланушыны өшіру",
        "access.users.confirmDelete": "{{email}} пайдаланушысын өшіргіңіз келетініне сенімдісіз бе?\n\nБұл:\n- Пайдаланушыны басқару тақтасынан жояды\n- Пайдаланушы тіркелгісін дерекқордан жояды\n\nБұл әрекетті болдырмауға болмайды.",
        "access.users.deleteSuccess": "{{email}} пайдаланушысы сәтті өшірілді",
        "access.users.deleteError": "Пайдаланушыны өшіру сәтсіз аяқталды. Қайталап көріңіз.",
        "access.roles.admin": "Әкімші",
        "access.roles.coach": "Жаттықтырушы",
        "access.roles.viewer": "Қараушы",
        "access.permissions.manageAppAccess": "Қосымшаға қол жеткізу",
        "access.permissions.editStudents": "Оқушыларды өңдеу",
        "access.permissions.manageBranches": "Филиалдарды басқару",
        "access.permissions.manageCoaches": "Жаттықтырушыларды басқару",
        "access.permissions.updated": "Рұқсат сәтті жаңартылды.",
        "access.invite.success": "Шақыру хат {{email}} мекенжайына сәтті жіберілді!",
        "access.invite.demoSuccess": "Демо режимі: шақыру {{email}} мекенжайына жіберілер еді",

        // Tabs
        "tabs.overview": "Шолу",
        "tabs.bots": "Боттар",
        "tabs.puzzles": "Жұмбақтар",
        "tabs.stats": "Статистика",

        // Rankings
        "rankings.beginner": "Бастаушы",
        "rankings.noScore": "Ұпай жоқ",
        "rankings.inBranch": "бөлімшеде",
        "rankings.inSchool": "мектепте",
        "rankings.levelInBranch": "деңгей бойынша бөлімшеде",
        "rankings.levelInSchool": "деңгей бойынша мектепте",
        "rankings.topPercent": "Үздік {{percent}}%",
        "rankings.branchRank": "Бөлімше рангі",
        "rankings.schoolRank": "Мектеп рангі",
        "rankings.ofTotal": "{{total}} ішінде",
        "rankings.noRank": "Рейтинг жоқ",

        // Bots
        "bots.progress": "Бот прогресі",
        "bots.defeated": "Жеңілген боттар",
        "bots.strongestBot": "Ең күшті бот",
        "bots.nextTarget": "Келесі мақсат",
        "bots.tierBeginner": "Бастаушы",
        "bots.tierIntermediate": "Орташа",
        "bots.tierAdvanced": "Озық",
        "bots.tierExpert": "Сарапшы",
        "bots.tierMaster": "Шебер",
        "bots.tierGrandmaster": "Гроссмейстер",

        // Survival Mode
        "survival.bestScore": "Ең жақсы ұпай",
        "survival.recentScores": "Соңғы ұпайлар",
        "survival.mode3": "3 өмір",
        "survival.mode5": "5 өмір",

        // Puzzle Rush
        "puzzleRush.title": "Жылдам шешім",
        "puzzleRush.bestScore": "Аман қалу - Ең жақсы ұпай",
        "puzzleRush.level": "Деңгей",
        "puzzleRush.target": "жұмбақ",
        "puzzleRush.completed": "Орындалды",
        "puzzleRush.nextTarget": "Келесі мақсат",
        "puzzleRush.locked": "Құлыпталған",
        "puzzleRush.levelsCompleted": "Аяқталған деңгейлер",
        "puzzleRush.tierBeginner": "Бастаушы",
        "puzzleRush.tierIntermediate": "Орташа",
        "puzzleRush.tierAdvanced": "Озық",
        "puzzleRush.tierExpert": "Сарапшы",
        "puzzleRush.tierMaster": "Шебер",
        "puzzleRush.tierGrandmaster": "Гроссмейстер",
        "puzzleRush.progress": "Жылдам шешім прогресі",

        // Stats
        "stats.rating": "Рейтинг",
        "stats.ratingHistory": "Рейтинг тарихы",
        "stats.achievements": "Жетістіктер",
        "stats.noAchievements": "Әзірге жетістіктер жоқ",
        "stats.asOf": "Күні",

        // Leagues
        "leagues.beginner": "Бастаушы",
        "leagues.leagueC": "Лига C",
        "leagues.leagueB": "Лига B",
        "leagues.leagueA": "Лига A",
        "leagues.leagueAPlus": "Лига A+",

        // Admin Ratings
        "admin.ratings.title": "Рейтингтерді басқару",
        "admin.ratings.import": "Рейтингтерді импорттау",
        "admin.ratings.importCSV": "CSV импорттау",
        "admin.ratings.addRating": "Рейтинг қосу/жаңарту",
        "admin.ratings.history": "Рейтинг тарихы",
        "admin.ratings.ratingHistory": "Рейтинг тарихы",
        "admin.ratings.currentRating": "Ағымдағы рейтинг",
        "admin.ratings.league": "Лига",
        "admin.ratings.source": "Көзі",
        "admin.ratings.date": "Күні",
        "admin.ratings.ratedStudents": "Рейтингі бар оқушылар",
        "admin.ratings.avgRating": "Орташа рейтинг",
        "admin.ratings.leagueA": "Лига A+/A",
        "admin.ratings.recentUpdates": "Осы аптада",
        "admin.ratings.selectStudent": "Оқушыны таңдаңыз",
        "admin.ratings.selectStudentPlaceholder": "Оқушыны іздеп таңдаңыз...",
        "admin.ratings.rating": "Рейтинг",
        "admin.ratings.add": "Қосу",
        "admin.ratings.allRatings": "Барлық оқушы рейтингтері",
        "admin.ratings.searchPlaceholder": "Оқушыларды іздеу...",
        "admin.ratings.lastUpdated": "Соңғы жаңарту",
        "admin.ratings.viewHistory": "Тарихты көру",
        "admin.ratings.edit": "Рейтингті өңдеу",
        "admin.ratings.noRatingYet": "Рейтинг жазылмаған",
        "admin.ratings.noHistory": "Рейтинг тарихы жоқ",
        "admin.ratings.selectStudentError": "Оқушыны таңдаңыз",
        "admin.ratings.invalidRating": "Жарамсыз рейтинг (100-3000 болуы керек)",
        "admin.ratings.selectDateError": "Күнді таңдаңыз",
        "admin.ratings.ratingAdded": "Рейтинг сәтті қосылды",
        "admin.ratings.functionNotAvailable": "Рейтинг функциясы қолжетімді емес",
        "admin.ratings.addError": "Рейтинг қосу қатесі",
        "admin.ratings.loadError": "Рейтинг тарихын жүктеу қатесі",
        "admin.ratings.csvFormat": "CSV форматы",
        "admin.ratings.csvFormatHint": "CSV-де student_name (немесе first_name, last_name), rating, date (міндетті емес) бағандары болуы керек",
        "admin.ratings.selectFile": "Файлды таңдау",
        "admin.ratings.chooseFile": "CSV файлын таңдау",
        "admin.ratings.preview": "Алдын ала қарау",
        "admin.ratings.csvEmpty": "CSV файлы бос немесе деректер жолдары жоқ",
        "admin.ratings.csvMissingRating": "CSV-де 'rating' бағаны болуы керек",
        "admin.ratings.csvMissingName": "CSV-де 'student_name' немесе 'first_name' және 'last_name' бағандары болуы керек",
        "admin.ratings.studentNotFound": "Оқушы табылмады",
        "admin.ratings.csvParseError": "CSV файлын талдау қатесі",
        "admin.ratings.noValidData": "Импорттауға жарамды деректер жоқ",
        "admin.ratings.importComplete": "Импорт аяқталды: {{success}} сәтті, {{errors}} қате",
        "admin.ratings.importError": "Рейтингтерді импорттау қатесі",
        "admin.ratings.noRatingsYet": "Рейтингі бар оқушылар әлі жоқ",
        "admin.ratings.importHint": "Excel/CSV-ден рейтингтерді импорттаңыз немесе жоғарыда қолмен қосыңыз",
        "admin.ratings.importExcel": "Excel/CSV-ден рейтингтерді импорттау",
        "admin.ratings.excelFormatHint": "Excel/CSV A бағанында Аты, B бағанында Рейтинг болуы керек",
        "admin.ratings.unmatchedStudents": "Табылмаған оқушылар",
        "admin.ratings.unmatchedHint": "Рейтинг тізімінен келесі оқушылар дерекқорда табылмады және өткізілді:",
        "admin.ratings.totalUnmatched": "Барлық табылмаған:",
        "admin.ratings.copyList": "Тізімді көшіру",
        "admin.ratings.importSummary": "{{matched}} рейтинг импортталды, {{unmatched}} табылмады",
        "admin.ratings.listCopied": "Тізім буферге көшірілді",
        "admin.ratings.matched": "Табылды",
        "admin.ratings.unmatched": "Табылмады",
        "admin.ratings.fileFormat": "Қолдау көрсетілетін форматтар",
        "admin.ratings.fileFormatHint": "Excel (.xlsx, .xls) немесе CSV: Аты (Тегі Аты), Рейтинг",
        "admin.ratings.processing": "Өңдеу...",
        "admin.ratings.importingRatings": "Рейтингтер импортталуда...",
        "admin.ratings.importComplete": "Импорт аяқталды!",
        "admin.ratings.importFailed": "Импорт сәтсіз!",
        "admin.ratings.googleSheetUrl": "Google Sheets URL",
        "admin.ratings.googleSheetHint": "Парақ жалпыға қолжетімді болуы керек (\"Сілтемесі бар кез келген адам\" арқылы ортақ пайдалану)",
        "admin.ratings.load": "Жүктеу",
        "admin.ratings.enterUrl": "Google Sheets URL мекенжайын енгізіңіз",
        "admin.ratings.invalidUrl": "Google Sheets URL мекенжайы жарамсыз",
        "admin.ratings.loading": "Электрондық кесте жүктелуде...",
        "admin.ratings.loadSuccess": "Электрондық кесте сәтті жүктелді",
        "admin.ratings.loadFailed": "Электрондық кестені жүктеу сәтсіз аяқталды",
        "admin.ratings.fetchFailed": "Электрондық кестені алу сәтсіз. Оның жалпыға қолжетімді екеніне көз жеткізіңіз.",

        // Admin Attendance
        "admin.attendance.title": "Қатысуды бақылау",
        "admin.attendance.importExcel": "Excel импорттау",
        "admin.attendance.exportExcel": "Excel экспорттау",
        "admin.attendance.selectBranch": "Бөлімшені таңдаңыз",
        "admin.attendance.selectBranchPrompt": "Қатысуды көру үшін бөлімшені таңдаңыз",
        "admin.attendance.selectBranchError": "Бөлімшені таңдаңыз",
        "admin.attendance.selectFileError": "Excel файлын таңдаңыз",
        "admin.attendance.monWed": "Дс-Ср",
        "admin.attendance.tueThu": "Сс-Бс",
        "admin.attendance.satSun": "Сб-Жс",
        "admin.attendance.schedule": "Кесте",
        "admin.attendance.allSchedules": "Барлық кестелер",
        "admin.attendance.timeSlot": "Уақыт аралығы",
        "admin.attendance.month": "Ай",
        "admin.attendance.allTimeSlots": "Барлық уақыт аралығы",
        "admin.attendance.totalSessions": "Жалпы сабақтар",
        "admin.attendance.avgRate": "Орташа %",
        "admin.attendance.lowAttendance": "Төмен қатысу",
        "admin.attendance.studentsTracked": "Бақылаудағы оқушылар",
        "admin.attendance.noStudents": "Бұл бөлімшеде оқушылар табылмады",
        "admin.attendance.noLowAttendance": "Барлық оқушылардың қатысуы жақсы",
        "admin.attendance.loadError": "Қатысу деректерін жүктеу қатесі",
        "admin.attendance.saveError": "Қатысуды сақтау қатесі",
        "admin.attendance.importTitle": "Excel-ден қатысуды импорттау",
        "admin.attendance.step1": "Файлды жүктеу",
        "admin.attendance.step2": "Парақты таңдау",
        "admin.attendance.step3": "Аттарды сәйкестендіру",
        "admin.attendance.branch": "Бөлімше",
        "admin.attendance.uploadFile": "Excel файлын жүктеу",
        "admin.attendance.dragDrop": ".xlsx файлын мұнда сүйреңіз немесе",
        "admin.attendance.browseFiles": "файлдарды шолу",
        "admin.attendance.sheetPreview": "Парақты алдын ала қарау",
        "admin.attendance.emptySheet": "Бұл парақ бос",
        "admin.attendance.moreRows": "тағы жолдар",
        "admin.attendance.nameMatching": "Аттарды сәйкестендіру",
        "admin.attendance.excelName": "Excel-дегі аты",
        "admin.attendance.matchedStudent": "Сәйкес оқушы",
        "admin.attendance.status": "Күйі",
        "admin.attendance.actions": "Әрекеттер",
        "admin.attendance.selectStudent": "Оқушыны таңдаңыз...",
        "admin.attendance.matched": "Сәйкес келді",
        "admin.attendance.unmatched": "Сәйкес келмеді",
        "admin.attendance.match": "сәйкестік",
        "admin.attendance.aliasMatch": "Лақап ат сәйкестігі",
        "admin.attendance.exactMatch": "Нақты сәйкестік",
        "admin.attendance.saveAlias": "Болашақ импорттар үшін лақап атты сақтау",
        "admin.attendance.aliasSaved": "Лақап ат сәтті сақталды",
        "admin.attendance.aliasSaveError": "Лақап атты сақтау қатесі",
        "admin.attendance.import": "Импорттау",
        "admin.attendance.importData": "Деректерді импорттау",
        "admin.attendance.noMatchedStudents": "Сәйкес келген оқушылар жоқ - кем дегенде бір оқушыны сәйкестендіріңіз",
        "admin.attendance.branchNotFound": "Бөлімше табылмады",
        "admin.attendance.parseError": "Excel файлын талдау қатесі",
        "admin.attendance.importSuccess": "{{count}} қатысу жазбасы сәтті импортталды",
        "admin.attendance.importError": "Қатысуды импорттау қатесі",
        "admin.attendance.exportSuccess": "Қатысу сәтті экспортталды",
        "admin.attendance.exportError": "Қатысуды экспорттау қатесі",
        "admin.attendance.invalidFileType": "Жарамды .xlsx файлын таңдаңыз",
        "admin.attendance.legend": "Шартты белгілер",
        "admin.attendance.present": "Қатысты",
        "admin.attendance.absent": "Жоқ болды",
        "admin.attendance.late": "Кешікті",
        "admin.attendance.excused": "Рұқсатпен",
        "admin.attendance.lowAttendanceAlerts": "Төмен қатысу ескертулері",
        "admin.attendance.clickToChange": "Күйін өзгерту үшін ұяшықты басыңыз",
        "admin.attendance.noAlerts": "Төмен қатысу ескертулері жоқ",
        "admin.attendance.hideEmptyRows": "Бос жолдарды жасыру",
        "admin.attendance.step1Upload": "Файлды жүктеу",
        "admin.attendance.step2Sheet": "Парақты таңдау",
        "admin.attendance.step3Match": "Аттарды сәйкестендіру",
        "admin.attendance.selectBranchFirst": "Бөлімшені таңдаңыз",
        "admin.attendance.uploadExcelFile": "Excel файлын жүктеу",
        "admin.attendance.excelFormatHint": ".xlsx форматында қатысу журналын жүктеңіз (парақтар: Дс-Ср, Сс-Бс, Сб-Жс)",
        "admin.attendance.chooseFile": "Excel файлын таңдау",
        "admin.attendance.dragDropHint": "немесе файлыңызды мұнда сүйреп апарыңыз",
        "admin.attendance.selectSheets": "Импорттау үшін парақтарды таңдаңыз",
        "admin.attendance.sheetSelectionHint": "Қатысу деректерін қамтитын парақтарды таңдаңыз.",
        "admin.attendance.selectSheetToPreview": "Алдын ала қарау үшін парақты таңдаңыз",
        "admin.attendance.rowsFound": "жол табылды",
        "admin.attendance.datesFound": "күн табылды",
        "admin.attendance.matchStudentNames": "Оқушы аттарын сәйкестендіру",
        "admin.attendance.nameMatchingHint": "Excel-дегі орысша аттар мен деректер базасындағы оқушылар арасындағы сәйкестікті тексеріп, растаңыз.",
        "admin.attendance.totalRecords": "Жазбалар",
        "admin.attendance.confidence": "Сенімділік",
        "admin.attendance.studentMoved": "{name} {slot} слотына жылжытылды",
        "admin.attendance.slotFull": "Бұл слот толы (максимум 10 оқушы)",
        "admin.attendance.addStudent": "Оқушы қосу",
        "admin.attendance.addStudentToCalendar": "Оқушыны күнтізбеге қосу",
        "admin.attendance.searchStudent": "Оқушыны іздеу...",
        "admin.attendance.selectTimeSlot": "Уақыт аралығын таңдаңыз",
        "admin.attendance.deleteFromCalendar": "Күнтізбеден жою",
        "admin.attendance.studentAddedSuccess": "{name} күнтізбеге қосылды",
        "admin.attendance.more": "тағы",
        "admin.attendance.noStudentsFound": "Оқушылар табылмады",
        "admin.attendance.selectStudentError": "Оқушыны таңдаңыз",
        "admin.attendance.selectScheduleError": "Кестені таңдаңыз",
        "admin.attendance.selectTimeSlotError": "Уақыт аралығын таңдаңыз",
        "admin.attendance.addStudentError": "Оқушы қосу қатесі",
        "admin.attendance.confirmDeleteStudent": "{name} күнтізбеден жойғыңыз келетініне сенімдісіз бе?",
        "admin.attendance.studentNotFound": "Оқушы табылмады",
        "admin.attendance.deleteError": "Оқушыны күнтізбеден жою сәтсіз аяқталды",
        "admin.attendance.studentDeleted": "{name} күнтізбеден жойылды",
        "admin.attendance.saveFailed": "Ескерту: Деректер базасына сақталмады. Өзгерістер сақталмауы мүмкін.",
        "admin.attendance.student": "Оқушы",
        "admin.attendance.scheduleType": "Кесте",

        // Admin Bots
        "admin.bots.title": "Бот ұрыстары",
        "admin.bots.defeated": "Жеңілген боттар",
        "admin.bots.addWin": "Жеңіс қосу",
        "admin.bots.removeWin": "Жеңісті алып тастау",

        // Admin Survival
        "admin.survival.title": "Survival ұпайлары",
        "admin.survival.addScore": "Ұпай қосу",
        "admin.survival.bestScore": "Ең жақсы ұпай",

        // Coach Edit Controls
        "coach.clickToToggle": "Жеңілген күйін ауыстыру үшін ботқа басыңыз",
        "coach.addScore": "Жаңа ұпай қосу",
        "coach.scorePlaceholder": "Ұпайды енгізіңіз...",
        "coach.add": "Қосу",
        "coach.noPermission": "Өңдеуге рұқсатыңыз жоқ",
        "coach.noStudent": "Оқушы таңдалмаған",
        "coach.botAdded": "{{name}} жеңілген боттарға қосылды",
        "coach.botRemoved": "{{name}} жеңілген боттардан алынды",
        "coach.scoreAdded": "{{score}} ұпай сәтті қосылды",
        "coach.updateFailed": "Жаңарту сәтсіз аяқталды",
        "coach.invalidScore": "Жарамды ұпай енгізіңіз (0-100)"
    },
    ru: {
        // Common
        "common.brand": "Шахматная Империя",
        "common.brand.full": "Шахматная Империя — база учеников",
        "common.login": "Войти",
        "common.dashboard": "Панель",
        "common.backToSearch": "Назад к поиску",
        "common.backToDashboard": "Назад к панели",
        "common.editBranch": "Редактировать филиал",
        "common.allStudents": "Все ученики",
        "common.coaches": "Тренеры",
        "common.close": "Закрыть",
        "common.branch": "Филиал",
        "common.phone": "Телефон",
        "common.email": "E-mail",
        "common.cancel": "Отмена",
        "common.next": "Далее",
        "common.back": "Назад",
        "common.saveChanges": "Сохранить изменения",
        "common.addStudent": "Добавить ученика",
        "common.logout": "Выйти",
        "common.students": "Ученики",
        "common.level": "Ступень",
        "common.razryad": "Разряд",
        "common.status": "Статус",
        "common.actions": "Действия",
        "common.age": "Возраст",
        "common.search": "Поиск",
        "common.searchStudentsPlaceholder": "Поиск ученика...",
        "common.showingResults": "Показано {{count}} из {{total}} учеников",
        "common.noData": "Данные отсутствуют",
        "common.totalStudents": "Всего учеников",
        "common.activeStudents": "Активные ученики",
        "common.totalCoaches": "Тренеры",
        "common.totalBranches": "Филиалы",
        "common.avgLevel": "Средняя ступень",
        "common.levelDistribution": "Распределение по ступеням",
        "common.razryadDistribution": "Распределение по разрядам",
        "common.studentsDistribution": "Ученики",
        "common.languageLabel": "Язык",
        "common.languageEnglish": "English",
        "common.languageRussian": "Русский",
        "common.languageToggle": "Сменить язык",
        "common.loading": "Поиск...",
        "common.years": "лет",

        // Index
        "index.title": "Шахматная Империя — база учеников",
        "index.searchPlaceholder": "Найдите ученика...",
        "index.noStudents": "Ученики не найдены",
        "index.coachLabel": "Тренер: {{coach}}",
        "index.razryadBadge": "{{razryad}} разряд",

        // Student Page
        "student.title": "Профиль ученика — Шахматная Империя",
        "student.back": "Назад к поиску",
        "student.statusActive": "Активный ученик",
        "student.age": "Возраст",
        "student.ageValue": "{{count}} лет",
        "student.dateOfBirth": "Дата рождения",
        "student.calculatedAge": "Возраст: {{count}} лет",
        "student.branch": "Филиал",
        "student.coach": "Тренер",
        "student.razryad": "Разряд",
        "student.razryadNotYet": "Пока нет",
        "student.learningProgress": "Прогресс обучения",
        "student.currentLevel": "Текущая ступень",
        "student.levelLabel": "Ступень",
        "student.levelDetail": "Ступень {{current}} из 8",
        "student.currentLesson": "Текущее занятие",
        "student.lessonDetail": "Урок {{current}} из {{total}}",
        "student.lessonsCompleted": "Пройдено занятий: {{count}}",
        "student.attendance": "Посещаемость 90%",
        "student.streak": "Серия 5 недель",
        "student.edit": "Редактировать",
        "student.editProfile": "Редактировать профиль ученика",
        "student.firstName": "Имя",
        "student.lastName": "Фамилия",
        "student.photoUrl": "URL фотографии",
        "student.status": "Статус",
        "student.statusInactive": "Неактивный",
        "student.statusGraduated": "Выпускник",
        "student.save": "Сохранить изменения",
        "student.editSuccess": "Профиль ученика успешно обновлен",
        "student.editError": "Не удалось обновить профиль ученика",

        // Branch Page
        "branch.title": "Филиал — Шахматная Империя",
        "branch.pageTitle": "{{branch}} — Шахматная Империя",
        "branch.back": "Назад к панели",
        "branch.edit": "Редактировать филиал",
        "branch.totalStudents": "Всего учеников",
        "branch.activeStudents": "Активные ученики",
        "branch.totalCoaches": "Тренеры",
        "branch.avgLevel": "Средняя ступень",
        "branch.coaches": "Тренеры",
        "branch.students": "Все ученики",
        "branch.studentsAtLevel": "Ученики {{level}} ступени",
        "branch.noCoaches": "В этом филиале пока нет тренеров.",
        "branch.noStudents": "В этом филиале пока нет учеников.",
        "branch.coachCount": "{{count}} учеников",
        "branch.studentMeta": "Возраст {{age}} • {{coach}}",
        "branch.studentLevel": "Ступень {{level}}",
        "branch.alert.noBranch": "Филиал не указан. Переадресация в панель администратора...",
        "branch.alert.notFound": "Филиал \"{{branch}}\" не найден. Возврат в панель администратора...",
        "branch.alert.coachSoon": "Страница тренера появится позже.\n\nID тренера: {{id}}\n\nПланируется показать:\n- Информацию о тренере\n- Список учеников\n- Показатели эффективности\n- Расписание занятий",
        "branch.alert.editPending": "Редактирование филиала появится позже.",
        "branch.razryadDistribution": "Разрядники",
        "branch.levelDistribution": "Распределение Ступеней",
        "branch.ageDistribution": "Распределение по возрасту",
        "branch.studentsAtAge": "Ученики возраста {{age}}",
        "branch.chart.razryadLabels": ["КМС", "1 разряд", "2 разряд", "3 разряд", "4 разряд", "Без разряда"],
        "branch.chart.studentsLabel": "Количество учеников",
        "branch.chart.tooltip": "Ученики: {{count}}",
        "branch.chart.tooltipWithPercent": "{{label}}: {{value}} ({{percent}}%)",
        "branch.chart.levelLabel": "Ступень {{level}}",

        // Admin Dashboard
        "admin.title": "Панель администратора — Шахматная Империя",
        "admin.sidebar.main": "Главное",
        "admin.sidebar.students": "Ученики",
        "admin.sidebar.branches": "Филиалы",
        "admin.sidebar.coaches": "Тренеры",
        "admin.sidebar.management": "Управление",
        "admin.sidebar.manageCoaches": "Управление тренерами",
        "admin.sidebar.manageBranches": "Управление филиалами",
        "admin.sidebar.dataManagement": "Управление данными",
        "admin.sidebar.attendance": "Посещаемость",
        "admin.header.students": "Ученики",
        "admin.header.coaches": "Тренеры",
        "admin.header.attendance": "Посещаемость",
        "admin.header.settings": "Ещё",
        "admin.nav.students": "Ученики",
        "admin.nav.coaches": "Тренеры",
        "admin.nav.attendance": "Посещаемость",
        "admin.nav.settings": "Ещё",
        "admin.actions.addStudent": "Добавить ученика",
        "admin.stats.branches": "Филиалы",
        "admin.filters.status": "Статус",
        "admin.filters.status.all": "Все ученики",
        "admin.filters.status.active": "Активные",
        "admin.filters.status.frozen": "Замороженные",
        "admin.filters.status.left": "Ушедшие",
        "admin.filters.branch": "Филиал",
        "admin.filters.branch.all": "Все филиалы",
        "admin.filters.coach": "Тренер",
        "admin.filters.coach.all": "Все тренеры",
        "admin.filters.level": "Ступень",
        "admin.filters.level.all": "Все ступени",
        "admin.filters.level.option": "Ступень {{level}}",
        "admin.table.title": "Все ученики",
        "admin.table.student": "Ученик",
        "admin.table.age": "Возраст",
        "admin.table.branch": "Филиал",
        "admin.table.coach": "Тренер",
        "admin.table.level": "Ступень",
        "admin.table.razryad": "Разряд",
        "admin.table.status": "Статус",
        "admin.table.actions": "Действия",
        "admin.table.pagination": "Показано {{count}} из {{total}} учеников",
        "admin.empty.table": "Ученики не найдены",
        "admin.empty.hint": "Попробуйте изменить фильтры или запрос",
        "admin.coach.noStudents": "К этому тренеру пока не прикреплены ученики",
        "admin.coach.kms": "Разрядники",
        "admin.coach.placeholder": "Имя тренера",
        "admin.form.fileTooLarge": "Размер файла должен быть меньше 2 МБ",
        "admin.form.imageRequired": "Выберите файл изображения",
        "admin.form.photoUploadFailed": "Не удалось загрузить фото, ученик сохранен без фото",
        "admin.form.requiredFields": "Заполните все обязательные поля",
        "admin.form.addSuccess": "Ученик успешно добавлен!",
        "admin.form.editSuccess": "Данные ученика обновлены!",
        "admin.form.deleteSuccess": "Ученик успешно удален!",
        "admin.error.studentNotFound": "Ученик не найден",
        "admin.branches.management": "Управление филиалами",
        "admin.branches.addBranch": "Добавить филиал",
        "admin.branches.totalBranches": "Всего филиалов",
        "admin.branches.totalStudents": "Всего учеников",
        "admin.branches.tableStudents": "Ученики",
        "admin.branches.tableCoaches": "Тренеры",
        "admin.coaches.management": "Управление тренерами",
        "admin.coaches.addCoach": "Добавить тренера",
        "admin.coaches.totalCoaches": "Всего тренеров",
        "admin.coaches.tableCoach": "Тренер",
        "admin.data.management": "Управление данными",
        "admin.data.export": "Экспорт данных",
        "admin.data.exportDesc": "Скачать все данные в формате JSON",
        "admin.data.import": "Импорт данных",
        "admin.data.importDesc": "Загрузить файл данных JSON",
        "admin.data.reset": "Сброс данных",
        "admin.data.resetDesc": "Восстановить данные по умолчанию",
        "admin.data.statistics": "Текущая статистика базы данных",
        "admin.branch.title": "Название филиала",
        "admin.branch.location": "Адрес",
        "admin.branch.phone": "Телефон",
        "admin.branch.email": "E-mail",
        "admin.modals.add.title": "Добавить нового ученика",
        "admin.modals.add.studentInfo": "Информация об ученике",
        "admin.modals.add.firstName": "Имя *",
        "admin.modals.add.lastName": "Фамилия *",
        "admin.modals.add.firstNamePlaceholder": "Введите имя",
        "admin.modals.add.lastNamePlaceholder": "Введите фамилию",
        "admin.modals.add.age": "Возраст *",
        "admin.modals.add.agePlaceholder": "Введите возраст",
        "admin.modals.add.dateOfBirth": "Дата рождения",
        "admin.modals.add.gender": "Пол",
        "admin.modals.add.genderSelect": "Выберите пол",
        "admin.modals.add.genderMale": "Мужской",
        "admin.modals.add.genderFemale": "Женский",
        "admin.modals.add.photo": "Фотография ученика",
        "admin.modals.add.uploadPhoto": "Загрузить фото",
        "admin.modals.add.uploadHint": "JPG, PNG или GIF (до 2 МБ)",
        "admin.modals.add.branchCoach": "Филиал и тренер",
        "admin.modals.add.branch": "Филиал *",
        "admin.modals.add.branchSelect": "Выберите филиал",
        "admin.modals.add.coach": "Тренер *",
        "admin.modals.add.coachSelect": "Выберите тренера",
        "admin.modals.add.levelPlacement": "Начальная ступень",
        "admin.modals.add.razryad": "Разряд",
        "admin.modals.add.noRazryad": "Разряд пока не присвоен",
        "admin.modals.add.razryadOption": "{{label}}",
        "admin.modals.add.status": "Статус *",
        "admin.modals.add.statusActive": "Активен",
        "admin.modals.add.statusFrozen": "Заморожен",
        "admin.modals.add.statusLeft": "Ушел",
        "admin.modals.add.contact": "Контактная информация (необязательно)",
        "admin.modals.add.parentName": "Имя родителя/опекуна",
        "admin.modals.add.parentPlaceholder": "Введите имя родителя",
        "admin.modals.add.phone": "Номер телефона",
        "admin.modals.add.phonePlaceholder": "+7 (XXX) XXX-XX-XX",
        "admin.modals.add.email": "E-mail",
        "admin.modals.add.emailPlaceholder": "student@example.com",
        "admin.modals.add.cancel": "Отмена",
        "admin.modals.add.submit": "Добавить ученика",
        "admin.razryad.none": "Разряд пока не присвоен",
        "admin.razryad.4th": "4 разряд",
        "admin.razryad.3rd": "3 разряд",
        "admin.razryad.2nd": "2 разряд",
        "admin.razryad.1st": "1 разряд",
        "admin.razryad.kms": "КМС (кандидат в мастера)",
        "admin.modals.edit.title": "Редактировать ученика",
        "admin.modals.edit.save": "Сохранить изменения",
        "admin.modals.edit.removePhoto": "Удалить фото",
        "admin.modals.edit.level": "Ступень и прогресс",
        "admin.modals.edit.currentLevel": "Текущая ступень",
        "admin.modals.edit.currentLesson": "Текущее занятие",
        "admin.modals.edit.agePlaceholder": "Введите возраст",
        "admin.modals.edit.genderUnknown": "Не указано",
        "admin.modals.edit.levelPlaceholder": "1-10",
        "admin.modals.edit.lessonPlaceholder": "1-40",
        "admin.modals.edit.botProgress": "Прогресс по ботам",
        "admin.modals.edit.botProgressHint": "Отметьте ботов, которых победил ученик",
        "admin.modals.edit.puzzleRush": "Puzzle Rush",
        "admin.modals.edit.puzzleRushHint": "Введите лучший результат Puzzle Rush ученика",
        "admin.modals.edit.puzzleRushScore": "Лучший результат",
        "admin.modals.edit.rating": "Рейтинг",
        "admin.alert.addStudent": "Функция добавления ученика появится в следующей версии.\n\nПланируется:\n- Форма с данными ученика\n- Загрузка фото\n- Назначение филиала и тренера\n- Определение стартовой ступени",
        "admin.alert.export": "Экспорт данных появится позже.\n\nБудут поддерживаться форматы:\n- Excel (.xlsx)\n- CSV\n- PDF-отчет",
        "admin.alert.coaches": "Раздел тренеров будет реализован в следующей версии.\n\nПланируется:\n- Список тренеров со статистикой\n- Отдельные профили\n- Закрепленные ученики\n- Показатели эффективности",
        "admin.alert.editStudent": "Редактирование ученика с ID {{id}} будет добавлено позднее.\n\nСейчас интерфейс демонстрационный.",
        "admin.status.active": "Активен",
        "admin.status.frozen": "Заморожен",
        "admin.status.left": "Ушел",
        "admin.status.inactive": "Неактивен",
        "admin.status.pending": "В ожидании",
        "admin.studentCard.status": "Статус: {{status}}",
        "admin.studentCard.lesson": "Урок {{current}} из {{total}}",
        "admin.studentCard.level": "Ступень {{level}}",
        "admin.studentCard.view": "Открыть",
        "admin.studentCard.edit": "Редактировать",

        // Coach Management Modals (Russian)
        "admin.modals.coach.addTitle": "Добавить нового тренера",
        "admin.modals.coach.editTitle": "Редактировать тренера",
        "admin.modals.coach.coachInfo": "Информация о тренере",
        "admin.modals.coach.firstName": "Имя",
        "admin.modals.coach.lastName": "Фамилия",
        "admin.modals.coach.firstNamePlaceholder": "Введите имя",
        "admin.modals.coach.lastNamePlaceholder": "Введите фамилию",
        "admin.modals.coach.contactInfo": "Контактная информация",
        "admin.modals.coach.email": "E-mail",
        "admin.modals.coach.phone": "Телефон",
        "admin.modals.coach.emailPlaceholder": "coach@example.com",
        "admin.modals.coach.phonePlaceholder": "+7 (XXX) XXX-XX-XX",
        "admin.modals.coach.branchAssignment": "Назначение филиала",
        "admin.modals.coach.branch": "Филиал",
        "admin.modals.coach.branchSelect": "Выберите филиал",
        "admin.modals.coach.cancel": "Отмена",
        "admin.modals.coach.addSubmit": "Добавить тренера",
        "admin.modals.coach.editSubmit": "Сохранить изменения",
        "admin.modals.coach.addSuccess": "Тренер успешно добавлен!",
        "admin.modals.coach.editSuccess": "Тренер успешно обновлен!",
        "admin.modals.coach.deleteSuccess": "Тренер успешно удален!",
        "admin.modals.coach.deleteConfirm": "Вы уверены, что хотите удалить тренера \"{{name}}\"?",
        "admin.modals.coach.deleteWarning": "Внимание: К этому тренеру прикреплено {{count}} ученик(ов). Их нужно будет переназначить.",
        "admin.modals.coach.notFound": "Тренер не найден",
        "admin.modals.coach.photo": "Фото",
        "admin.modals.coach.uploadPhoto": "Загрузить фото",
        "admin.modals.coach.removePhoto": "Удалить",
        "admin.modals.coach.bio": "Биография",
        "admin.modals.coach.bioPlaceholder": "Расскажите о своём тренерском опыте...",
        "admin.modals.coach.socialLinks": "Социальные сети",
        "admin.modals.coach.selectBranch": "Выберите филиал...",
        "admin.modals.coach.save": "Сохранить тренера",

        // Coach Card translations (Russian)
        "admin.coaches.noCoaches": "Тренеры не найдены",
        "admin.coaches.loadingData": "Данные тренеров загружаются...",
        "admin.coaches.defaultBio": "Тренер по шахматам Chess Empire",
        "admin.coaches.students": "Ученики",
        "admin.coaches.unassigned": "Не назначен",

        // Coach Profile Page (Russian)
        "coach.title": "Профиль тренера - Chess Empire",
        "coach.back": "Назад",
        "coach.edit": "Редактировать",
        "coach.notFound": "Тренер не найден",
        "coach.noBranch": "Без филиала",
        "coach.totalStudents": "Всего учеников",
        "coach.activeStudents": "Активных",
        "coach.avgLevel": "Ср. ступень",
        "coach.titledStudents": "Разрядников",
        "coach.contactInfo": "Контактная информация",
        "coach.myStudents": "Мои ученики",
        "coach.level": "Уровень",
        "coach.andMore": "И ещё {{count}} учеников...",

        // Search Results (Russian)
        "index.coaches": "Тренеры",
        "index.students": "Ученики",
        "index.coachBadge": "Тренер",
        "index.noResults": "Ничего не найдено",

        // Branch Management Modals (Russian)
        "admin.modals.branch.addTitle": "Добавить новый филиал",
        "admin.modals.branch.editTitle": "Редактировать филиал",
        "admin.modals.branch.branchInfo": "Информация о филиале",
        "admin.modals.branch.name": "Название филиала",
        "admin.modals.branch.location": "Адрес",
        "admin.modals.branch.namePlaceholder": "Введите название филиала",
        "admin.modals.branch.locationPlaceholder": "Введите адрес",
        "admin.modals.branch.contactInfo": "Контактная информация",
        "admin.modals.branch.email": "E-mail",
        "admin.modals.branch.phone": "Телефон",
        "admin.modals.branch.emailPlaceholder": "branch@example.com",
        "admin.modals.branch.phonePlaceholder": "+7 (XXX) XXX-XX-XX",
        "admin.modals.branch.cancel": "Отмена",
        "admin.modals.branch.addSubmit": "Добавить филиал",
        "admin.modals.branch.editSubmit": "Сохранить изменения",
        "admin.modals.branch.addSuccess": "Филиал успешно добавлен!",
        "admin.modals.branch.editSuccess": "Филиал успешно обновлен!",
        "admin.modals.branch.deleteSuccess": "Филиал успешно удален!",
        "admin.modals.branch.deleteConfirm": "Вы уверены, что хотите удалить филиал \"{{name}}\"?",
        "admin.modals.branch.deleteWarningStudents": "- {{count}} ученик(ов)",
        "admin.modals.branch.deleteWarningCoaches": "- {{count}} тренер(ов)",
        "admin.modals.branch.deleteWarningReassign": "Их нужно будет переназначить.",
        "admin.modals.branch.notFound": "Филиал не найден",

        // Admin Logout
        "admin.logout.confirm": "Вы уверены, что хотите выйти?",

        // Language toggle
        "language.toggle.label": "Язык",
        "language.toggle.english": "EN",
        "language.toggle.russian": "RU",

        // Login Page
        "login.backToHome": "Назад на главную",
        "login.subtitle": "Войдите в свой аккаунт",
        "login.emailLabel": "E-mail",
        "login.emailPlaceholder": "Введите ваш e-mail",
        "login.passwordLabel": "Пароль",
        "login.passwordPlaceholder": "Введите ваш пароль",
        "login.signInButton": "Войти",

        // Register Page
        "register.backToHome": "Назад на главную",
        "register.subtitle": "Создайте свой аккаунт",
        "register.emailLabel": "E-mail",
        "register.emailPlaceholder": "Введите ваш e-mail",
        "register.passwordLabel": "Пароль",
        "register.passwordPlaceholder": "Создайте надёжный пароль",
        "register.confirmPasswordLabel": "Подтвердите пароль",
        "register.confirmPasswordPlaceholder": "Введите пароль ещё раз",
        "register.createAccountButton": "Создать аккаунт",

        // App Access Management
        "access.sidebar.appAccess": "Доступ к приложению",
        "access.header.title": "Управление доступом",
        "access.header.subtitle": "Управление ролями и правами пользователей",
        "access.invite.title": "Пригласить нового пользователя",
        "access.invite.description": "Отправьте приглашение для предоставления доступа к системе",
        "access.invite.emailLabel": "Email адрес",
        "access.invite.emailPlaceholder": "user@example.com",
        "access.invite.sendButton": "Отправить приглашение",
        "access.users.title": "Управление пользователями",
        "access.users.description": "Управление ролями и правами существующих пользователей",
        "access.users.loading": "Загрузка пользователей...",
        "access.users.empty": "Пользователи не найдены",
        "access.users.unknownUser": "Неизвестный пользователь",
        "access.users.noEmail": "Эл. почта недоступна",
        "access.users.adminHint": "Администраторы имеют полный доступ ко всем функциям",
        "access.users.deleteUser": "Удалить пользователя",
        "access.users.confirmDelete": "Вы уверены, что хотите удалить пользователя {{email}}?\n\nЭто приведет к:\n- Удалению пользователя из панели управления\n- Удалению учетной записи из базы данных\n\nЭто действие необратимо.",
        "access.users.deleteSuccess": "Пользователь {{email}} успешно удален",
        "access.users.deleteError": "Не удалось удалить пользователя. Попробуйте еще раз.",
        "access.roles.admin": "Администратор",
        "access.roles.coach": "Тренер",
        "access.roles.viewer": "Наблюдатель",
        "access.permissions.manageAppAccess": "Доступ к приложению",
        "access.permissions.editStudents": "Редактировать учеников",
        "access.permissions.manageBranches": "Управлять филиалами",
        "access.permissions.manageCoaches": "Управлять тренерами",
        "access.permissions.updated": "Права успешно обновлены.",
        "access.invite.success": "Приглашение успешно отправлено на {{email}}!",
        "access.invite.demoSuccess": "Демо-режим: приглашение было бы отправлено на {{email}}",

        // Tabs
        "tabs.overview": "Обзор",
        "tabs.bots": "Боты",
        "tabs.puzzles": "Задачи",
        "tabs.stats": "Статистика",

        // Rankings
        "rankings.beginner": "Начинающий",
        "rankings.noScore": "Нет результата",
        "rankings.inBranch": "в филиале",
        "rankings.inSchool": "в школе",
        "rankings.levelInBranch": "по уровню в филиале",
        "rankings.levelInSchool": "по уровню в школе",
        "rankings.topPercent": "Топ {{percent}}%",
        "rankings.branchRank": "Ранг в филиале",
        "rankings.schoolRank": "Ранг в школе",
        "rankings.ofTotal": "из {{total}}",
        "rankings.noRank": "Нет рейтинга",

        // Bots
        "bots.progress": "Прогресс ботов",
        "bots.defeated": "Побеждено ботов",
        "bots.strongestBot": "Сильнейший бот",
        "bots.nextTarget": "Следующая цель",
        "bots.tierBeginner": "Начинающий",
        "bots.tierIntermediate": "Средний",
        "bots.tierAdvanced": "Продвинутый",
        "bots.tierExpert": "Эксперт",
        "bots.tierMaster": "Мастер",
        "bots.tierGrandmaster": "Гроссмейстер",

        // Survival Mode
        "survival.bestScore": "Лучший результат",
        "survival.recentScores": "Последние результаты",
        "survival.mode3": "3 жизни",
        "survival.mode5": "5 жизней",

        // Puzzle Rush
        "puzzleRush.title": "Выживание",
        "puzzleRush.bestScore": "Выживание - Лучший результат",
        "puzzleRush.level": "Уровень",
        "puzzleRush.target": "задач",
        "puzzleRush.completed": "Выполнено",
        "puzzleRush.nextTarget": "Следующая цель",
        "puzzleRush.locked": "Закрыто",
        "puzzleRush.levelsCompleted": "Уровней пройдено",
        "puzzleRush.tierBeginner": "Начинающий",
        "puzzleRush.tierIntermediate": "Средний",
        "puzzleRush.tierAdvanced": "Продвинутый",
        "puzzleRush.tierExpert": "Эксперт",
        "puzzleRush.tierMaster": "Мастер",
        "puzzleRush.tierGrandmaster": "Гроссмейстер",
        "puzzleRush.progress": "Прогресс выживания",

        // Stats
        "stats.rating": "Рейтинг",
        "stats.ratingHistory": "История рейтинга",
        "stats.achievements": "Достижения",
        "stats.noAchievements": "Достижений пока нет",
        "stats.asOf": "По состоянию на",

        // Leagues
        "leagues.beginner": "Начинающий",
        "leagues.leagueC": "Лига C",
        "leagues.leagueB": "Лига B",
        "leagues.leagueA": "Лига A",
        "leagues.leagueAPlus": "Лига A+",

        // Admin Ratings
        "admin.ratings.title": "Управление рейтингами",
        "admin.ratings.import": "Импорт рейтингов",
        "admin.ratings.importCSV": "Импорт CSV",
        "admin.ratings.addRating": "Добавить/обновить рейтинг",
        "admin.ratings.history": "История рейтинга",
        "admin.ratings.ratingHistory": "История рейтинга",
        "admin.ratings.currentRating": "Текущий рейтинг",
        "admin.ratings.league": "Лига",
        "admin.ratings.source": "Источник",
        "admin.ratings.date": "Дата",
        "admin.ratings.ratedStudents": "Ученики с рейтингом",
        "admin.ratings.avgRating": "Средний рейтинг",
        "admin.ratings.leagueA": "Лига A+/A",
        "admin.ratings.recentUpdates": "На этой неделе",
        "admin.ratings.selectStudent": "Выберите ученика",
        "admin.ratings.selectStudentPlaceholder": "Найти и выбрать ученика...",
        "admin.ratings.rating": "Рейтинг",
        "admin.ratings.add": "Добавить",
        "admin.ratings.allRatings": "Все рейтинги учеников",
        "admin.ratings.searchPlaceholder": "Поиск учеников...",
        "admin.ratings.lastUpdated": "Последнее обновление",
        "admin.ratings.viewHistory": "Просмотр истории",
        "admin.ratings.edit": "Редактировать рейтинг",
        "admin.ratings.noRatingYet": "Рейтинг ещё не записан",
        "admin.ratings.noHistory": "История рейтинга недоступна",
        "admin.ratings.selectStudentError": "Пожалуйста, выберите ученика",
        "admin.ratings.invalidRating": "Неверный рейтинг (должен быть 100-3000)",
        "admin.ratings.selectDateError": "Пожалуйста, выберите дату",
        "admin.ratings.ratingAdded": "Рейтинг успешно добавлен",
        "admin.ratings.functionNotAvailable": "Функция рейтинга недоступна",
        "admin.ratings.addError": "Ошибка добавления рейтинга",
        "admin.ratings.loadError": "Ошибка загрузки истории рейтинга",
        "admin.ratings.csvFormat": "Формат CSV",
        "admin.ratings.csvFormatHint": "CSV должен содержать столбцы: student_name (или first_name, last_name), rating, date (необязательно)",
        "admin.ratings.selectFile": "Выберите файл",
        "admin.ratings.chooseFile": "Выберите CSV файл",
        "admin.ratings.preview": "Предпросмотр",
        "admin.ratings.csvEmpty": "CSV файл пуст или не содержит строк данных",
        "admin.ratings.csvMissingRating": "В CSV должен быть столбец 'rating'",
        "admin.ratings.csvMissingName": "В CSV должны быть столбцы 'student_name' или 'first_name' и 'last_name'",
        "admin.ratings.studentNotFound": "Ученик не найден",
        "admin.ratings.csvParseError": "Ошибка разбора CSV файла",
        "admin.ratings.noValidData": "Нет данных для импорта",
        "admin.ratings.importComplete": "Импорт завершён: {{success}} успешно, {{errors}} ошибок",
        "admin.ratings.importError": "Ошибка импорта рейтингов",
        "admin.ratings.noRatingsYet": "Учеников с рейтингом пока нет",
        "admin.ratings.importHint": "Импортируйте рейтинги из Excel/CSV или добавьте вручную выше",
        "admin.ratings.importExcel": "Импорт рейтингов из Excel/CSV",
        "admin.ratings.excelFormatHint": "Excel/CSV должен содержать Имя в столбце A и Рейтинг в столбце B",
        "admin.ratings.unmatchedStudents": "Ненайденные ученики",
        "admin.ratings.unmatchedHint": "Следующие ученики из списка рейтингов не найдены в базе данных и были пропущены:",
        "admin.ratings.totalUnmatched": "Всего не найдено:",
        "admin.ratings.copyList": "Копировать список",
        "admin.ratings.importSummary": "Импортировано {{matched}} рейтингов, пропущено {{unmatched}} не найденных",
        "admin.ratings.listCopied": "Список скопирован в буфер обмена",
        "admin.ratings.matched": "Найден",
        "admin.ratings.unmatched": "Не найден",
        "admin.ratings.fileFormat": "Поддерживаемые форматы",
        "admin.ratings.fileFormatHint": "Excel (.xlsx, .xls) или CSV: Имя (Фамилия Имя), Рейтинг",
        "admin.ratings.processing": "Обработка...",
        "admin.ratings.importingRatings": "Импорт рейтингов...",
        "admin.ratings.importComplete": "Импорт завершён!",
        "admin.ratings.importFailed": "Импорт не удался!",
        "admin.ratings.googleSheetUrl": "URL Google Таблицы",
        "admin.ratings.googleSheetHint": "Таблица должна быть общедоступной (поделена через \"Все, у кого есть ссылка\")",
        "admin.ratings.load": "Загрузить",
        "admin.ratings.enterUrl": "Введите URL Google Таблицы",
        "admin.ratings.invalidUrl": "Неверный URL Google Таблицы",
        "admin.ratings.loading": "Загрузка таблицы...",
        "admin.ratings.loadSuccess": "Таблица успешно загружена",
        "admin.ratings.loadFailed": "Не удалось загрузить таблицу",
        "admin.ratings.fetchFailed": "Не удалось получить таблицу. Убедитесь, что она общедоступна.",

        // Admin Attendance
        "admin.attendance.title": "Учёт посещаемости",
        "admin.attendance.importExcel": "Импорт Excel",
        "admin.attendance.exportExcel": "Экспорт Excel",
        "admin.attendance.selectBranch": "Выберите филиал",
        "admin.attendance.selectBranchPrompt": "Выберите филиал для просмотра посещаемости",
        "admin.attendance.selectBranchError": "Пожалуйста, выберите филиал",
        "admin.attendance.selectFileError": "Пожалуйста, выберите Excel файл",
        "admin.attendance.monWed": "Пн-Ср",
        "admin.attendance.tueThu": "Вт-Чт",
        "admin.attendance.satSun": "Сб-Вс",
        "admin.attendance.schedule": "Расписание",
        "admin.attendance.allSchedules": "Все расписания",
        "admin.attendance.timeSlot": "Время",
        "admin.attendance.month": "Месяц",
        "admin.attendance.allTimeSlots": "Все временные слоты",
        "admin.attendance.totalSessions": "Всего занятий",
        "admin.attendance.avgRate": "Средний %",
        "admin.attendance.lowAttendance": "Низкая посещаемость",
        "admin.attendance.studentsTracked": "Учеников отслеживается",
        "admin.attendance.noStudents": "В этом филиале нет учеников",
        "admin.attendance.noLowAttendance": "У всех учеников хорошая посещаемость",
        "admin.attendance.loadError": "Ошибка загрузки данных посещаемости",
        "admin.attendance.saveError": "Ошибка сохранения посещаемости",
        "admin.attendance.importTitle": "Импорт посещаемости из Excel",
        "admin.attendance.step1": "Загрузка файла",
        "admin.attendance.step2": "Выбор листа",
        "admin.attendance.step3": "Сопоставление имён",
        "admin.attendance.branch": "Филиал",
        "admin.attendance.uploadFile": "Загрузить Excel файл",
        "admin.attendance.dragDrop": "Перетащите .xlsx файл сюда или",
        "admin.attendance.browseFiles": "выберите файл",
        "admin.attendance.sheetPreview": "Предпросмотр листа",
        "admin.attendance.emptySheet": "Этот лист пуст",
        "admin.attendance.moreRows": "ещё строк",
        "admin.attendance.nameMatching": "Сопоставление имён",
        "admin.attendance.excelName": "Имя в Excel",
        "admin.attendance.matchedStudent": "Сопоставленный ученик",
        "admin.attendance.status": "Статус",
        "admin.attendance.actions": "Действия",
        "admin.attendance.selectStudent": "Выберите ученика...",
        "admin.attendance.matched": "Сопоставлено",
        "admin.attendance.unmatched": "Не найдено",
        "admin.attendance.match": "совпадение",
        "admin.attendance.aliasMatch": "Псевдоним",
        "admin.attendance.exactMatch": "Точное совпадение",
        "admin.attendance.saveAlias": "Сохранить псевдоним для будущих импортов",
        "admin.attendance.aliasSaved": "Псевдоним успешно сохранён",
        "admin.attendance.aliasSaveError": "Ошибка сохранения псевдонима",
        "admin.attendance.import": "Импортировать",
        "admin.attendance.importData": "Импортировать данные",
        "admin.attendance.noMatchedStudents": "Нет сопоставленных учеников - сопоставьте хотя бы одного ученика",
        "admin.attendance.branchNotFound": "Филиал не найден",
        "admin.attendance.parseError": "Ошибка разбора Excel файла",
        "admin.attendance.importSuccess": "Успешно импортировано {{count}} записей посещаемости",
        "admin.attendance.importError": "Ошибка импорта посещаемости",
        "admin.attendance.exportSuccess": "Посещаемость успешно экспортирована",
        "admin.attendance.exportError": "Ошибка экспорта посещаемости",
        "admin.attendance.invalidFileType": "Пожалуйста, выберите правильный .xlsx файл",
        "admin.attendance.legend": "Условные обозначения",
        "admin.attendance.present": "Присутствовал",
        "admin.attendance.absent": "Отсутствовал",
        "admin.attendance.late": "Опоздал",
        "admin.attendance.excused": "Уважительная причина",
        "admin.attendance.lowAttendanceAlerts": "Предупреждения о низкой посещаемости",
        "admin.attendance.clickToChange": "Нажмите на ячейку для изменения статуса",
        "admin.attendance.noAlerts": "Нет предупреждений о низкой посещаемости",
        "admin.attendance.hideEmptyRows": "Скрыть пустые строки",
        "admin.attendance.step1Upload": "Загрузка файла",
        "admin.attendance.step2Sheet": "Выбор листа",
        "admin.attendance.step3Match": "Сопоставление имён",
        "admin.attendance.selectBranchFirst": "Выберите филиал",
        "admin.attendance.uploadExcelFile": "Загрузить Excel файл",
        "admin.attendance.excelFormatHint": "Загрузите журнал посещаемости в формате .xlsx (листы: Пн-Ср, Вт-Чт, Сб-Вс)",
        "admin.attendance.chooseFile": "Выбрать Excel файл",
        "admin.attendance.dragDropHint": "или перетащите файл сюда",
        "admin.attendance.selectSheets": "Выберите листы для импорта",
        "admin.attendance.sheetSelectionHint": "Выберите листы, содержащие данные посещаемости для импорта.",
        "admin.attendance.selectSheetToPreview": "Выберите лист для предпросмотра",
        "admin.attendance.rowsFound": "строк найдено",
        "admin.attendance.datesFound": "дат найдено",
        "admin.attendance.matchStudentNames": "Сопоставление имён учеников",
        "admin.attendance.nameMatchingHint": "Проверьте и подтвердите соответствие между русскими именами из Excel и учениками в базе данных.",
        "admin.attendance.totalRecords": "Записей",
        "admin.attendance.confidence": "Точность",
        "admin.attendance.studentMoved": "{name} перемещён в {slot}",
        "admin.attendance.slotFull": "Этот слот заполнен (максимум 10 учеников)",
        "admin.attendance.addStudent": "Добавить ученика",
        "admin.attendance.addStudentToCalendar": "Добавить ученика в расписание",
        "admin.attendance.searchStudent": "Поиск ученика...",
        "admin.attendance.selectTimeSlot": "Выберите время",
        "admin.attendance.deleteFromCalendar": "Удалить из расписания",
        "admin.attendance.studentAddedSuccess": "{name} добавлен в расписание",
        "admin.attendance.more": "ещё",
        "admin.attendance.noStudentsFound": "Ученики не найдены",
        "admin.attendance.selectStudentError": "Выберите ученика",
        "admin.attendance.selectScheduleError": "Выберите расписание",
        "admin.attendance.selectTimeSlotError": "Выберите время",
        "admin.attendance.addStudentError": "Ошибка добавления ученика",
        "admin.attendance.confirmDeleteStudent": "Вы уверены, что хотите удалить {name} из расписания?",
        "admin.attendance.studentNotFound": "Ученик не найден",
        "admin.attendance.deleteError": "Не удалось удалить ученика из расписания",
        "admin.attendance.studentDeleted": "{name} удалён из расписания",
        "admin.attendance.saveFailed": "Предупреждение: Не удалось сохранить в базу данных. Изменения могут не сохраниться.",
        "admin.attendance.student": "Ученик",
        "admin.attendance.scheduleType": "Расписание",

        // Admin Bots
        "admin.bots.title": "Бот-баттлы",
        "admin.bots.defeated": "Побеждённые боты",
        "admin.bots.addWin": "Добавить победу",
        "admin.bots.removeWin": "Удалить победу",

        // Admin Survival
        "admin.survival.title": "Survival результаты",
        "admin.survival.addScore": "Добавить результат",
        "admin.survival.bestScore": "Лучший результат",

        // Coach Edit Controls
        "coach.clickToToggle": "Нажмите на бота, чтобы изменить статус победы",
        "coach.addScore": "Добавить новый результат",
        "coach.scorePlaceholder": "Введите результат...",
        "coach.add": "Добавить",
        "coach.noPermission": "У вас нет разрешения на редактирование",
        "coach.noStudent": "Ученик не выбран",
        "coach.botAdded": "{{name}} добавлен в побеждённые боты",
        "coach.botRemoved": "{{name}} удалён из побеждённых ботов",
        "coach.scoreAdded": "Результат {{score}} успешно добавлен",
        "coach.updateFailed": "Не удалось обновить",
        "coach.invalidScore": "Введите корректный результат (0-100)"
    }
};

let currentLanguage = localStorage.getItem('ce_language')
    || localStorage.getItem('chess-empire-language')
    || 'en';

localStorage.setItem('ce_language', currentLanguage);
localStorage.setItem('chess-empire-language', currentLanguage);

function formatString(template, params = {}) {
    if (!template) return '';
    if (Array.isArray(template)) return template;
    return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
        const trimmed = key.trim();
        return params[trimmed] !== undefined ? params[trimmed] : '';
    });
}

function translateRazryad(value, { fallback = '' } = {}) {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }

    const normalized = razryadDictionary[value] ? value : String(value);
    const entry = razryadDictionary[normalized];

    if (!entry) {
        return normalized;
    }

    return entry[currentLanguage] || entry.en || normalized;
}

function translateStatus(value, { fallback = '' } = {}) {
    if (!value) {
        return fallback;
    }

    const normalized = value.toString().toLowerCase();
    const entry = statusDictionary[normalized];

    if (!entry) {
        return value;
    }

    return entry[currentLanguage] || entry.en || value;
}

function t(key, params) {
    const locale = translations[currentLanguage] || translations.en;
    let value = locale[key];

    if (value === undefined) {
        value = (translations.en && translations.en[key]) || key;
    }

    if (Array.isArray(value)) {
        return value;
    }

    if (typeof value === 'string') {
        return formatString(value, params);
    }

    return value || '';
}

function applyTranslations(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });

    root.querySelectorAll('[data-i18n-html]').forEach(el => {
        const key = el.getAttribute('data-i18n-html');
        el.innerHTML = t(key);
    });

    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.setAttribute('placeholder', t(key));
    });

    root.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.setAttribute('title', t(key));
    });

    root.querySelectorAll('[data-i18n-value]').forEach(el => {
        const key = el.getAttribute('data-i18n-value');
        el.setAttribute('value', t(key));
    });
}

function setLanguage(lang) {
    if (!translations[lang]) {
        return;
    }

    currentLanguage = lang;
    localStorage.setItem('ce_language', lang);
    localStorage.setItem('chess-empire-language', lang);
    document.documentElement.setAttribute('lang', lang);

    if (window.i18n && typeof window.i18n.setLanguage === 'function') {
        window.i18n.setLanguage(lang, { silent: true });
    }

    applyTranslations();

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }

    document.dispatchEvent(new CustomEvent('languagechange', {
        detail: { language: lang }
    }));
}

function getLanguage() {
    return currentLanguage;
}

function initLanguageToggle() {
    const existingDropdown = document.querySelector('.language-dropdown');
    if (existingDropdown) {
        updateLanguageDropdown(existingDropdown);
        return;
    }

    const container = document.createElement('div');
    container.className = 'language-dropdown';

    const button = document.createElement('button');
    button.className = 'language-button';
    button.setAttribute('type', 'button');
    button.setAttribute('data-language-toggle', 'true');
    button.setAttribute('title', t('common.languageToggle'));
    button.innerHTML = `
        <span class="language-icon">🌐</span>
        <span class="language-code"></span>
        <span class="caret">▾</span>
    `;

    const menu = document.createElement('div');
    menu.className = 'language-menu';
    menu.innerHTML = `
        <button type="button" class="language-option" data-lang="en">EN</button>
        <button type="button" class="language-option" data-lang="ru">RU</button>
        <button type="button" class="language-option" data-lang="kk">KZ</button>
    `;

    container.appendChild(button);
    container.appendChild(menu);
    document.body.appendChild(container);

    button.addEventListener('click', (e) => {
        e.stopPropagation();
        container.classList.toggle('open');
    });

    document.addEventListener('click', () => {
        container.classList.remove('open');
    });

    menu.querySelectorAll('.language-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            const lang = e.currentTarget.getAttribute('data-lang');
            if (lang && lang !== currentLanguage) {
                setLanguage(lang);
            }
            container.classList.remove('open');
            updateLanguageDropdown(container);
        });
    });

    updateLanguageDropdown(container);
}

function updateLanguageDropdown(container) {
    const codeEl = container.querySelector('.language-code');
    if (codeEl) {
        codeEl.textContent = currentLanguage === 'ru' ? 'RU' : (currentLanguage === 'kk' ? 'KZ' : 'EN');
    }
    container.setAttribute('title', t('common.languageToggle'));
    container.querySelectorAll('.language-option').forEach(btn => {
        const lang = btn.getAttribute('data-lang');
        if (lang === currentLanguage) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.setAttribute('lang', currentLanguage);
    applyTranslations();
    initLanguageToggle();
    document.dispatchEvent(new CustomEvent('languagechange', {
        detail: { language: currentLanguage }
    }));
});

window.t = t;
window.applyTranslations = applyTranslations;
window.setLanguage = setLanguage;
window.getLanguage = getLanguage;
window.translateRazryad = translateRazryad;
window.translateStatus = translateStatus;
(function () {
    const LANGUAGE_STORAGE_KEY = 'chess-empire-language';
    const SUPPORTED_LANGUAGES = ['en', 'ru', 'kk'];

    const shortLanguageLabels = {
        en: 'EN',
        ru: 'RU',
        kk: 'KZ'
    };

    const translations = {
        en: {
            general: {
                brandName: 'Chess Empire',
                brandTitle: 'Chess Empire - Student Database',
                languageToggleAria: 'Switch language',
                loading: 'Loading...'
            },
            index: {
                title: 'Chess Empire - Student Database',
                searchPlaceholder: 'Search for a student...',
                login: 'Login',
                dropdownNoStudents: 'No students found',
                dropdownCoachPrefix: 'Coach: {{name}}',
                dropdownRazryadBadge: '{{value}} Razryad'
            },
            student: {
                title: 'Student Profile - Chess Empire',
                back: 'Back to Search',
                statusActive: 'Active Student',
                statusGeneric: 'Status: {{status}}',
                ageLabel: 'Age',
                ageValue: '{{years}} years',
                branchLabel: 'Branch',
                coachLabel: 'Coach',
                razryadLabel: 'Razryad',
                razryadNone: 'Not yet',
                progressTitle: 'Learning Progress',
                currentLevelLabel: 'Current Level',
                currentLevelDetail: 'Level {{level}} of {{max}}',
                currentLessonLabel: 'Current Lesson',
                currentLessonDetail: 'Lesson {{lesson}} of {{total}}',
                achievementsLessons: '{{count}} Lessons Completed',
                achievementsAttendance: '{{percent}}% Attendance',
                achievementsWeekStreak: '{{count}} Week Streak'
            },
            branch: {
                back: 'Back to Dashboard',
                editButton: 'Edit Branch',
                statsTotal: 'Total Students',
                statsActive: 'Active Students',
                statsCoaches: 'Coaches',
                statsAverageLevel: 'Average Level',
                cardCoaches: 'Coaches',
                cardRazryad: 'Razryad Distribution',
                cardLevel: 'Level Distribution',
                cardStudents: 'All Students',
                emptyCoaches: 'No coaches assigned to this branch yet.',
                emptyStudents: 'No students in this branch yet.',
                studentMeta: 'Age {{age}} • {{coach}}',
                headerLocation: 'Location',
                headerPhone: 'Phone',
                headerEmail: 'Email',
                charts: {
                    razryadLabels: {
                        KMS: 'KMS',
                        '1st': '1st Razryad',
                        '2nd': '2nd Razryad',
                        '3rd': '3rd Razryad',
                        None: 'No Razryad'
                    },
                    levelDataset: 'Number of Students',
                    tooltipStudents: 'Students: {{count}}'
                },
                coachStudentsCount: '{{count}} students',
                studentLevel: 'Level {{level}}',
                levelLabel: 'Level {{level}}'
            },
            admin: {
                sidebar: {
                    sectionMain: 'Main',
                    students: 'Students',
                    branches: 'Branches',
                    coaches: 'Coaches'
                },
                header: {
                    title: 'Students Dashboard',
                    addStudent: 'Add Student'
                },
                stats: {
                    totalStudents: 'Total Students',
                    activeStudents: 'Active Students',
                    coaches: 'Coaches',
                    branches: 'Branches',
                    averageLevel: 'Average Level',
                    kmsStudents: 'Titled Students'
                },
                filters: {
                    statusLabel: 'Status',
                    statusAll: 'All Students',
                    statusActive: 'Active',
                    statusFrozen: 'Frozen',
                    statusLeft: 'Left',
                    branchLabel: 'Branch',
                    branchAll: 'All Branches',
                    coachLabel: 'Coach',
                    coachAll: 'All Coaches',
                    levelLabel: 'Level',
                    levelAll: 'All Levels',
                    levelOption: 'Level {{level}}'
                },
                table: {
                    title: 'All Students',
                    searchPlaceholder: 'Search students...',
                    noResultsTitle: 'No students found',
                    noResultsSubtitle: 'Try adjusting your filters or search query',
                    headers: {
                        student: 'Student',
                        age: 'Age',
                        branch: 'Branch',
                        coach: 'Coach',
                        level: 'Level',
                        razryad: 'Razryad',
                        status: 'Status',
                        actions: 'Actions'
                    },
                    resultCount: 'Showing {{visible}} of {{total}} students',
                    levelBadge: 'Level {{level}}',
                    viewTitle: 'View Profile',
                    editTitle: 'Edit Student'
                },
                branchView: {
                    titlePlaceholder: 'Branch Name',
                    locationPlaceholder: 'Location',
                    phonePlaceholder: 'Phone',
                    emailPlaceholder: 'Email'
                },
                coachView: {
                    titlePlaceholder: 'Coach Name',
                    branchPlaceholder: 'Branch',
                    phonePlaceholder: 'Phone',
                    emailPlaceholder: 'Email'
                },
                modal: {
                    addStudentTitle: 'Add New Student',
                    studentInfo: 'Student Information',
                    firstNameLabel: 'First Name *',
                    firstNamePlaceholder: 'Enter first name',
                    lastNameLabel: 'Last Name *',
                    lastNamePlaceholder: 'Enter last name',
                    dateOfBirthLabel: 'Date of Birth *',
                    genderLabel: 'Gender *',
                    genderPlaceholder: 'Select gender',
                    genderMale: 'Male',
                    genderFemale: 'Female',
                    photoSection: 'Student Photo',
                    uploadPhoto: 'Upload Photo',
                    uploadHint: 'JPG, PNG or GIF (max 2MB)',
                    assignmentSection: 'Branch & Coach Assignment',
                    branchLabel: 'Branch *',
                    branchPlaceholder: 'Select branch',
                    coachLabel: 'Coach *',
                    coachPlaceholder: 'Select coach',
                    levelSection: 'Initial Level Placement',
                    razryadLabel: 'Razryad',
                    razryadPlaceholder: 'No razryad yet',
                    razryadOptions: {
                        third: '3rd Razryad',
                        second: '2nd Razryad',
                        first: '1st Razryad',
                        kms: 'KMS (Candidate Master)',
                        master: 'Master'
                    },
                    statusLabel: 'Status *',
                    statusActive: 'Active',
                    statusInactive: 'Inactive',
                    contactSection: 'Contact Information (Optional)',
                    parentNameLabel: 'Parent/Guardian Name',
                    parentNamePlaceholder: 'Enter parent name',
                    phoneNumberLabel: 'Phone Number',
                    phoneNumberPlaceholder: '+7 (XXX) XXX-XX-XX',
                    emailLabel: 'Email',
                    emailPlaceholder: 'student@example.com',
                    cancelButton: 'Cancel',
                    submitButton: 'Add Student'
                }
            },
            alerts: {
                editStudent: 'Edit functionality for student ID {{id}} will be implemented soon.\n\nFor now, this is a demo interface.',
                addStudent: 'Add Student functionality will be implemented in the next phase.\n\nThis will include:\n- Student information form\n- Photo upload\n- Branch and coach assignment\n- Initial level placement',
                exportData: 'Export functionality will be implemented soon.\n\nSupported formats:\n- Excel (.xlsx)\n- CSV\n- PDF Report',
                coachesSection: 'Coaches section will be implemented in the next phase.\n\nThis will include:\n- Coach list with statistics\n- Individual coach profiles\n- Student assignments\n- Performance metrics',
                editBranch: 'Edit branch functionality coming soon!',
                coachProfile: 'Coach profile page will be implemented soon.\n\nCoach ID: {{id}}\n\nThis will show:\n- Coach information\n- Student list\n- Performance statistics\n- Class schedule',
                noBranch: 'No branch specified. Redirecting to admin dashboard...',
                branchNotFound: 'Branch "{{branch}}" not found. Redirecting to admin dashboard...'
            },
            access: {
                sidebar: {
                    appAccess: 'App Access'
                },
                header: {
                    title: 'App Access Management',
                    subtitle: 'Manage user roles and permissions'
                },
                invite: {
                    title: 'Invite New User',
                    description: 'Send an invitation email to grant access to the system',
                    emailLabel: 'Email Address',
                    emailPlaceholder: 'user@example.com',
                    sendButton: 'Send Invite',
                    success: 'Invitation sent successfully to {{email}}!',
                    demoSuccess: 'Demo mode: Invitation would be sent to {{email}}'
                },
                users: {
                    title: 'User Management',
                    description: 'Manage existing user roles and permissions',
                    loading: 'Loading users...',
                    empty: 'No users found',
                    unknownUser: 'Unknown User',
                    noEmail: 'Email not available',
                    adminHint: 'Administrators have full access to all features'
                },
                roles: {
                    admin: 'Administrator',
                    coach: 'Coach',
                    viewer: 'Viewer'
                },
                permissions: {
                    viewAllStudents: 'View All Students',
                    editStudents: 'Edit Students',
                    manageBranches: 'Manage Branches',
                    manageCoaches: 'Manage Coaches',
                    updated: 'Permission updated successfully.'
                }
            }
        },
        ru: {
            general: {
                brandName: 'Chess Empire',
                brandTitle: 'Chess Empire — база учеников',
                languageToggleAria: 'Сменить язык',
                loading: 'Загрузка...'
            },
            index: {
                title: 'Chess Empire — база учеников',
                searchPlaceholder: 'Поиск ученика...',
                login: 'Войти',
                dropdownNoStudents: 'Ученики не найдены',
                dropdownCoachPrefix: 'Тренер: {{name}}',
                dropdownRazryadBadge: '{{value}} разряд'
            },
            student: {
                title: 'Профиль ученика — Chess Empire',
                back: 'Назад к поиску',
                statusActive: 'Активный ученик',
                statusGeneric: 'Статус: {{status}}',
                ageLabel: 'Возраст',
                ageValue: '{{years}} лет',
                branchLabel: 'Филиал',
                coachLabel: 'Тренер',
                razryadLabel: 'Разряд',
                razryadNone: 'Пока нет',
                progressTitle: 'Прогресс обучения',
                currentLevelLabel: 'Текущая ступень',
                currentLevelDetail: 'Ступень {{level}} из {{max}}',
                currentLessonLabel: 'Текущее занятие',
                currentLessonDetail: 'Занятие {{lesson}} из {{total}}',
                achievementsLessons: '{{count}} занятий завершено',
                achievementsAttendance: '{{percent}}% посещаемость',
                achievementsWeekStreak: 'Серия {{count}} недель'
            },
            branch: {
                back: 'Назад к панели',
                editButton: 'Редактировать филиал',
                statsTotal: 'Всего учеников',
                statsActive: 'Активные ученики',
                statsCoaches: 'Тренеры',
                statsAverageLevel: 'Средняя ступень',
                cardCoaches: 'Тренеры',
                cardRazryad: 'Распределение по разрядам',
                cardLevel: 'Распределение по ступеням',
                cardStudents: 'Все ученики',
                emptyCoaches: 'В этом филиале пока нет тренеров.',
                emptyStudents: 'В этом филиале пока нет учеников.',
                studentMeta: 'Возраст {{age}} • {{coach}}',
                headerLocation: 'Адрес',
                headerPhone: 'Телефон',
                headerEmail: 'Email',
                charts: {
                    razryadLabels: {
                        KMS: 'КМС',
                        '1st': '1-й разряд',
                        '2nd': '2-й разряд',
                        '3rd': '3-й разряд',
                        None: 'Без разряда'
                    },
                    levelDataset: 'Количество учеников',
                    tooltipStudents: 'Ученики: {{count}}'
                },
                coachStudentsCount: '{{count}} учеников',
                studentLevel: 'Ступень {{level}}',
                levelLabel: 'Ступень {{level}}'
            },
            admin: {
                sidebar: {
                    sectionMain: 'Главное',
                    students: 'Ученики',
                    branches: 'Филиалы',
                    coaches: 'Тренеры'
                },
                header: {
                    title: 'Панель учеников',
                    addStudent: 'Добавить ученика'
                },
                stats: {
                    totalStudents: 'Всего учеников',
                    activeStudents: 'Активные ученики',
                    coaches: 'Тренеры',
                    branches: 'Филиалы',
                    averageLevel: 'Средняя ступень',
                    kmsStudents: 'Разрядники'
                },
                filters: {
                    statusLabel: 'Статус',
                    statusAll: 'Все ученики',
                    statusActive: 'Активные',
                    statusFrozen: 'Замороженные',
                    statusLeft: 'Покинувшие',
                    branchLabel: 'Филиал',
                    branchAll: 'Все филиалы',
                    coachLabel: 'Тренер',
                    coachAll: 'Все тренеры',
                    levelLabel: 'Ступень',
                    levelAll: 'Все ступени',
                    levelOption: 'Ступень {{level}}'
                },
                table: {
                    title: 'Все ученики',
                    searchPlaceholder: 'Поиск учеников...',
                    noResultsTitle: 'Ученики не найдены',
                    noResultsSubtitle: 'Измените фильтры или поисковый запрос',
                    headers: {
                        student: 'Ученик',
                        age: 'Возраст',
                        branch: 'Филиал',
                        coach: 'Тренер',
                        level: 'Ступень',
                        razryad: 'Разряд',
                        status: 'Статус',
                        actions: 'Действия'
                    },
                    resultCount: 'Показано {{visible}} из {{total}} учеников',
                    levelBadge: 'Ступень {{level}}',
                    viewTitle: 'Открыть профиль',
                    editTitle: 'Редактировать ученика'
                },
                branchView: {
                    titlePlaceholder: 'Название филиала',
                    locationPlaceholder: 'Адрес',
                    phonePlaceholder: 'Телефон',
                    emailPlaceholder: 'Email'
                },
                coachView: {
                    titlePlaceholder: 'Имя тренера',
                    branchPlaceholder: 'Филиал',
                    phonePlaceholder: 'Телефон',
                    emailPlaceholder: 'Email'
                },
                modal: {
                    addStudentTitle: 'Добавить ученика',
                    studentInfo: 'Информация об ученике',
                    firstNameLabel: 'Имя *',
                    firstNamePlaceholder: 'Введите имя',
                    lastNameLabel: 'Фамилия *',
                    lastNamePlaceholder: 'Введите фамилию',
                    dateOfBirthLabel: 'Дата рождения *',
                    genderLabel: 'Пол *',
                    genderPlaceholder: 'Выберите пол',
                    genderMale: 'Мужской',
                    genderFemale: 'Женский',
                    photoSection: 'Фотография ученика',
                    uploadPhoto: 'Загрузить фото',
                    uploadHint: 'JPG, PNG или GIF (до 2 МБ)',
                    assignmentSection: 'Назначение филиала и тренера',
                    branchLabel: 'Филиал *',
                    branchPlaceholder: 'Выберите филиал',
                    coachLabel: 'Тренер *',
                    coachPlaceholder: 'Выберите тренера',
                    levelSection: 'Начальная ступень',
                    razryadLabel: 'Разряд',
                    razryadPlaceholder: 'Разряд пока не присвоен',
                    razryadOptions: {
                        third: '3-й разряд',
                        second: '2-й разряд',
                        first: '1-й разряд',
                        kms: 'КМС (кандидат в мастера)',
                        master: 'Мастер'
                    },
                    statusLabel: 'Статус *',
                    statusActive: 'Активен',
                    statusInactive: 'Неактивен',
                    contactSection: 'Контактная информация (необязательно)',
                    parentNameLabel: 'Имя родителя/опекуна',
                    parentNamePlaceholder: 'Введите имя родителя',
                    phoneNumberLabel: 'Номер телефона',
                    phoneNumberPlaceholder: '+7 (XXX) XXX-XX-XX',
                    emailLabel: 'Электронная почта',
                    emailPlaceholder: 'student@example.com',
                    cancelButton: 'Отмена',
                    submitButton: 'Добавить ученика'
                }
            },
            alerts: {
                editStudent: 'Функция редактирования ученика с ID {{id}} будет доступна позже.\n\nСейчас это демонстрационный интерфейс.',
                addStudent: 'Функция добавления ученика будет реализована на следующем этапе.\n\nПланируется:\n- Форма с данными ученика\n- Загрузка фотографии\n- Назначение филиала и тренера\n- Определение стартовой ступени',
                exportData: 'Функция экспорта появится позже.\n\nПоддерживаемые форматы:\n- Excel (.xlsx)\n- CSV\n- PDF-отчет',
                coachesSection: 'Раздел тренеров будет реализован на следующем этапе.\n\nПланируется:\n- Список тренеров со статистикой\n- Отдельные профили тренеров\n- Назначение учеников\n- Показатели эффективности',
                editBranch: 'Функция редактирования филиала появится позже!',
                coachProfile: 'Страница профиля тренера будет реализована позже.\n\nID тренера: {{id}}\n\nПланируется:\n- Информация о тренере\n- Список учеников\n- Статистика результатов\n- Расписание занятий',
                noBranch: 'Филиал не указан. Перенаправляем в админ-панель...',
                branchNotFound: 'Филиал "{{branch}}" не найден. Перенаправляем в админ-панель...'
            },
            access: {
                sidebar: {
                    appAccess: 'Доступ к приложению'
                },
                header: {
                    title: 'Управление доступом',
                    subtitle: 'Управление ролями и правами пользователей'
                },
                invite: {
                    title: 'Пригласить нового пользователя',
                    description: 'Отправьте приглашение для предоставления доступа к системе',
                    emailLabel: 'Email адрес',
                    emailPlaceholder: 'user@example.com',
                    sendButton: 'Отправить приглашение',
                    success: 'Приглашение успешно отправлено на {{email}}!',
                    demoSuccess: 'Демо-режим: приглашение было бы отправлено на {{email}}'
                },
                users: {
                    title: 'Управление пользователями',
                    description: 'Управление ролями и правами существующих пользователей',
                    loading: 'Загрузка пользователей...',
                    empty: 'Пользователи не найдены',
                    unknownUser: 'Неизвестный пользователь',
                    noEmail: 'Email не указан',
                    adminHint: 'Администраторы имеют полный доступ ко всем функциям'
                },
                roles: {
                    admin: 'Администратор',
                    coach: 'Тренер',
                    viewer: 'Наблюдатель'
                },
                permissions: {
                    viewAllStudents: 'Просмотр всех учеников',
                    editStudents: 'Редактирование учеников',
                    manageBranches: 'Управление филиалами',
                    manageCoaches: 'Управление тренерами',
                    updated: 'Права успешно обновлены.'
                }
            }
        }
    };

    const statusTranslations = {
        active: {
            filter: { en: 'Active', ru: 'Активные' },
            badge: { en: 'Active', ru: 'Активен' },
            option: { en: 'Active', ru: 'Активен' }
        },
        frozen: {
            filter: { en: 'Frozen', ru: 'Замороженные' },
            badge: { en: 'Frozen', ru: 'Заморожен' },
            option: { en: 'Frozen', ru: 'Заморожен' }
        },
        left: {
            filter: { en: 'Left', ru: 'Покинувшие' },
            badge: { en: 'Left', ru: 'Ушел' },
            option: { en: 'Left', ru: 'Ушел' }
        },
        inactive: {
            option: { en: 'Inactive', ru: 'Неактивен' },
            badge: { en: 'Inactive', ru: 'Неактивен' }
        }
    };

    const razryadValueTranslations = {
        KMS: { en: 'KMS', ru: 'КМС' },
        Master: { en: 'Master', ru: 'Мастер' },
        '1st': { en: '1st', ru: '1-й' },
        '2nd': { en: '2nd', ru: '2-й' },
        '3rd': { en: '3rd', ru: '3-й' },
        None: { en: 'None', ru: 'Без разряда' }
    };

    const branchNameTranslations = {
        'Gagarin Park': { en: 'Gagarin Park', ru: 'Гагарин Парк', kk: 'Гагарин паркі' },
        'Debut': { en: 'Debut', ru: 'Дебют', kk: 'Дебют' },
        'Almaty Arena': { en: 'Almaty Arena', ru: 'Алматы Арена', kk: 'Алматы Арена' },
        'Halyk Arena': { en: 'Halyk Arena', ru: 'Халык Арена', kk: 'Халық Арена' },
        'Zhandosova': { en: 'Zhandosova', ru: 'Жандосова', kk: 'Жандосов' },
        'Abaya Rozybakieva': { en: 'Abaya Rozybakieva', ru: 'Абая Розыбакиева', kk: 'Абай – Розыбакиев' },
        'Almaty 1': { en: 'Almaty 1', ru: 'Алматы 1', kk: 'Алматы 1' },
        'Almaty-1': { en: 'Almaty-1', ru: 'Алматы-1', kk: 'Алматы-1' }
    };

    const branchLocationTranslations = {
        'Almaty, Gagarin Park': { en: 'Almaty, Gagarin Park', ru: 'Алматы, парк Гагарина' },
        'Almaty, Auezov District': { en: 'Almaty, Auezov District', ru: 'Алматы, район Ауэзова' },
        'Almaty, Bostandyk District': { en: 'Almaty, Bostandyk District', ru: 'Алматы, Бостандыкский район' },
        'Almaty, Almaly District': { en: 'Almaty, Almaly District', ru: 'Алматы, Алмалинский район' },
        'Almaty, Zhandosov Street': { en: 'Almaty, Zhandosov Street', ru: 'Алматы, улица Жандосова' },
        'Almaty, Abay Avenue': { en: 'Almaty, Abay Avenue', ru: 'Алматы, проспект Абая' },
        'Almaty, Railway Station Area': { en: 'Almaty, Railway Station Area', ru: 'Алматы, район вокзала' }
    };

    function getStoredLanguage() {
        const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
            || localStorage.getItem('ce_language');
        if (stored && SUPPORTED_LANGUAGES.includes(stored)) {
            return stored;
        }
        return navigator.language && navigator.language.startsWith('ru') ? 'ru' : 'en';
    }

    let currentLanguage = getStoredLanguage();

    function formatString(template, params = {}) {
        return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
            const value = params[key.trim()];
            return value !== undefined ? value : '';
        });
    }

    function resolveTranslation(key, lang) {
        const segments = key.split('.');
        let result = translations[lang];
        for (const segment of segments) {
            if (!result || typeof result !== 'object' || !(segment in result)) {
                return null;
            }
            result = result[segment];
        }
        return result;
    }

    function t(key, params = {}) {
        let value = resolveTranslation(key, currentLanguage);
        if (value === null || value === undefined) {
            value = resolveTranslation(key, 'en');
        }
        if (typeof value === 'string') {
            return formatString(value, params);
        }
        return value;
    }

    function getCurrentLanguage() {
        return currentLanguage;
    }

    function updateDocumentLanguage() {
        document.documentElement.setAttribute('lang', currentLanguage);
    }

    function setLanguage(lang, { silent } = {}) {
        if (!SUPPORTED_LANGUAGES.includes(lang)) {
            return;
        }

        currentLanguage = lang;
        localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLanguage);
        updateDocumentLanguage();
        translatePage();
        if (!silent) {
            document.dispatchEvent(new CustomEvent('languagechange', { detail: { language: currentLanguage } }));
        }
    }

    function toggleLanguage() {
        const order = ['en', 'ru', 'kk'];
        const idx = order.indexOf(currentLanguage);
        const nextLanguage = order[(idx + 1) % order.length];
        setLanguage(nextLanguage);
    }

    function translateElementText(el, key) {
        if (!key) return;
        el.textContent = t(key);
    }

    function translateElementHTML(el, key) {
        if (!key) return;
        el.innerHTML = t(key);
    }

    function translateElementAttribute(el, attr, key) {
        if (!key) return;
        el.setAttribute(attr, t(key));
    }

    function translatePage(root = document) {
        const scope = root instanceof Document ? root : root.ownerDocument;

        (root.querySelectorAll ? root.querySelectorAll('[data-i18n]') : []).forEach(el => {
            translateElementText(el, el.getAttribute('data-i18n'));
        });

        (root.querySelectorAll ? root.querySelectorAll('[data-i18n-html]') : []).forEach(el => {
            translateElementHTML(el, el.getAttribute('data-i18n-html'));
        });

        (root.querySelectorAll ? root.querySelectorAll('[data-i18n-placeholder]') : []).forEach(el => {
            translateElementAttribute(el, 'placeholder', el.getAttribute('data-i18n-placeholder'));
        });

        (root.querySelectorAll ? root.querySelectorAll('[data-i18n-title]') : []).forEach(el => {
            translateElementAttribute(el, 'title', el.getAttribute('data-i18n-title'));
        });

        (root.querySelectorAll ? root.querySelectorAll('[data-i18n-aria-label]') : []).forEach(el => {
            translateElementAttribute(el, 'aria-label', el.getAttribute('data-i18n-aria-label'));
        });

        updateLanguageToggleUI(scope);
    }

    function updateLanguageToggleUI(doc = document) {
        doc.querySelectorAll('[data-language-toggle]').forEach(button => {
            button.setAttribute('aria-label', t('general.languageToggleAria'));
        });

        doc.querySelectorAll('[data-language-toggle-label]').forEach(label => {
            label.textContent = shortLanguageLabels[currentLanguage] || currentLanguage.toUpperCase();
        });
    }

    function initLanguageToggle() {
        document.querySelectorAll('[data-language-toggle]').forEach(button => {
            button.addEventListener('click', toggleLanguage);
        });
        updateLanguageToggleUI();
    }

    function translateStatus(status, context = 'badge') {
        const normalized = status ? status.toString().toLowerCase() : '';
        const mapping = statusTranslations[normalized];
        if (!mapping) {
            return status;
        }

        const value = mapping[context];
        if (!value) {
            return status;
        }

        return value[currentLanguage] || value.en;
    }

    function translateRazryad(value) {
        if (!value) {
            return currentLanguage === 'ru' ? 'Без разряда' : 'No Razryad';
        }

        const mapping = razryadValueTranslations[value];
        if (!mapping) {
            return value;
        }

        return mapping[currentLanguage] || mapping.en;
    }

    function translateBranchName(name) {
        if (!name) return name;
        const mapping = branchNameTranslations[name];
        if (!mapping) return name;
        return mapping[currentLanguage] || mapping.en;
    }

    function translateBranchLocation(location) {
        if (!location) return location;
        const mapping = branchLocationTranslations[location];
        if (!mapping) return location;
        return mapping[currentLanguage] || mapping.en;
    }

    function getRazryadChartLabels() {
        const labels = t('branch.charts.razryadLabels');
        return { ...labels };
    }

    function getLevelDatasetLabel() {
        return t('branch.charts.levelDataset');
    }

    function getTooltipStudentsLabel(count) {
        return t('branch.charts.tooltipStudents', { count });
    }

    document.addEventListener('DOMContentLoaded', () => {
        updateDocumentLanguage();
        translatePage();
        initLanguageToggle();
    });

    window.i18n = {
        t,
        toggleLanguage,
        setLanguage,
        getCurrentLanguage,
        translatePage,
        translateStatus,
        translateRazryad,
        translateBranchName,
        translateBranchLocation,
        getRazryadChartLabels,
        getLevelDatasetLabel,
        getTooltipStudentsLabel
    };
})();

