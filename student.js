const studentId = localStorage.getItem('selectedStudentId');

if (!studentId) {
    window.location.href = 'index.html';
}

// Student IDs from Supabase are strings (UUIDs), keep as string - don't use parseInt!
const student = students.find(s => String(s.id) === String(studentId));

if (!student) {
    window.location.href = 'index.html';
}

const levelProgress = Math.round((student.currentLevel / 8) * 100);
const lessonProgress = Math.round((student.currentLesson / student.totalLessons) * 100);
const initials = `${student.firstName[0]}${student.lastName[0]}`;

window.currentStudentName = `${student.firstName} ${student.lastName}`;
if (typeof window.updateStudentTitle === 'function') {
    window.updateStudentTitle(window.currentStudentName);
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
    const statusLabel = translateStatus(student.status || 'active') || t('student.statusActive');
    const razryadLabel = student.razryad
        ? translateRazryad(student.razryad)
        : t('student.razryadNotYet');

    const profileHTML = `
        <div class="profile-header">
            <div class="avatar">${initials}</div>
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
                <div class="progress-detail">${t('student.lessonDetail', { current: student.currentLesson, total: student.totalLessons })}</div>
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

renderProfile();

document.addEventListener('languagechange', () => {
    if (typeof window.updateStudentTitle === 'function') {
        window.updateStudentTitle(window.currentStudentName);
    }
    renderProfile();
});
