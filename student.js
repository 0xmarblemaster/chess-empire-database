// Check if user is logged in (has any account on the platform)
function isLoggedIn() {
    return sessionStorage.getItem('userRole') !== null;
}

// Check if current user has permission to edit students
function canEditStudent() {
    try {
        const userRoleStr = sessionStorage.getItem('userRole');
        if (!userRoleStr) return false;

        const userRole = JSON.parse(userRoleStr);
        return userRole.can_edit_students === true || userRole.role === 'admin';
    } catch (error) {
        console.error('Error checking edit permission:', error);
        return false;
    }
}

// Show dashboard button for logged-in users
function updateDashboardButton() {
    const dashboardButton = document.getElementById('dashboardButton');
    if (dashboardButton && isLoggedIn()) {
        dashboardButton.style.display = 'inline-flex';
        // Re-apply translations to the button since it was hidden during initial translation
        if (window.applyTranslations) {
            window.applyTranslations(dashboardButton);
        }
    }
}

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

// Current active tab
let currentTab = 'overview';

// Cached student profile data
let studentProfileData = null;

// Load full student profile with rankings, bots, survival, achievements
async function loadStudentProfileData(studentId) {
    if (!window.supabaseData) return null;

    try {
        // Try to use the comprehensive getStudentFullProfile function
        if (typeof window.supabaseData.getStudentFullProfile === 'function') {
            studentProfileData = await window.supabaseData.getStudentFullProfile(studentId);
        } else {
            // Fallback: load individual pieces
            studentProfileData = {
                ratings: { current: null, history: [] },
                botProgress: { defeated: [], count: 0, total: window.TOTAL_BOTS || 17 },
                survival: { best: null, scores: [] },
                rankings: { branch: null, school: null, survival: null },
                achievements: []
            };

            // Load available data
            if (typeof window.supabaseData.getCurrentRating === 'function') {
                studentProfileData.ratings.current = await window.supabaseData.getCurrentRating(studentId);
            }
            if (typeof window.supabaseData.getStudentBotProgress === 'function') {
                const botProgressData = await window.supabaseData.getStudentBotProgress(studentId);
                studentProfileData.botProgress = {
                    count: botProgressData.botsDefeated || 0,
                    total: window.TOTAL_BOTS || 17,
                    defeated: (botProgressData.defeatedBots || []).map(name => ({ bot_name: name })),
                    highestRating: botProgressData.highestBotRating || 0
                };
            }
            if (typeof window.supabaseData.getBestSurvivalScore === 'function') {
                const survivalData = await window.supabaseData.getBestSurvivalScore(studentId, 'puzzle_rush');
                studentProfileData.survival.best = {
                    score: survivalData.bestScore || 0,
                    achievedAt: survivalData.achievedAt
                };
            }
            if (typeof window.supabaseData.getStudentRankings === 'function') {
                studentProfileData.rankings = await window.supabaseData.getStudentRankings(studentId);
            }
            if (typeof window.supabaseData.getStudentAchievements === 'function') {
                studentProfileData.achievements = await window.supabaseData.getStudentAchievements(studentId);
            }
        }

        return studentProfileData;
    } catch (error) {
        console.error('Error loading student profile data:', error);
        return null;
    }
}

// Get league info from rating
function getLeagueInfo(rating) {
    if (!rating) return { name: t('rankings.beginner') || 'Beginner', tier: 'none', color: '#94a3b8' };

    if (typeof window.getLeagueFromRating === 'function') {
        const league = window.getLeagueFromRating(rating);
        const leagueName = typeof window.getLeagueName === 'function'
            ? window.getLeagueName(rating)
            : league.tier;
        return { name: leagueName, ...league };
    }

    // Fallback
    if (rating >= 1500) return { name: 'League A+', tier: 'diamond', color: '#0ea5e9' };
    if (rating >= 1200) return { name: 'League A', tier: 'gold', color: '#ffd700' };
    if (rating >= 900) return { name: 'League B', tier: 'silver', color: '#c0c0c0' };
    if (rating >= 400) return { name: 'League C', tier: 'bronze', color: '#cd7f32' };
    return { name: t('rankings.beginner') || 'Beginner', tier: 'none', color: '#94a3b8' };
}

// Get survival tier info
function getSurvivalInfo(score) {
    if (!score) return { label: t('puzzleRush.tierBeginner') || 'Beginner', tier: 'beginner', color: '#94a3b8' };

    if (typeof window.getSurvivalTier === 'function') {
        const tier = window.getSurvivalTier(score);
        return tier;
    }

    // Fallback
    if (score >= 30) return { label: 'Grandmaster', tier: 'grandmaster', color: '#dc2626' };
    if (score >= 20) return { label: 'Master', tier: 'master', color: '#d97706' };
    if (score >= 15) return { label: 'Expert', tier: 'expert', color: '#8b5cf6' };
    if (score >= 10) return { label: 'Advanced', tier: 'advanced', color: '#3b82f6' };
    if (score >= 5) return { label: 'Intermediate', tier: 'intermediate', color: '#10b981' };
    return { label: 'Beginner', tier: 'beginner', color: '#94a3b8' };
}

// Format rank position for display (e.g., "5 / 70")
function formatRankPosition(rank, total) {
    if (!rank || !total) return null;
    return `${rank} / ${total}`;
}

// Get school rank tier based on position
// Returns tier info for top 10, 30, 50, 100 students
function getSchoolRankTier(rank) {
    if (!rank || rank <= 0) return null;

    if (rank <= 10) {
        return {
            tier: 'platinum',
            label: 'TOP 10',
            animated: true
        };
    }
    if (rank <= 30) {
        return {
            tier: 'gold',
            label: 'TOP 30',
            animated: false
        };
    }
    if (rank <= 50) {
        return {
            tier: 'silver',
            label: 'TOP 50',
            animated: false
        };
    }
    if (rank <= 100) {
        return {
            tier: 'bronze',
            label: 'TOP 100',
            animated: false
        };
    }
    return null;
}

