// Branch Page JavaScript - Dynamic content loading

let currentBranch = null;
let branchStudents = [];
let branchCoaches = [];
let razryadChartInstance = null;
let levelChartInstance = null;

// Get branch name from URL parameter
function getBranchFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('branch');
}

// Initialize branch page
document.addEventListener('DOMContentLoaded', () => {
    const branchName = getBranchFromURL();

    if (!branchName) {
        showToast(t('branch.alert.noBranch'), 'error');
        window.location.href = 'admin.html';
        return;
    }

    currentBranch = branches.find(b => b.name === branchName);

    if (!currentBranch) {
        showToast(t('branch.alert.notFound', { branch: branchName }), 'error');
        window.location.href = 'admin.html';
        return;
    }

    branchStudents = students.filter(s => s.branch === branchName);
    branchCoaches = coaches.filter(c => c.branch === branchName);

    renderBranchPage();

    document.addEventListener('languagechange', () => {
        renderBranchPage();
    });
});

function renderBranchPage() {
    loadBranchHeader();
    loadStatistics();
    loadCoaches();
    loadCharts();
    loadStudents();
    lucide.createIcons();
}

// Load branch header information
function loadBranchHeader() {
    const displayName = i18n.translateBranchName(currentBranch.name);
    const displayLocation = i18n.translateBranchLocation(currentBranch.location);

    document.title = t('branch.pageTitle', { branch: displayName });
    document.getElementById('branchName').textContent = displayName;
    document.getElementById('branchLocation').textContent = displayLocation;
    document.getElementById('branchPhone').textContent = currentBranch.phone;
    document.getElementById('branchEmail').textContent = currentBranch.email;
}

// Load statistics
function loadStatistics() {
    const totalStudents = branchStudents.length;
    const activeStudents = branchStudents.filter(s => s.status === 'active').length;
    const totalCoaches = branchCoaches.length;

    // Calculate average level
    const avgLevel = branchStudents.length > 0
        ? (branchStudents.reduce((sum, s) => sum + s.currentLevel, 0) / branchStudents.length).toFixed(1)
        : 0;

    document.getElementById('totalStudents').textContent = totalStudents;
    document.getElementById('activeStudents').textContent = activeStudents;
    document.getElementById('totalCoaches').textContent = totalCoaches;
    document.getElementById('avgLevel').textContent = avgLevel;
}

// Load coaches list
function loadCoaches() {
    const coachesList = document.getElementById('coachesList');

    if (branchCoaches.length === 0) {
        coachesList.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 2rem;">${t('branch.noCoaches')}</div>`;
        return;
    }

    coachesList.innerHTML = branchCoaches.map(coach => {
        const coachStudents = branchStudents.filter(s =>
            s.coach === `${coach.firstName} ${coach.lastName}`
        );
        const studentCount = coachStudents.length;

        return `
            <div class="coach-item" onclick="viewCoach(${coach.id})">
                <div class="coach-avatar">${coach.firstName[0]}${coach.lastName[0]}</div>
                <div class="coach-info">
                    <div class="coach-name">${coach.firstName} ${coach.lastName}</div>
                    <div class="coach-meta">${coach.email}</div>
                </div>
                <div class="coach-count">${t('branch.coachCount', { count: studentCount })}</div>
            </div>
        `;
    }).join('');
}

// Load students list
function loadStudents() {
    const studentsList = document.getElementById('studentsList');

    if (branchStudents.length === 0) {
        studentsList.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 2rem;">${t('branch.noStudents')}</div>`;
        return;
    }

    studentsList.innerHTML = branchStudents.map(student => `
        <div class="student-item" onclick="viewStudent(${student.id})">
            <div class="student-avatar">${student.firstName[0]}${student.lastName[0]}</div>
            <div class="student-info">
                <div class="student-name">${student.firstName} ${student.lastName}</div>
                <div class="student-meta">${t('branch.studentMeta', { age: student.age, coach: student.coach })}</div>
            </div>
            <div class="student-level">${t('branch.studentLevel', { level: student.currentLevel })}</div>
        </div>
    `).join('');
}

