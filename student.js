// Wait for data to load from Supabase before rendering
async function initializeStudentProfile() {
    const studentId = localStorage.getItem('selectedStudentId');

    console.log('🔍 Student ID from localStorage:', studentId);

    if (!studentId) {
        console.log('❌ No student ID in localStorage, redirecting to index');
        window.location.href = 'index.html';
        return;
    }

    let student = null;

    // APPROACH 1: Load student directly from Supabase (bypasses all caching/initialization issues)
    if (window.supabaseData && typeof window.supabaseData.getStudentById === 'function') {
        console.log('✅ Loading student directly from Supabase...');
        try {
            student = await window.supabaseData.getStudentById(studentId);
            console.log('🎯 Student loaded from Supabase:', student);
        } catch (error) {
            console.error('❌ Error loading student from Supabase:', error);
        }
    } else {
        console.warn('⚠️ Supabase direct query not available');
    }

    // APPROACH 2: Fallback to initializeData + students array (if approach 1 failed)
    if (!student) {
        console.log('📥 Falling back to students array approach...');

        // Clear old student data from localStorage to force fresh Supabase load
        console.log('🧹 Clearing old student data from localStorage');
        localStorage.removeItem('students');
        localStorage.removeItem('coaches');
        localStorage.removeItem('branches');

        // Try to call initializeData (check both global and window scope)
        const initFn = (typeof window.initializeData === 'function') ? window.initializeData :
                       (typeof initializeData === 'function') ? initializeData : null;

        if (initFn) {
            console.log('✅ Calling initializeData...');
            await initFn();
            console.log('✅ Data loaded. Students array length:', students.length);
            console.log('📋 Students in array:', students.map(s => `${s.firstName} ${s.lastName} (${s.id})`).slice(0, 5));

            student = students.find(s => String(s.id) === String(studentId));
        } else {
            console.error('❌ initializeData function not found!');
            console.error('  typeof initializeData:', typeof initializeData);
            console.error('  window.initializeData:', typeof window.initializeData);
            console.error('  window.supabaseData:', typeof window.supabaseData);
        }
    }

    console.log('🔎 Final lookup - Student ID:', studentId);
    console.log('🎯 Found student:', student);

    if (!student) {
        console.error('❌ Student not found with ID:', studentId);
        if (students && students.length > 0) {
            console.error('Available student IDs:', students.map(s => s.id).slice(0, 10));
        }
        showToast('Student not found. Redirecting to home page.', 'error');
        window.location.href = 'index.html';
        return;
    }

    // Store student reference globally for rendering
    window.currentStudent = student;
    window.currentStudentName = `${student.firstName} ${student.lastName}`;

    if (typeof window.updateStudentTitle === 'function') {
        window.updateStudentTitle(window.currentStudentName);
    }

    // Render the profile
    renderProfile();
}

function animateProgressBars() {
    setTimeout(() => {
        document.querySelectorAll('.progress-bar').forEach(bar => {
            const target = bar.getAttribute('data-target');
            bar.style.width = `${target}%`;
        });
    }, 300);
}

function renderProfile() {
    const student = window.currentStudent;

    if (!student) {
        console.error('No student data available for rendering');
        return;
    }

    const levelProgress = Math.round((student.currentLevel / 8) * 100);

    // Calculate lesson progress based on total lessons (120 total: 15 per level × 8 levels)
    const totalLessons = 120;
    const lessonProgress = Math.round((student.currentLesson / totalLessons) * 100);

    const initials = `${student.firstName[0]}${student.lastName[0]}`;

    const statusLabel = translateStatus(student.status || 'active') || t('student.statusActive');
    const razryadLabel = student.razryad
        ? translateRazryad(student.razryad)
        : t('student.razryadNotYet');

    // Create avatar HTML - use photo if available, otherwise initials
    const avatarHTML = student.photoUrl
        ? `<div class="avatar" style="background: none; padding: 0; overflow: hidden;">
               <img src="${student.photoUrl}" alt="${student.firstName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">
           </div>`
        : `<div class="avatar">${initials}</div>`;

    const profileHTML = `
        <div class="profile-header">
            ${avatarHTML}
            <div class="profile-info">
                <h1 class="student-name">${student.firstName} ${student.lastName}</h1>
                <span class="student-status">
                    <span class="status-dot"></span>
                    ${statusLabel}
                </span>
            </div>
        </div>

        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">
                    <i data-lucide="calendar" style="width: 14px; height: 14px;"></i>
                    ${t('student.age')}
                </div>
                <div class="info-value">${t('student.ageValue', { count: student.age })}</div>
            </div>

            <div class="info-item">
                <div class="info-label">
                    <i data-lucide="building" style="width: 14px; height: 14px;"></i>
                    ${t('student.branch')}
                </div>
            <div class="info-value">${i18n.translateBranchName(student.branch)}</div>
            </div>

            <div class="info-item">
                <div class="info-label">
                    <i data-lucide="user" style="width: 14px; height: 14px;"></i>
                    ${t('student.coach')}
                </div>
                <div class="info-value">${student.coach}</div>
            </div>

            <div class="info-item">
                <div class="info-label">
                    <i data-lucide="award" style="width: 14px; height: 14px;"></i>
                    ${t('student.razryad')}
                </div>
                <div class="info-value">${razryadLabel}</div>
            </div>
        </div>

        <div class="progress-section">
            <h2 class="section-title">
                <i data-lucide="trending-up" style="width: 28px; height: 28px; color: #d97706;"></i>
                ${t('student.learningProgress')}
            </h2>

            <div class="progress-item">
                <div class="progress-header">
                    <div class="progress-label">${t('student.currentLevel')}</div>
                    <div class="progress-percentage">${levelProgress}%</div>
                </div>
                <div class="progress-detail">${t('student.levelDetail', { current: student.currentLevel })}</div>
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: 0%" data-target="${levelProgress}"></div>
                </div>
            </div>

            <div class="progress-item">
                <div class="progress-header">
                    <div class="progress-label">${t('student.currentLesson')}</div>
                    <div class="progress-percentage">${lessonProgress}%</div>
                </div>
                <div class="progress-detail">${t('student.lessonDetail', { current: student.currentLesson, total: totalLessons })}</div>
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: 0%" data-target="${lessonProgress}"></div>
                </div>
            </div>
        </div>

        <div class="achievements">
            <div class="achievement-badge">
                <i data-lucide="trophy" style="width: 18px; height: 18px; color: #f59e0b;"></i>
                ${t('student.lessonsCompleted', { count: Math.floor(student.currentLesson / 4) })}
            </div>
            <div class="achievement-badge">
                <i data-lucide="target" style="width: 18px; height: 18px; color: #3b82f6;"></i>
                ${t('student.attendance')}
            </div>
            <div class="achievement-badge">
                <i data-lucide="flame" style="width: 18px; height: 18px; color: #ef4444;"></i>
                ${t('student.streak')}
            </div>
        </div>
    `;

    const container = document.getElementById('studentProfile');
    container.innerHTML = profileHTML;
    lucide.createIcons();
    animateProgressBars();
}

// Initialize on page load - use window.onload to ensure all scripts loaded
window.addEventListener('load', async () => {
    console.log('🚀 Page fully loaded, all scripts ready');
    await initializeStudentProfile();
});

// Re-render on language change
document.addEventListener('languagechange', () => {
    if (typeof window.updateStudentTitle === 'function') {
        window.updateStudentTitle(window.currentStudentName);
    }
    if (window.currentStudent) {
        renderProfile();
    }
});
