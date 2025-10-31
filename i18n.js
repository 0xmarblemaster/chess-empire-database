const razryadDictionary = {
    'KMS': { en: 'KMS', ru: 'КМС' },
    'Master': { en: 'Master', ru: 'Мастер' },
    '1st': { en: '1st', ru: '1' },
    '2nd': { en: '2nd', ru: '2' },
    '3rd': { en: '3rd', ru: '3' },
    'None': { en: 'No Razryad', ru: 'Без разряда' }
};

const statusDictionary = {
    active: { en: 'Active', ru: 'Активен' },
    frozen: { en: 'Frozen', ru: 'Заморожен' },
    left: { en: 'Left', ru: 'Ушел' },
    inactive: { en: 'Inactive', ru: 'Неактивен' },
    pending: { en: 'Pending', ru: 'В ожидании' }
};

const translations = {
    en: {
        // Common
        "common.brand": "Chess Empire",
        "common.brand.full": "Chess Empire - Student Database",
        "common.login": "Login",
        "common.backToSearch": "Back to Search",
        "common.backToDashboard": "Back to Dashboard",
        "common.editBranch": "Edit Branch",
        "common.allStudents": "All Students",
        "common.coaches": "Coaches",
        "common.branch": "Branch",
        "common.phone": "Phone",
        "common.email": "Email",
        "common.cancel": "Cancel",
        "common.saveChanges": "Save Changes",
        "common.addStudent": "Add Student",
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
        "student.branch": "Branch",
        "student.coach": "Coach",
        "student.razryad": "Razryad",
        "student.razryadNotYet": "Not yet",
        "student.learningProgress": "Learning Progress",
        "student.currentLevel": "Current Level",
        "student.levelDetail": "Level {{current}} of 8",
        "student.currentLesson": "Current Lesson",
        "student.lessonDetail": "Lesson {{current}} of {{total}}",
        "student.lessonsCompleted": "{{count}} Lessons Completed",
        "student.attendance": "90% Attendance",
        "student.streak": "5 Week Streak",

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
        "branch.noCoaches": "No coaches assigned to this branch yet.",
        "branch.noStudents": "No students in this branch yet.",
        "branch.coachCount": "{{count}} students",
        "branch.studentMeta": "Age {{age}} • {{coach}}",
        "branch.studentLevel": "Level {{level}}",
        "branch.alert.noBranch": "No branch specified. Redirecting to admin dashboard...",
        "branch.alert.notFound": "Branch \"{{branch}}\" not found. Redirecting to admin dashboard...",
        "branch.alert.coachSoon": "Coach profile page will be implemented soon.\n\nCoach ID: {{id}}\n\nThis will show:\n- Coach information\n- Student list\n- Performance statistics\n- Class schedule",
        "branch.alert.editPending": "Edit branch functionality will be implemented soon.",
        "branch.chart.razryadLabels": ["KMS", "1st Razryad", "2nd Razryad", "3rd Razryad", "No Razryad"],
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
        "admin.header.students": "Students Dashboard",
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
        "admin.coach.kms": "KMS Students",
        "admin.coach.placeholder": "Coach Name",
        "admin.form.fileTooLarge": "File size must be less than 2MB",
        "admin.form.imageRequired": "Please select an image file",
        "admin.form.requiredFields": "Please fill in all required fields",
        "admin.form.addSuccess": "Student added successfully!",
        "admin.form.editSuccess": "Student updated successfully!",
        "admin.error.studentNotFound": "Student not found",
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
        "admin.modals.add.dateOfBirth": "Date of Birth *",
        "admin.modals.add.gender": "Gender *",
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
        "admin.modals.add.statusInactive": "Inactive",
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
        "admin.razryad.3rd": "3rd Razryad",
        "admin.razryad.2nd": "2nd Razryad",
        "admin.razryad.1st": "1st Razryad",
        "admin.razryad.kms": "KMS (Candidate Master)",
        "admin.razryad.master": "Master",
        "admin.modals.edit.title": "Edit Student",
        "admin.modals.edit.save": "Save Changes",
        "admin.modals.edit.level": "Level & Progress",
        "admin.modals.edit.currentLevel": "Current Level",
        "admin.modals.edit.currentLesson": "Current Lesson",
        "admin.modals.edit.agePlaceholder": "Enter age",
        "admin.modals.edit.genderUnknown": "Not specified",
        "admin.modals.edit.levelPlaceholder": "1-10",
        "admin.modals.edit.lessonPlaceholder": "1-40",
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

        // Language toggle
        "language.toggle.label": "Language",
        "language.toggle.english": "EN",
        "language.toggle.russian": "RU"
    },
    kk: {
        "common.brand": "Chess Empire",
        "common.brand.full": "Chess Empire - Оқушылар базасы",
        "common.login": "Кіру",
        "common.backToSearch": "Іздеуге қайту",
        "common.backToDashboard": "Панельге оралу",
        "common.editBranch": "Бөлімшені өңдеу",
        "common.allStudents": "Барлық оқушылар",
        "common.coaches": "Тренерлер",
        "common.branch": "Бөлімше",
        "common.phone": "Телефон",
        "common.email": "Email",
        "common.cancel": "Бас тарту",
        "common.saveChanges": "Өзгерістерді сақтау",
        "common.addStudent": "Оқушы қосу",
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
        "student.branch": "Бөлімше",
        "student.coach": "Тренер",
        "student.razryad": "Разряд",
        "student.razryadNotYet": "Әзірге жоқ",
        "student.learningProgress": "Оқу барысы",
        "student.currentLevel": "Ағымдағы деңгей",
        "student.levelDetail": "{{current}} / 8 деңгей",
        "student.currentLesson": "Ағымдағы сабақ",
        "student.lessonDetail": "Сабақ {{current}} / {{total}}",
        "student.lessonsCompleted": "{{count}} сабақ аяқталды",
        "student.attendance": "Қатысуы 90%",
        "student.streak": "{{count}} апта қатар",
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
        "branch.noCoaches": "Бұл бөлімшеде тренерлер әлі жоқ.",
        "branch.noStudents": "Бұл бөлімшеде оқушылар жоқ.",
        "branch.coachCount": "{{count}} оқушы",
        "branch.studentMeta": "Жасы {{age}} • {{coach}}",
        "branch.studentLevel": "Деңгей {{level}}",
        "branch.alert.noBranch": "Бөлімше көрсетілмеген. Админ-панельге бағыттаймыз...",
        "branch.alert.notFound": "\"{{branch}}\" бөлімшесі табылмады. Админ-панельге қайтарамыз...",
        "branch.alert.coachSoon": "Тренер профилі жақында қолжетімді болады.\n\nТренер ID: {{id}}\n\nКөрсетіледі:\n- Тренер ақпараты\n- Оқушылар тізімі\n- Нәтиже статистикасы\n- Сабақ кестесі",
        "branch.chart.razryadLabels": ["КМС", "1-разряд", "2-разряд", "3-разряд", "Разряд жоқ"],
        "branch.chart.studentsLabel": "Оқушылар саны",
        "branch.chart.tooltip": "Оқушылар: {{count}}",
        "branch.chart.tooltipWithPercent": "{{label}}: {{value}} ({{percent}}%)",
        "branch.chart.levelLabel": "Деңгей {{level}}",
        "admin.title": "Админ панелі - Chess Empire",
        "admin.sidebar.main": "Басты",
        "admin.sidebar.students": "Оқушылар",
        "admin.sidebar.branches": "Бөлімшелер",
        "admin.sidebar.coaches": "Тренерлер",
        "admin.header.students": "Оқушылар панелі",
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
        "admin.modals.add.dateOfBirth": "Туған күні *",
        "admin.modals.add.gender": "Жынысы *",
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
        "admin.modals.add.statusInactive": "Белсенді емес",
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
        "admin.modals.edit.level": "Деңгей және прогресс",
        "admin.modals.edit.currentLevel": "Ағымдағы деңгей",
        "admin.modals.edit.currentLesson": "Ағымдағы сабақ",
        "admin.alert.addStudent": "Оқушы қосу мүмкіндігі келесі кезеңде іске асады.\n\nЖоспарда:\n- Оқушы деректер формасы\n- Фото жүктеу\n- Бөлімше мен тренер тағайындау\n- Бастапқы деңгейді анықтау",
        "admin.alert.export": "Экспорт мүмкіндігі кейін қосылады.\n\nПішімдер:\n- Excel (.xlsx)\n- CSV\n- PDF есеп",
        "admin.alert.coaches": "Тренерлер бөлімі келесі кезеңде іске асады.\n\nЖоспарда:\n- Статистикасы бар тізім\n- Жеке тренер профилі\n- Оқушыларды бекіту\n- Нәтиже көрсеткіштері",
        "admin.alert.editStudent": "{{id}} ID оқушыны өңдеу кейінірек қолжетімді болады.\n\nҚазір бұл демо интерфейс.",
        "admin.status.active": "Белсенді",
        "admin.status.frozen": "Тоқтатылған",
        "admin.status.left": "Кеткен",
        "admin.status.inactive": "Белсенді емес",
        "admin.status.pending": "Күтілуде",
        "admin.studentCard.status": "Мәртебе: {{status}}",
        "admin.studentCard.lesson": "Сабақ {{current}} / {{total}}",
        "admin.studentCard.level": "Деңгей {{level}}",
        "admin.studentCard.view": "Ашу",
        "admin.studentCard.edit": "Өңдеу",
        "language.toggle.label": "Тіл",
        "language.toggle.english": "EN",
        "language.toggle.russian": "RU"
    },
    ru: {
        // Common
        "common.brand": "Шахматная Империя",
        "common.brand.full": "Шахматная Империя — база учеников",
        "common.login": "Войти",
        "common.backToSearch": "Назад к поиску",
        "common.backToDashboard": "Назад к панели",
        "common.editBranch": "Редактировать филиал",
        "common.allStudents": "Все ученики",
        "common.coaches": "Тренеры",
        "common.branch": "Филиал",
        "common.phone": "Телефон",
        "common.email": "E-mail",
        "common.cancel": "Отмена",
        "common.saveChanges": "Сохранить изменения",
        "common.addStudent": "Добавить ученика",
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
        "student.branch": "Филиал",
        "student.coach": "Тренер",
        "student.razryad": "Разряд",
        "student.razryadNotYet": "Пока нет",
        "student.learningProgress": "Прогресс обучения",
        "student.currentLevel": "Текущая ступень",
        "student.levelDetail": "Ступень {{current}} из 8",
        "student.currentLesson": "Текущее занятие",
        "student.lessonDetail": "Урок {{current}} из {{total}}",
        "student.lessonsCompleted": "Пройдено занятий: {{count}}",
        "student.attendance": "Посещаемость 90%",
        "student.streak": "Серия 5 недель",

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
        "branch.noCoaches": "В этом филиале пока нет тренеров.",
        "branch.noStudents": "В этом филиале пока нет учеников.",
        "branch.coachCount": "{{count}} учеников",
        "branch.studentMeta": "Возраст {{age}} • {{coach}}",
        "branch.studentLevel": "Ступень {{level}}",
        "branch.alert.noBranch": "Филиал не указан. Переадресация в панель администратора...",
        "branch.alert.notFound": "Филиал \"{{branch}}\" не найден. Возврат в панель администратора...",
        "branch.alert.coachSoon": "Страница тренера появится позже.\n\nID тренера: {{id}}\n\nПланируется показать:\n- Информацию о тренере\n- Список учеников\n- Показатели эффективности\n- Расписание занятий",
        "branch.alert.editPending": "Редактирование филиала появится позже.",
        "branch.chart.razryadLabels": ["КМС", "1 разряд", "2 разряд", "3 разряд", "Без разряда"],
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
        "admin.header.students": "Панель учеников",
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
        "admin.coach.kms": "Ученики КМС",
        "admin.coach.placeholder": "Имя тренера",
        "admin.form.fileTooLarge": "Размер файла должен быть меньше 2 МБ",
        "admin.form.imageRequired": "Выберите файл изображения",
        "admin.form.requiredFields": "Заполните все обязательные поля",
        "admin.form.addSuccess": "Ученик успешно добавлен!",
        "admin.form.editSuccess": "Данные ученика обновлены!",
        "admin.error.studentNotFound": "Ученик не найден",
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
        "admin.modals.add.dateOfBirth": "Дата рождения *",
        "admin.modals.add.gender": "Пол *",
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
        "admin.modals.add.statusInactive": "Неактивен",
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
        "admin.razryad.3rd": "3 разряд",
        "admin.razryad.2nd": "2 разряд",
        "admin.razryad.1st": "1 разряд",
        "admin.razryad.kms": "КМС (кандидат в мастера)",
        "admin.razryad.master": "Мастер",
        "admin.modals.edit.title": "Редактировать ученика",
        "admin.modals.edit.save": "Сохранить изменения",
        "admin.modals.edit.level": "Ступень и прогресс",
        "admin.modals.edit.currentLevel": "Текущая ступень",
        "admin.modals.edit.currentLesson": "Текущее занятие",
        "admin.modals.edit.agePlaceholder": "Введите возраст",
        "admin.modals.edit.genderUnknown": "Не указано",
        "admin.modals.edit.levelPlaceholder": "1-10",
        "admin.modals.edit.lessonPlaceholder": "1-40",
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

        // Language toggle
        "language.toggle.label": "Язык",
        "language.toggle.english": "EN",
        "language.toggle.russian": "RU"
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
                    kmsStudents: 'KMS Students'
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
                    kmsStudents: 'Ученики КМС'
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
        'Almaty 1': { en: 'Almaty 1', ru: 'Алматы 1', kk: 'Алматы 1' }
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