// Get branch rank tier based on position
// Returns tier info for top 3, 10, 20 students in branch
function getBranchRankTier(rank) {
    if (!rank || rank <= 0) return null;

    if (rank <= 3) {
        return {
            tier: 'gold',
            label: 'TOP 3',
            animated: true
        };
    }
    if (rank <= 10) {
        return {
            tier: 'silver',
            label: 'TOP 10',
            animated: true
        };
    }
    if (rank <= 20) {
        return {
            tier: 'bronze',
            label: 'TOP 20',
            animated: false
        };
    }
    return null;
}

// Get the best tier for avatar ring based on both branch and school rankings
// Priority: platinum > gold > silver > bronze > none
function getBestRankTier(rankings) {
    const tierPriority = { 'platinum': 4, 'gold': 3, 'silver': 2, 'bronze': 1, 'none': 0 };

    // Get school rank tier
    const schoolRank = rankings?.schoolLevel?.rankInSchool;
    const schoolTierInfo = getSchoolRankTier(schoolRank);
    const schoolTier = schoolTierInfo?.tier || 'none';

    // Get branch rank tier
    const branchRank = rankings?.branchLevel?.rankInBranch;
    const branchTierInfo = getBranchRankTier(branchRank);
    const branchTier = branchTierInfo?.tier || 'none';

    // Return the better tier
    if (tierPriority[schoolTier] >= tierPriority[branchTier]) {
        return schoolTier;
    }
    return branchTier;
}

// Render level-based rank info boxes for the info grid
// Shows position like "5 / 70" instead of percentiles
// Returns object with separate branch and school rank HTML for mobile ordering
function renderLevelRankInfoBoxes(rankings) {
    if (!rankings) return { branchRankHTML: '', schoolRankHTML: '' };

    let branchRankHTML = '';
    let schoolRankHTML = '';

    // Branch-level rank based on level/lesson progress
    const branchRank = rankings.branchLevel?.rankInBranch;
    const branchTotal = rankings.branchLevel?.totalInBranch;

    if (branchRank && branchTotal) {
        const rankLabel = formatRankPosition(branchRank, branchTotal);
        const tierInfo = getBranchRankTier(branchRank);

        // Build CSS classes
        const tierClass = tierInfo ? `branch-rank-${tierInfo.tier}` : '';
        const animatedClass = tierInfo?.animated ? 'branch-rank-animated' : '';

        // Top badge HTML
        const topBadgeHTML = tierInfo
            ? `<span class="branch-rank-badge branch-rank-badge--${tierInfo.tier}">${tierInfo.label}</span>`
            : '';

        branchRankHTML = `
            <div class="info-item rank-info-item mobile-order-1 ${tierClass} ${animatedClass}">
                ${topBadgeHTML}
                <div class="info-label">
                    <i data-lucide="users" style="width: 14px; height: 14px;"></i>
                    ${t('rankings.branchRank') || 'Branch Rank'}
                </div>
                <div class="info-value rank-value">${rankLabel}</div>
            </div>
        `;
    }

    // School-wide level rank with top tier distinction
    const schoolRank = rankings.schoolLevel?.rankInSchool;
    const schoolTotal = rankings.schoolLevel?.totalInSchool;

    if (schoolRank && schoolTotal) {
        const rankLabel = formatRankPosition(schoolRank, schoolTotal);
        const tierInfo = getSchoolRankTier(schoolRank);

        // Build CSS classes
        const tierClass = tierInfo ? `school-rank-${tierInfo.tier}` : '';
        const animatedClass = tierInfo?.animated ? 'school-rank-animated' : '';

        // Top badge HTML
        const topBadgeHTML = tierInfo
            ? `<span class="school-rank-badge school-rank-badge--${tierInfo.tier}">${tierInfo.label}</span>`
            : '';

        schoolRankHTML = `
            <div class="info-item rank-info-item mobile-order-2 ${tierClass} ${animatedClass}">
                ${topBadgeHTML}
                <div class="info-label">
                    <i data-lucide="school" style="width: 14px; height: 14px;"></i>
                    ${t('rankings.schoolRank') || 'School Rank'}
                </div>
                <div class="info-value rank-value">${rankLabel}</div>
            </div>
        `;
    }

    return { branchRankHTML, schoolRankHTML };
}

// Switch tab
function switchTab(tabName) {
    currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    // Animate progress bars if switching to overview
    if (tabName === 'overview') {
        animateProgressBars();
    }
}