// Load charts
function loadCharts() {
    loadRazryadChart();
    loadLevelChart();
}

// Load Razryad Distribution Chart
function loadRazryadChart() {
    const razryadCounts = {
        KMS: 0,
        '1st': 0,
        '2nd': 0,
        '3rd': 0,
        '4th': 0,
        None: 0
    };

    branchStudents.forEach(student => {
        const razryad = student.razryad || 'None';
        if (razryadCounts[razryad] !== undefined) {
            razryadCounts[razryad]++;
        }
    });

    // Calculate total razryadniki (excluding 'None')
    const totalRazryadniki = razryadCounts.KMS + razryadCounts['1st'] +
                              razryadCounts['2nd'] + razryadCounts['3rd'] +
                              razryadCounts['4th'];

    // Update the count display
    const razryadCountElement = document.getElementById('razryadCount');
    if (razryadCountElement) {
        razryadCountElement.textContent = `(${totalRazryadniki})`;
    }

    const ctx = document.getElementById('razryadChart');
    const labels = t('branch.chart.razryadLabels');

    const dataset = [
        razryadCounts.KMS,
        razryadCounts['1st'],
        razryadCounts['2nd'],
        razryadCounts['3rd'],
        razryadCounts['4th'],
        razryadCounts.None
    ];

    if (razryadChartInstance) {
        razryadChartInstance.destroy();
    }

    razryadChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: dataset,
                backgroundColor: [
                    '#d97706',  // KMS - amber
                    '#3b82f6',  // 1st - blue
                    '#10b981',  // 2nd - green
                    '#8b5cf6',  // 3rd - purple
                    '#ec4899',  // 4th - pink
                    '#94a3b8'   // None - gray
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        font: {
                            size: 12,
                            family: "'Inter', sans-serif"
                        },
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const value = context.parsed || 0;
                            const total = dataset.reduce((sum, val) => sum + val, 0);
                            const percent = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            const label = labels[context.dataIndex] || '';
                            return t('branch.chart.tooltipWithPercent', {
                                label,
                                value,
                                percent
                            });
                        }
                    }
                }
            }
        }
    });
}

// Load Level Distribution Chart
function loadLevelChart() {
    const levelCounts = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
        6: 0,
        7: 0,
        8: 0
    };

    branchStudents.forEach(student => {
        if (levelCounts[student.currentLevel] !== undefined) {
            levelCounts[student.currentLevel]++;
        }
    });

    const ctx = document.getElementById('levelChart');
    const labels = Array.from({ length: 8 }, (_, index) => t('branch.chart.levelLabel', { level: index + 1 }));
    const dataset = Object.values(levelCounts);

    if (levelChartInstance) {
        levelChartInstance.destroy();
    }

    levelChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: t('branch.chart.studentsLabel'),
                data: dataset,
                backgroundColor: [
                    '#e0f2fe',
                    '#bfdbfe',
                    '#93c5fd',
                    '#60a5fa',
                    '#3b82f6',
                    '#2563eb',
                    '#1d4ed8',
                    '#1e40af'
                ],
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: (context) => t('branch.chart.tooltip', { count: context.parsed.y })
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        font: {
                            family: "'Inter', sans-serif"
                        }
                    },
                    grid: {
                        color: '#f1f5f9'
                    }
                },
                x: {
                    ticks: {
                        font: {
                            family: "'Inter', sans-serif"
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// View student profile
function viewStudent(studentId) {
    localStorage.setItem('selectedStudentId', studentId);
    window.location.href = 'student.html';
}

// View coach profile (placeholder)
function viewCoach(coachId) {
    showToast(t('branch.alert.coachSoon', { id: coachId }), 'info');
}

function handleEditBranch() {
    showToast(t('branch.alert.editPending'), 'info');
}