// Render bot grid for Bots tab
function renderBotGrid() {
    const bots = window.CHESS_BOTS || [];
    const defeatedBots = studentProfileData?.botProgress?.defeated || [];
    const defeatedSet = new Set(defeatedBots.map(b => b.bot_name?.toLowerCase() || b.botName?.toLowerCase()));

    // Tier configuration with labels and colors
    const tierConfig = {
        beginner: { label: t('bots.tierBeginner') || 'Beginner', color: '#94a3b8', icon: 'baby' },
        intermediate: { label: t('bots.tierIntermediate') || 'Intermediate', color: '#10b981', icon: 'user' },
        advanced: { label: t('bots.tierAdvanced') || 'Advanced', color: '#3b82f6', icon: 'user-check' },
        expert: { label: t('bots.tierExpert') || 'Expert', color: '#8b5cf6', icon: 'brain' },
        master: { label: t('bots.tierMaster') || 'Master', color: '#d97706', icon: 'crown' },
        grandmaster: { label: t('bots.tierGrandmaster') || 'Grandmaster', color: '#ef4444', icon: 'flame' }
    };

    // Group bots by tier
    const botsByTier = {};
    bots.forEach((bot, index) => {
        if (!botsByTier[bot.tier]) {
            botsByTier[bot.tier] = [];
        }
        botsByTier[bot.tier].push({ ...bot, originalIndex: index });
    });

    let html = '<div class="bot-sections">';

    // Render each tier section
    const tierOrder = ['beginner', 'intermediate', 'advanced', 'expert', 'master', 'grandmaster'];
    tierOrder.forEach(tier => {
        const tierBots = botsByTier[tier];
        if (!tierBots || tierBots.length === 0) return;

        const config = tierConfig[tier];

        html += `
            <div class="bot-tier-section">
                <div class="bot-tier-header" style="--tier-color: ${config.color}">
                    <i data-lucide="${config.icon}" style="width: 18px; height: 18px;"></i>
                    <span>${config.label}</span>
                </div>
                <div class="bot-grid">
        `;

        tierBots.forEach(bot => {
            const isDefeated = defeatedSet.has(bot.name.toLowerCase());
            const isNextTarget = !isDefeated && bot.originalIndex === defeatedBots.length;

            html += `
                <div class="bot-card ${isDefeated ? 'defeated' : ''} ${isNextTarget ? 'next-target' : ''}"
                     style="--bot-color: ${bot.color}">
                    <div class="bot-avatar">${bot.avatar}</div>
                    <div class="bot-info">
                        <div class="bot-name">${bot.name}</div>
                        <div class="bot-rating">${bot.rating}</div>
                    </div>
                    <div class="bot-status">
                        ${isDefeated
                            ? '<i data-lucide="check-circle" style="width: 20px; height: 20px; color: #10b981;"></i>'
                            : isNextTarget
                                ? '<i data-lucide="target" style="width: 20px; height: 20px; color: #f59e0b;"></i>'
                                : '<i data-lucide="lock" style="width: 20px; height: 20px; color: #94a3b8;"></i>'}
                    </div>
                </div>
            `;
        });

        html += '</div></div>';
    });

    html += '</div>';

    // Progress bar
    const progress = defeatedBots.length;
    const total = bots.length;
    const progressPercent = Math.round((progress / total) * 100);

    html += `
        <div class="bot-progress-summary">
            <div class="bot-progress-header">
                <span class="bot-progress-label">${t('bots.progress') || 'Bot Progress'}</span>
                <span class="bot-progress-count">${progress}/${total}</span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar bot-progress-bar" style="width: ${progressPercent}%" data-target="${progressPercent}"></div>
            </div>
        </div>
    `;

    return html;
}

// Render survival/puzzle rush content for Puzzles tab
function renderSurvivalContent() {
    const best = studentProfileData?.survival?.best;
    const scores = studentProfileData?.survival?.scores || [];
    const survivalRank = studentProfileData?.rankings?.survival;
    const bestScore = best?.score || 0;

    const survivalInfo = getSurvivalInfo(bestScore);
    const levels = window.PUZZLE_RUSH_LEVELS || [];

    // Tier configuration for headings
    const tierConfig = {
        beginner: { label: t('puzzleRush.tierBeginner') || 'Beginner', color: '#94a3b8', icon: 'baby' },
        intermediate: { label: t('puzzleRush.tierIntermediate') || 'Intermediate', color: '#10b981', icon: 'user' },
        advanced: { label: t('puzzleRush.tierAdvanced') || 'Advanced', color: '#3b82f6', icon: 'user-check' },
        expert: { label: t('puzzleRush.tierExpert') || 'Expert', color: '#8b5cf6', icon: 'brain' },
        master: { label: t('puzzleRush.tierMaster') || 'Master', color: '#d97706', icon: 'crown' },
        grandmaster: { label: t('puzzleRush.tierGrandmaster') || 'Grandmaster', color: '#ef4444', icon: 'flame' }
    };

    // Hero section with best score
    let html = `
        <div class="survival-hero">
            <div class="survival-score-display" style="--tier-color: ${survivalInfo.color}">
                <div class="survival-score-value">${bestScore}</div>
                <div class="survival-score-label">${t('puzzleRush.bestScore') || 'Best Score'}</div>
            </div>
            <div class="survival-tier-badge tier-${survivalInfo.tier || 'beginner'}">
                <i data-lucide="zap" style="width: 18px; height: 18px;"></i>
                <span>${survivalInfo.label}</span>
            </div>
        </div>
    `;

    // School percentile for survival
    if (survivalRank?.percentile) {
        const rankInfo = formatPercentile(survivalRank.percentile);
        if (rankInfo) {
            html += `
                <div class="survival-rank-badge tier-${rankInfo.tier}">
                    <i data-lucide="trophy" style="width: 16px; height: 16px;"></i>
                    <span>${rankInfo.label} ${t('rankings.inSchool') || 'in School'}</span>
                </div>
            `;
        }
    }

    // Group levels by tier
    const levelsByTier = {};
    levels.forEach(level => {
        if (!levelsByTier[level.tier]) {
            levelsByTier[level.tier] = [];
        }
        levelsByTier[level.tier].push(level);
    });

    // Render level sections
    html += '<div class="puzzle-rush-sections">';

    const tierOrder = ['beginner', 'intermediate', 'advanced', 'expert', 'master', 'grandmaster'];
    tierOrder.forEach(tier => {
        const tierLevels = levelsByTier[tier];
        if (!tierLevels || tierLevels.length === 0) return;

        const config = tierConfig[tier];

        html += `
            <div class="puzzle-rush-tier-section">
                <div class="puzzle-rush-tier-header" style="--tier-color: ${config.color}">
                    <i data-lucide="${config.icon}" style="width: 18px; height: 18px;"></i>
                    <span>${config.label}</span>
                </div>
                <div class="puzzle-rush-grid">
        `;

        tierLevels.forEach(level => {
            const isCompleted = bestScore >= level.target;
            const isNext = !isCompleted && (bestScore < level.target) &&
                           (level.level === 1 || bestScore >= levels[level.level - 2]?.target);

            const isLocked = !isCompleted && !isNext;
            html += `
                <div class="puzzle-rush-card ${isCompleted ? 'completed' : ''} ${isNext ? 'next-target' : ''} ${isLocked ? 'locked' : ''}">
                    <div class="puzzle-rush-checkbox">
                        ${isCompleted ? '<i data-lucide="check"></i>' : ''}
                    </div>
                    <div class="puzzle-rush-number">${level.target}</div>
                </div>
            `;
        });

        html += '</div></div>';
    });

    html += '</div>';

    // Progress summary
    const completedLevels = levels.filter(l => bestScore >= l.target).length;
    const totalLevels = levels.length;
    const progressPercent = Math.round((completedLevels / totalLevels) * 100);

    html += `
        <div class="puzzle-rush-progress-summary">
            <div class="puzzle-rush-progress-header">
                <span class="puzzle-rush-progress-label">${t('puzzleRush.progress') || 'Puzzle Rush Progress'}</span>
                <span class="puzzle-rush-progress-count">${completedLevels}/${totalLevels}</span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar puzzle-rush-progress-bar" style="width: ${progressPercent}%" data-target="${progressPercent}"></div>
            </div>
        </div>
    `;

    // Recent scores
    if (scores.length > 0) {
        html += `
            <div class="survival-history">
                <h3 class="subsection-title">${t('puzzleRush.recentScores') || 'Recent Scores'}</h3>
                <div class="score-list">
        `;

        scores.slice(0, 5).forEach(score => {
            const scoreInfo = getSurvivalInfo(score.score);
            const date = new Date(score.achieved_at || score.achievedAt);
            const dateStr = date.toLocaleDateString();

            html += `
                <div class="score-item">
                    <div class="score-value" style="color: ${scoreInfo.color}">${score.score}</div>
                    <div class="score-date">${dateStr}</div>
                </div>
            `;
        });

        html += '</div></div>';
    }

    return html;
}

// Render stats tab content
function renderStatsContent() {
    const student = window.currentStudent;
    const ratings = studentProfileData?.ratings;
    const achievements = studentProfileData?.achievements || [];

    let html = '';

    // Rating history
    if (ratings?.current) {
        const leagueInfo = getLeagueInfo(ratings.current.rating);
        html += `
            <div class="stats-section">
                <h3 class="subsection-title">
                    <i data-lucide="trending-up" style="width: 20px; height: 20px;"></i>
                    ${t('stats.ratingHistory') || 'Rating History'}
                </h3>
                <div class="current-rating-card tier-${leagueInfo.tier}">
                    <div class="rating-value">${ratings.current.rating}</div>
                    <div class="rating-league">${leagueInfo.name}</div>
                    ${ratings.current.rating_date ? `<div class="rating-date">${t('stats.asOf') || 'As of'} ${new Date(ratings.current.rating_date).toLocaleDateString()}</div>` : ''}
                </div>
            </div>
        `;
    }

    // Achievements showcase
    if (achievements.length > 0) {
        html += `
            <div class="stats-section">
                <h3 class="subsection-title">
                    <i data-lucide="award" style="width: 20px; height: 20px;"></i>
                    ${t('stats.achievements') || 'Achievements'}
                </h3>
                <div class="achievements-grid">
        `;

        achievements.forEach(ach => {
            const achievement = ach.achievement || ach;
            const tierClass = achievement.tier || 'bronze';
            const name = i18n.currentLang === 'ru' ? achievement.name_ru :
                        i18n.currentLang === 'kk' ? (achievement.name_kk || achievement.name_ru) :
                        achievement.name_en;

            html += `
                <div class="achievement-card tier-${tierClass}">
                    <div class="achievement-icon">
                        <i data-lucide="${achievement.icon || 'award'}" style="width: 24px; height: 24px;"></i>
                    </div>
                    <div class="achievement-name">${name}</div>
                    <div class="achievement-date">${new Date(ach.earned_at || ach.earnedAt).toLocaleDateString()}</div>
                </div>
            `;
        });

        html += '</div></div>';
    } else {
        html += `
            <div class="stats-section">
                <h3 class="subsection-title">
                    <i data-lucide="award" style="width: 20px; height: 20px;"></i>
                    ${t('stats.achievements') || 'Achievements'}
                </h3>
                <div class="empty-state">
                    <i data-lucide="star" style="width: 48px; height: 48px; color: #cbd5e1;"></i>
                    <p>${t('stats.noAchievements') || 'No achievements earned yet'}</p>
                </div>
            </div>
        `;
    }

    return html;
}

async function renderProfile() {
    const student = window.currentStudent;

    if (!student) {
        console.error('No student data available for rendering');
        return;
    }

    // Load profile data (ratings, bots, survival, achievements)
    await loadStudentProfileData(student.id);

    const levelProgress = Math.round((student.currentLevel / 8) * 100);
    const totalLessons = 120;
    const lessonProgress = Math.round((student.currentLesson / totalLessons) * 100);
    const initials = `${student.firstName[0]}${student.lastName[0]}`;

    const statusLabel = translateStatus(student.status || 'active') || t('student.statusActive');
    const razryadLabel = student.razryad
        ? translateRazryad(student.razryad)
        : t('student.razryadNotYet');

    // Get league info for card styling
    const currentRating = studentProfileData?.ratings?.current?.rating;
    const leagueInfo = getLeagueInfo(currentRating);
    const leagueTier = leagueInfo.tier || 'none';

    // Get razryad config for razryad info item styling
    const razryadConfig = typeof window.getRazryadConfig === 'function'
        ? window.getRazryadConfig(student.razryad)
        : { tier: 'none' };

    // Get avatar ring tier based on rankings (best of branch or school rank)
    const rankings = studentProfileData?.rankings || {};
    const avatarRingTier = getBestRankTier(rankings);

    // Create avatar HTML with ranking-based tier ring
    const avatarHTML = student.photoUrl
        ? `<div class="avatar avatar-ring--${avatarRingTier}" style="background: none; padding: 0; overflow: hidden;">
               <img src="${student.photoUrl}" alt="${student.firstName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">
           </div>`
        : `<div class="avatar avatar-ring--${avatarRingTier}">${initials}</div>`;

    // Check if user can edit and add edit button
    const hasEditPermission = canEditStudent();
    const editButtonHTML = hasEditPermission
        ? `<button class="edit-button" onclick="openEditModal()" title="${t('student.editProfile') || 'Edit Profile'}">
               <i data-lucide="edit-2" style="width: 18px; height: 18px;"></i>
               <span class="edit-button-text">${t('student.edit') || 'Edit'}</span>
           </button>`
        : '';

    // League badge HTML
    const leagueBadgeHTML = currentRating
        ? `<div class="league-badge tier-${leagueTier}">
               <i data-lucide="${leagueInfo.icon || 'shield'}" style="width: 16px; height: 16px;"></i>
               <span>${leagueInfo.name}</span>
           </div>`
        : '';

    // Rank badges (using rankings already declared above)
    let rankBadgesHTML = '';

    if (rankings.branch?.percentile) {
        const branchRank = formatPercentile(rankings.branch.percentile);
        if (branchRank) {
            rankBadgesHTML += `
                <div class="rank-badge tier-${branchRank.tier}">
                    <i data-lucide="users" style="width: 14px; height: 14px;"></i>
                    <span>${branchRank.label} ${t('rankings.inBranch') || 'in Branch'}</span>
                </div>
            `;
        }
    }

    if (rankings.school?.percentile) {
        const schoolRank = formatPercentile(rankings.school.percentile);
        if (schoolRank) {
            rankBadgesHTML += `
                <div class="rank-badge tier-${schoolRank.tier}">
                    <i data-lucide="school" style="width: 14px; height: 14px;"></i>
                    <span>${schoolRank.label} ${t('rankings.inSchool') || 'in School'}</span>
                </div>
            `;
        }
    }

    const profileHTML = `
        <div class="profile-header">
            ${avatarHTML}
            <div class="profile-info">
                <h1 class="student-name">${student.firstName} ${student.lastName}</h1>
                <div class="student-meta">
                    <span class="student-status">
                        <span class="status-dot"></span>
                        ${statusLabel}
                    </span>
                    <span class="student-details">${i18n.translateBranchName(student.branch)} • ${student.coach}</span>
                </div>
                <div class="badge-row">
                    ${leagueBadgeHTML}
                    ${rankBadgesHTML}
                </div>
            </div>
            ${editButtonHTML}
        </div>

        <!-- Tab Navigation -->
        <div class="tab-navigation">
            <button class="tab-button active" data-tab="overview" onclick="switchTab('overview')">
                <i data-lucide="layout-grid" style="width: 16px; height: 16px;"></i>
                <span>${t('tabs.overview') || 'Overview'}</span>
            </button>
            <button class="tab-button" data-tab="bots" onclick="switchTab('bots')">
                <i data-lucide="bot" style="width: 16px; height: 16px;"></i>
                <span>${t('tabs.bots') || 'Bots'}</span>
            </button>
            <button class="tab-button" data-tab="puzzles" onclick="switchTab('puzzles')">
                <i data-lucide="puzzle" style="width: 16px; height: 16px;"></i>
                <span>${t('tabs.puzzles') || 'Puzzles'}</span>
            </button>
            <button class="tab-button" data-tab="stats" onclick="switchTab('stats')">
                <i data-lucide="bar-chart-3" style="width: 16px; height: 16px;"></i>
                <span>${t('tabs.stats') || 'Stats'}</span>
            </button>
        </div>

        <!-- Tab Content -->
        <div class="tab-content active" id="tab-overview">
            <div class="overview-mobile-grid">
                <!-- Mobile order: 1. Branch rank, 2. School rank -->
                ${renderLevelRankInfoBoxes(rankings).branchRankHTML}
                ${renderLevelRankInfoBoxes(rankings).schoolRankHTML}

                <!-- Mobile order: 3. Razryad -->
                <div class="info-item razryad-info-item tier-${razryadConfig.tier} mobile-order-3">
                    <div class="info-label">
                        <i data-lucide="award" style="width: 14px; height: 14px;"></i>
                        ${t('student.razryad')}
                    </div>
                    <div class="info-value">${razryadLabel}</div>
                </div>

                <!-- Mobile order: 4. Learning Progress -->
                <div class="progress-section mobile-order-4">
                    <h2 class="section-title">
                        <i data-lucide="trending-up" style="width: 28px; height: 28px; color: #d97706;"></i>
                        ${t('student.learningProgress')}
                    </h2>

                    <div class="progress-item">
                        <div class="progress-header">
                            <div class="progress-label">${t('student.levelLabel') || 'Level'} ${student.currentLevel}</div>
                            <div class="progress-percentage">${lessonProgress}%</div>
                        </div>
                        <div class="progress-detail">${t('student.lessonDetail', { current: student.currentLesson, total: totalLessons })}</div>
                        <div class="progress-bar-container">
                            <div class="progress-bar" style="width: 0%" data-target="${lessonProgress}"></div>
                        </div>
                    </div>

                    <div class="progress-item rating-progress-item">
                        <div class="progress-header">
                            <div class="progress-label">
                                <i data-lucide="trending-up" style="width: 16px; height: 16px;"></i>
                                ${t('stats.rating') || 'Rating'}
                            </div>
                            <div class="progress-percentage rating-value-large">${currentRating || '—'}</div>
                        </div>
                        <div class="progress-detail rating-rank-detail">
                            ${rankings.schoolLevel?.rankInSchool
                                ? `#${rankings.schoolLevel.rankInSchool} ${t('rankings.ofTotal', { total: rankings.schoolLevel.totalInSchool }) || `of ${rankings.schoolLevel.totalInSchool}`}`
                                : t('rankings.noRank') || 'No rank yet'}
                        </div>
                    </div>
                </div>

                <!-- Mobile order: 5. Age -->
                <div class="info-item mobile-order-5">
                    <div class="info-label">
                        <i data-lucide="calendar" style="width: 14px; height: 14px;"></i>
                        ${t('student.age')}
                    </div>
                    <div class="info-value">${t('student.ageValue', { count: student.age })}</div>
                </div>

                <!-- Mobile order: 6. Branch -->
                <div class="info-item mobile-order-6">
                    <div class="info-label">
                        <i data-lucide="building" style="width: 14px; height: 14px;"></i>
                        ${t('student.branch')}
                    </div>
                    <div class="info-value">${i18n.translateBranchName(student.branch)}</div>
                </div>

                <!-- Mobile order: 7. Coach -->
                <div class="info-item mobile-order-7">
                    <div class="info-label">
                        <i data-lucide="user" style="width: 14px; height: 14px;"></i>
                        ${t('student.coach')}
                    </div>
                    <div class="info-value">${student.coach}</div>
                </div>

                <!-- Mobile order: 8. Bots defeated -->
                <div class="quick-stat-card mobile-order-8">
                    <div class="quick-stat-icon" style="background: #10b98120; color: #10b981;">
                        <i data-lucide="bot" style="width: 20px; height: 20px;"></i>
                    </div>
                    <div class="quick-stat-info">
                        <div class="quick-stat-value">${studentProfileData?.botProgress?.count || 0}/${studentProfileData?.botProgress?.total || 17}</div>
                        <div class="quick-stat-label">${t('bots.defeated') || 'Bots Defeated'}</div>
                    </div>
                </div>

                <!-- Mobile order: 9. Best score -->
                <div class="quick-stat-card mobile-order-9">
                    <div class="quick-stat-icon" style="background: #8b5cf620; color: #8b5cf6;">
                        <i data-lucide="zap" style="width: 20px; height: 20px;"></i>
                    </div>
                    <div class="quick-stat-info">
                        <div class="quick-stat-value">${studentProfileData?.survival?.best?.score || '—'}</div>
                        <div class="quick-stat-label">${t('survival.bestScore') || 'Best Survival'}</div>
                    </div>
                </div>

                ${currentRating ? `
                <!-- Rating card (hidden on mobile, shown on desktop) -->
                <div class="quick-stat-card mobile-hidden">
                    <div class="quick-stat-icon" style="background: ${leagueInfo.color}20; color: ${leagueInfo.color};">
                        <i data-lucide="trophy" style="width: 20px; height: 20px;"></i>
                    </div>
                    <div class="quick-stat-info">
                        <div class="quick-stat-value">${currentRating}</div>
                        <div class="quick-stat-label">${t('stats.rating') || 'Rating'}</div>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>

        <div class="tab-content" id="tab-bots">
            ${renderBotGrid()}
        </div>

        <div class="tab-content" id="tab-puzzles">
            ${renderSurvivalContent()}
        </div>

        <div class="tab-content" id="tab-stats">
            ${renderStatsContent()}
        </div>
    `;

    const container = document.getElementById('studentProfile');

    // Add league tier class to card
    container.className = `profile-card tier-card--${leagueTier}`;
    container.innerHTML = profileHTML;

    lucide.createIcons();
    animateProgressBars();
}

// Make tab switching globally available
window.switchTab = switchTab;

// Initialize on page load - use window.onload to ensure all scripts loaded
window.addEventListener('load', async () => {
    console.log('🚀 Page fully loaded, all scripts ready');
    updateDashboardButton();
    await initializeStudentProfile();
});

// Compress image helper
async function compressImage(file, maxWidth = 400, maxHeight = 400, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        resolve(new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        }));
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

// Preview photo for Edit Modal
async function previewEditPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
        showToast(t('admin.form.fileTooLarge') || 'File too large', 'error');
        event.target.value = '';
        return;
    }

    if (!file.type.match('image.*')) {
        showToast(t('admin.form.imageRequired') || 'Image required', 'error');
        event.target.value = '';
        return;
    }

    try {
        const compressedFile = await compressImage(file);
        const reader = new FileReader();
        reader.onload = function(e) {
            const photoPreview = document.getElementById('editPhotoPreview');
            photoPreview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;">`;
        };
        reader.readAsDataURL(compressedFile);

        window.editPhotoFile = compressedFile;
        window.editPhotoRemoved = false;
        document.getElementById('editRemovePhotoBtn').style.display = 'inline-flex';
        setTimeout(() => lucide.createIcons(), 50);
    } catch (error) {
        console.error('Error compressing image:', error);
        showToast(t('admin.form.imageRequired') || 'Error processing image', 'error');
        event.target.value = '';
    }
}

// Remove photo in Edit Modal
function removeEditPhoto() {
    const photoPreview = document.getElementById('editPhotoPreview');
    photoPreview.innerHTML = '<i data-lucide="user" style="width: 64px; height: 64px; color: #94a3b8;"></i>';
    document.getElementById('editPhotoUpload').value = '';
    document.getElementById('editRemovePhotoBtn').style.display = 'none';
    window.editPhotoRemoved = true;
    window.editPhotoFile = null;
    setTimeout(() => lucide.createIcons(), 50);
}

// Update coach options based on selected branch
function updateEditCoachOptions() {
    const branchSelect = document.getElementById('editBranchSelect');
    const coachSelect = document.getElementById('editCoachSelect');
    const selectedBranchId = branchSelect.value;

    if (!selectedBranchId) {
        coachSelect.innerHTML = `<option value="">${t('admin.modals.add.coachSelect') || 'Select Coach'}</option>`;
        return;
    }

    const branchCoaches = window.coaches?.filter(coach => coach.branchId === selectedBranchId) || [];

    coachSelect.innerHTML = `<option value="">${t('admin.modals.add.coachSelect') || 'Select Coach'}</option>`;
    branchCoaches.forEach(coach => {
        const option = document.createElement('option');
        option.value = coach.id;
        option.textContent = `${coach.firstName} ${coach.lastName}`;
        coachSelect.appendChild(option);
    });
}

// Open edit modal
async function openEditModal() {
    const student = window.currentStudent;
    if (!student) return;

    // Load branches and coaches if not already loaded
    if (!window.branches || !window.coaches) {
        if (window.supabaseData) {
            window.branches = await window.supabaseData.getBranches();
            window.coaches = await window.supabaseData.getCoaches();
        }
    }

    // Populate basic fields
    document.getElementById('editFirstName').value = student.firstName || '';
    document.getElementById('editLastName').value = student.lastName || '';
    document.getElementById('editAge').value = student.age || '';
    document.getElementById('editGender').value = student.gender || '';

    // Populate photo
    const photoPreview = document.getElementById('editPhotoPreview');
    if (student.photoUrl) {
        photoPreview.innerHTML = `<img src="${student.photoUrl}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;">`;
        document.getElementById('editRemovePhotoBtn').style.display = 'inline-flex';
    } else {
        photoPreview.innerHTML = '<i data-lucide="user" style="width: 64px; height: 64px; color: #94a3b8;"></i>';
        document.getElementById('editRemovePhotoBtn').style.display = 'none';
    }
    document.getElementById('editCurrentPhotoUrl').value = student.photoUrl || '';

    // Populate branch dropdown
    const branchSelect = document.getElementById('editBranchSelect');
    branchSelect.innerHTML = `<option value="">${t('admin.modals.add.branchSelect') || 'Select Branch'}</option>`;
    if (window.branches) {
        window.branches.forEach(branch => {
            const option = document.createElement('option');
            option.value = branch.id;
            option.textContent = branch.name;
            if (student.branchId === branch.id) {
                option.selected = true;
            }
            branchSelect.appendChild(option);
        });
    }

    // Populate coach dropdown based on selected branch
    updateEditCoachOptions();
    if (student.coachId) {
        document.getElementById('editCoachSelect').value = student.coachId;
    }

    // Populate razryad
    document.getElementById('editRazryadSelect').value = student.razryad || '';

    // Populate status
    document.getElementById('editStatusSelect').value = student.status || 'active';

    // Populate level and lesson
    document.getElementById('editCurrentLevel').value = student.currentLevel || 1;
    document.getElementById('editCurrentLesson').value = student.currentLesson || 1;

    // Populate bot progress checkboxes
    populateEditBotGrid();

    // Populate puzzle rush score
    const bestPuzzleScore = studentProfileData?.survival?.best?.score || 0;
    document.getElementById('editPuzzleRushScore').value = bestPuzzleScore || '';

    // Reset photo upload state
    window.editPhotoFile = null;
    window.editPhotoRemoved = false;

    // Show modal
    const modal = document.getElementById('editModal');
    modal.classList.add('active');

    // Apply translations and create icons
    setTimeout(() => {
        applyTranslations(modal);
        lucide.createIcons();
    }, 50);
}

// Close edit modal
function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
}

// Populate bot grid in edit modal with checkboxes
function populateEditBotGrid() {
    const bots = window.CHESS_BOTS || [];
    const defeatedBots = studentProfileData?.botProgress?.defeated || [];
    const defeatedSet = new Set(defeatedBots.map(b => (b.bot_name || b.botName || '').toLowerCase()));

    const container = document.getElementById('editBotGrid');
    if (!container) return;

    // Group bots by tier
    const tiers = {
        beginner: { label: t('bots.tiers.beginner') || 'Beginner', bots: [] },
        intermediate: { label: t('bots.tiers.intermediate') || 'Intermediate', bots: [] },
        advanced: { label: t('bots.tiers.advanced') || 'Advanced', bots: [] },
        master: { label: t('bots.tiers.master') || 'Master', bots: [] }
    };

    bots.forEach(bot => {
        if (tiers[bot.tier]) {
            tiers[bot.tier].bots.push(bot);
        }
    });

    let html = '';

    Object.entries(tiers).forEach(([tierKey, tierData]) => {
        if (tierData.bots.length === 0) return;

        html += `<div class="edit-bot-tier">
            <div class="edit-bot-tier-label" style="color: ${tierData.bots[0]?.color || '#64748b'}">${tierData.label}</div>
            <div class="edit-bot-tier-bots">`;

        tierData.bots.forEach(bot => {
            const isDefeated = defeatedSet.has(bot.name.toLowerCase());
            html += `
                <label class="edit-bot-checkbox ${isDefeated ? 'checked' : ''}">
                    <input type="checkbox"
                           name="bot_${bot.name}"
                           value="${bot.name}"
                           data-rating="${bot.rating}"
                           ${isDefeated ? 'checked' : ''}>
                    <span class="edit-bot-avatar" style="background: ${bot.color}">${bot.avatar}</span>
                    <span class="edit-bot-name">${bot.name}</span>
                    <span class="edit-bot-rating">${bot.rating}</span>
                </label>`;
        });

        html += `</div></div>`;
    });

    container.innerHTML = html;

    // Add change listeners to update visual state
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            this.closest('.edit-bot-checkbox').classList.toggle('checked', this.checked);
        });
    });
}

// Save bot progress changes from edit modal
async function saveBotProgressFromModal(studentId) {
    const container = document.getElementById('editBotGrid');
    if (!container || !window.supabaseData) return;

    const defeatedBots = studentProfileData?.botProgress?.defeated || [];
    const previouslyDefeatedSet = new Set(defeatedBots.map(b => (b.bot_name || b.botName || '').toLowerCase()));

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');

    for (const checkbox of checkboxes) {
        const botName = checkbox.value;
        const botRating = parseInt(checkbox.dataset.rating) || 0;
        const isChecked = checkbox.checked;
        const wasDefeated = previouslyDefeatedSet.has(botName.toLowerCase());

        // If state changed, update in database
        if (isChecked && !wasDefeated) {
            // Add bot win
            try {
                await window.supabaseData.addBotBattleWin(studentId, botName, botRating);
            } catch (error) {
                console.error(`Error adding bot win for ${botName}:`, error);
            }
        } else if (!isChecked && wasDefeated) {
            // Remove bot win
            try {
                await window.supabaseData.removeBotBattleWin(studentId, botName);
            } catch (error) {
                console.error(`Error removing bot win for ${botName}:`, error);
            }
        }
    }
}

// Save puzzle rush score from edit modal
async function savePuzzleRushFromModal(studentId) {
    const scoreInput = document.getElementById('editPuzzleRushScore');
    if (!scoreInput || !window.supabaseData) return;

    const newScore = parseInt(scoreInput.value) || 0;
    const currentBestScore = studentProfileData?.survival?.best?.score || 0;

    // Only save if score is greater than current best (or if there's no current score)
    if (newScore > 0 && newScore !== currentBestScore) {
        try {
            await window.supabaseData.addSurvivalScore(studentId, newScore, 'puzzle_rush', 'Updated via edit form');
        } catch (error) {
            console.error('Error saving puzzle rush score:', error);
        }
    }
}

// Save student edits
async function saveStudentEdits(event) {
    if (event) event.preventDefault();

    const student = window.currentStudent;
    if (!student) return;

    // Get form values
    const firstName = document.getElementById('editFirstName').value.trim();
    const lastName = document.getElementById('editLastName').value.trim();
    const age = parseInt(document.getElementById('editAge').value) || null;
    const gender = document.getElementById('editGender').value || null;
    const razryad = document.getElementById('editRazryadSelect').value || 'none';
    const status = document.getElementById('editStatusSelect').value || 'active';
    const currentLevel = parseInt(document.getElementById('editCurrentLevel').value) || student.currentLevel;
    const currentLesson = parseInt(document.getElementById('editCurrentLesson').value) || student.currentLesson;

    // Get branch and coach IDs from dropdowns
    const branchId = document.getElementById('editBranchSelect').value || null;
    const coachId = document.getElementById('editCoachSelect').value || null;

    // Validate required fields
    if (!firstName || !lastName) {
        showToast(t('admin.form.requiredFields') || 'First name and last name are required', 'error');
        return;
    }

    // Prepare student data (using camelCase for Supabase client)
    const studentData = {
        firstName: firstName,
        lastName: lastName,
        age: age,
        gender: gender,
        branchId: branchId,
        coachId: coachId,
        razryad: razryad,
        status: status,
        currentLevel: currentLevel,
        currentLesson: currentLesson,
        photoUrl: student.photoUrl // Keep existing photo by default
    };

    try {
        // Show loading state
        const saveButton = document.querySelector('.btn-primary[form="editStudentForm"]');
        if (saveButton) {
            const originalHTML = saveButton.innerHTML;
            saveButton.disabled = true;
            saveButton.innerHTML = '<i data-lucide="loader" style="width: 18px; height: 18px; animation: spin 1s linear infinite;"></i><span>' + (t('common.saving') || 'Saving...') + '</span>';
        }

        // Handle photo upload/removal
        const currentPhotoUrl = document.getElementById('editCurrentPhotoUrl').value;

        // If photo was removed
        if (window.editPhotoRemoved) {
            // Delete old photo from storage
            if (currentPhotoUrl && window.supabaseData) {
                await window.supabaseData.deleteStudentPhoto(currentPhotoUrl);
            }
            studentData.photoUrl = null;
        }
        // If new photo was selected
        else if (window.editPhotoFile) {
            // Delete old photo first
            if (currentPhotoUrl && window.supabaseData) {
                await window.supabaseData.deleteStudentPhoto(currentPhotoUrl);
            }
            // Upload new photo
            if (window.supabaseData) {
                const newPhotoUrl = await window.supabaseData.uploadStudentPhoto(window.editPhotoFile, student.id);
                studentData.photoUrl = newPhotoUrl;
            }
        }

        // Update student in Supabase using the proper data layer function
        // This handles camelCase -> snake_case transformation
        if (window.supabaseData) {
            const updatedStudent = await window.supabaseData.updateStudent(student.id, studentData);

            // Update local student object with the transformed data
            Object.assign(window.currentStudent, updatedStudent);
            window.currentStudentName = `${firstName} ${lastName}`;

            // Save bot progress changes
            await saveBotProgressFromModal(student.id);

            // Save puzzle rush score if changed
            await savePuzzleRushFromModal(student.id);

            // Reload profile data to reflect bot/puzzle changes
            await loadStudentProfileData(student.id);

            // Re-render profile
            renderProfile();

            // Close modal
            closeEditModal();

            // Show success message
            showToast(t('admin.form.editSuccess') || 'Student profile updated successfully', 'success');

            // Update title
            if (typeof window.updateStudentTitle === 'function') {
                window.updateStudentTitle(window.currentStudentName);
            }
        } else {
            throw new Error('Supabase client not available');
        }
    } catch (error) {
        console.error('Error updating student:', error);
        // Show detailed error message for debugging
        const errorMessage = error.message || error.toString();
        showToast(`${t('admin.error.updateFailed') || 'Failed to update student profile'}: ${errorMessage}`, 'error');
    } finally {
        // Reset button state
        const saveButton = document.querySelector('.btn-primary[form="editStudentForm"]');
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML = '<i data-lucide="save" style="width: 18px; height: 18px;"></i><span>' + (t('admin.modals.edit.save') || 'Save Changes') + '</span>';
            setTimeout(() => lucide.createIcons(), 50);
        }
    }
}

// Make functions globally available
window.canEditStudent = canEditStudent;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveStudentEdits = saveStudentEdits;
window.previewEditPhoto = previewEditPhoto;
window.removeEditPhoto = removeEditPhoto;
window.updateEditCoachOptions = updateEditCoachOptions;

// Re-render on language change
document.addEventListener('languagechange', () => {
    if (typeof window.updateStudentTitle === 'function') {
        window.updateStudentTitle(window.currentStudentName);
    }
    if (window.currentStudent) {
        renderProfile();
    }
});

// Re-render when auth session is established to show edit button
document.addEventListener('sessionestablished', () => {
    if (window.currentStudent) {
        renderProfile();
    }
});
