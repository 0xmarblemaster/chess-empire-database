/**
 * Chess Empire - Constants Configuration
 * Bot definitions, league classifications, survival tiers, and achievement data
 */

// ============================================
// CHESS.COM BOTS CONFIGURATION
// ============================================
const CHESS_BOTS = [
    // Beginner Tier (250-850)
    { name: 'Martin', rating: 250, tier: 'beginner', avatar: 'M', color: '#94a3b8' },
    { name: 'Juan', rating: 400, tier: 'beginner', avatar: 'J', color: '#94a3b8' },
    { name: 'Oliver', rating: 550, tier: 'beginner', avatar: 'O', color: '#94a3b8' },
    { name: 'Mina', rating: 700, tier: 'beginner', avatar: 'M', color: '#94a3b8' },
    { name: 'Zara', rating: 850, tier: 'beginner', avatar: 'Z', color: '#94a3b8' },

    // Intermediate Tier (1000-1400)
    { name: 'Maria', rating: 1000, tier: 'intermediate', avatar: 'M', color: '#10b981' },
    { name: 'Sven', rating: 1100, tier: 'intermediate', avatar: 'S', color: '#10b981' },
    { name: 'Emir', rating: 1200, tier: 'intermediate', avatar: 'E', color: '#10b981' },
    { name: 'Nelson', rating: 1300, tier: 'intermediate', avatar: 'N', color: '#10b981' },
    { name: 'Mateo', rating: 1400, tier: 'intermediate', avatar: 'M', color: '#10b981' },

    // Advanced Tier (1500-2000)
    { name: 'Wendy', rating: 1500, tier: 'advanced', avatar: 'W', color: '#3b82f6' },
    { name: 'Joel', rating: 1600, tier: 'advanced', avatar: 'J', color: '#3b82f6' },
    { name: 'Isla', rating: 1700, tier: 'advanced', avatar: 'I', color: '#3b82f6' },
    { name: 'Wally', rating: 1800, tier: 'advanced', avatar: 'W', color: '#3b82f6' },
    { name: 'Miguel', rating: 1900, tier: 'advanced', avatar: 'M', color: '#3b82f6' },
    { name: 'Charles', rating: 2000, tier: 'advanced', avatar: 'C', color: '#3b82f6' },

    // Master Tier (2200-2400)
    { name: 'Nora', rating: 2200, tier: 'master', avatar: 'N', color: '#d97706' },
    { name: 'Arjun', rating: 2300, tier: 'master', avatar: 'A', color: '#d97706' },
    { name: 'Wei', rating: 2400, tier: 'master', avatar: 'W', color: '#d97706' }
];

// Total number of bots for progress tracking
const TOTAL_BOTS = CHESS_BOTS.length;

// Get bot by name
function getBotByName(name) {
    return CHESS_BOTS.find(bot => bot.name.toLowerCase() === name.toLowerCase());
}

// Get bot by rating (closest match)
function getBotByRating(rating) {
    return CHESS_BOTS.reduce((closest, bot) => {
        return Math.abs(bot.rating - rating) < Math.abs(closest.rating - rating) ? bot : closest;
    });
}

// Get next undefeated bot
function getNextTargetBot(defeatedBotNames) {
    const defeatedSet = new Set(defeatedBotNames.map(n => n.toLowerCase()));
    return CHESS_BOTS.find(bot => !defeatedSet.has(bot.name.toLowerCase()));
}

// ============================================
// LEAGUE CLASSIFICATIONS
// ============================================
const LEAGUES = {
    'Beginner': {
        min: 0,
        max: 399,
        color: '#94a3b8',
        bgGradient: 'linear-gradient(135deg, #f8fafc 0%, #e8eef5 100%)',
        tier: 'none',
        icon: 'circle-dot'
    },
    'League C': {
        min: 400,
        max: 899,
        color: '#cd7f32',
        bgGradient: 'linear-gradient(135deg, #fef3c7 0%, #fed7aa 100%)',
        tier: 'bronze',
        icon: 'shield'
    },
    'League B': {
        min: 900,
        max: 1199,
        color: '#c0c0c0',
        bgGradient: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
        tier: 'silver',
        icon: 'shield-check'
    },
    'League A': {
        min: 1200,
        max: 1499,
        color: '#ffd700',
        bgGradient: 'linear-gradient(135deg, #fef9c3 0%, #fde68a 100%)',
        tier: 'gold',
        icon: 'award'
    },
    'League A+': {
        min: 1500,
        max: 9999,
        color: '#0ea5e9',
        bgGradient: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
        tier: 'diamond',
        icon: 'crown'
    }
};

// Get league from rating - thresholds: 1200+ A+, 900+ A, 500+ B, 0+ C
function getLeagueFromRating(rating) {
    if (rating >= 1200) return LEAGUES['League A+'];
    if (rating >= 900) return LEAGUES['League A'];
    if (rating >= 500) return LEAGUES['League B'];
    if (rating >= 0) return LEAGUES['League C'];
    return LEAGUES['Beginner'];
}

// Get league name from rating
function getLeagueName(rating) {
    if (rating >= 1200) return 'League A+';
    if (rating >= 900) return 'League A';
    if (rating >= 500) return 'League B';
    if (rating >= 0) return 'League C';
    return 'Beginner';
}

// Get points needed for next league
function getPointsToNextLeague(rating) {
    if (rating >= 1200) return { next: null, needed: 0 };
    if (rating >= 900) return { next: 'League A+', needed: 1200 - rating };
    if (rating >= 500) return { next: 'League A', needed: 900 - rating };
    if (rating >= 0) return { next: 'League B', needed: 500 - rating };
    return { next: 'League C', needed: 0 };
}

// ============================================
// PUZZLE RUSH LEVELS CONFIGURATION
// ============================================
const PUZZLE_RUSH_LEVELS = [
    // Beginner Tier (6-10)
    { level: 1, target: 6, tier: 'beginner', color: '#94a3b8' },
    { level: 2, target: 10, tier: 'beginner', color: '#94a3b8' },

    // Intermediate Tier (15-20)
    { level: 3, target: 15, tier: 'intermediate', color: '#10b981' },
    { level: 4, target: 20, tier: 'intermediate', color: '#10b981' },

    // Advanced Tier (25-30)
    { level: 5, target: 25, tier: 'advanced', color: '#3b82f6' },
    { level: 6, target: 30, tier: 'advanced', color: '#3b82f6' },

    // Expert Tier (35-40)
    { level: 7, target: 35, tier: 'expert', color: '#8b5cf6' },
    { level: 8, target: 40, tier: 'expert', color: '#8b5cf6' },

    // Master Tier (45-60)
    { level: 9, target: 45, tier: 'master', color: '#d97706' },
    { level: 10, target: 50, tier: 'master', color: '#d97706' },
    { level: 11, target: 55, tier: 'master', color: '#d97706' },
    { level: 12, target: 60, tier: 'master', color: '#d97706' }
];

// Get puzzle rush level from score
function getPuzzleRushLevel(score) {
    if (!score || score < 6) return null;
    for (let i = PUZZLE_RUSH_LEVELS.length - 1; i >= 0; i--) {
        if (score >= PUZZLE_RUSH_LEVELS[i].target) {
            return PUZZLE_RUSH_LEVELS[i];
        }
    }
    return null;
}

// Get next puzzle rush target
function getNextPuzzleRushTarget(score) {
    if (!score) return PUZZLE_RUSH_LEVELS[0];
    for (const level of PUZZLE_RUSH_LEVELS) {
        if (score < level.target) {
            return level;
        }
    }
    return null; // All levels completed
}

// ============================================
// SURVIVAL MODE TIERS (Legacy - kept for compatibility)
// ============================================
const SURVIVAL_TIERS = {
    beginner: {
        min: 0,
        max: 9,
        label: 'Beginner',
        labelRu: 'Начинающий',
        labelKk: 'Бастаушы',
        color: '#94a3b8',
        icon: 'circle'
    },
    intermediate: {
        min: 10,
        max: 19,
        label: 'Intermediate',
        labelRu: 'Средний',
        labelKk: 'Орташа',
        color: '#10b981',
        icon: 'triangle'
    },
    advanced: {
        min: 20,
        max: 29,
        label: 'Advanced',
        labelRu: 'Продвинутый',
        labelKk: 'Озық',
        color: '#3b82f6',
        icon: 'square'
    },
    expert: {
        min: 30,
        max: 39,
        label: 'Expert',
        labelRu: 'Эксперт',
        labelKk: 'Сарапшы',
        color: '#8b5cf6',
        icon: 'pentagon'
    },
    master: {
        min: 40,
        max: 54,
        label: 'Master',
        labelRu: 'Мастер',
        labelKk: 'Шебер',
        color: '#d97706',
        icon: 'hexagon'
    },
    grandmaster: {
        min: 55,
        max: 99,
        label: 'Grandmaster',
        labelRu: 'Гроссмейстер',
        labelKk: 'Гроссмейстер',
        color: '#ef4444',
        icon: 'star'
    }
};

// Get survival tier from score
function getSurvivalTier(score) {
    if (score >= 55) return SURVIVAL_TIERS.grandmaster;
    if (score >= 40) return SURVIVAL_TIERS.master;
    if (score >= 30) return SURVIVAL_TIERS.expert;
    if (score >= 20) return SURVIVAL_TIERS.advanced;
    if (score >= 10) return SURVIVAL_TIERS.intermediate;
    return SURVIVAL_TIERS.beginner;
}

// Get survival tier name
function getSurvivalTierName(score, lang = 'en') {
    const tier = getSurvivalTier(score);
    if (lang === 'ru') return tier.labelRu;
    if (lang === 'kk') return tier.labelKk;
    return tier.label;
}

// ============================================
// TIER COLORS (for badges, borders, etc.)
// ============================================
const TIER_COLORS = {
    none: {
        primary: '#94a3b8',
        secondary: '#cbd5e1',
        bg: '#f8fafc',
        border: '#e2e8f0',
        glow: 'none'
    },
    bronze: {
        primary: '#cd7f32',
        secondary: '#b8860b',
        bg: '#fef3c7',
        border: '#cd7f32',
        glow: '0 0 10px rgba(205, 127, 50, 0.3)'
    },
    silver: {
        primary: '#c0c0c0',
        secondary: '#a8a8a8',
        bg: '#f1f5f9',
        border: '#c0c0c0',
        glow: '0 0 10px rgba(192, 192, 192, 0.4)'
    },
    gold: {
        primary: '#ffd700',
        secondary: '#daa520',
        bg: '#fef9c3',
        border: '#ffd700',
        glow: '0 0 15px rgba(255, 215, 0, 0.4)'
    },
    platinum: {
        primary: '#e5e4e2',
        secondary: '#a0aec0',
        bg: '#f0f4f8',
        border: '#e5e4e2',
        glow: '0 0 15px rgba(229, 228, 226, 0.5)'
    },
    diamond: {
        primary: '#0ea5e9',
        secondary: '#0284c7',
        bg: '#e0f2fe',
        border: '#0ea5e9',
        glow: '0 0 20px rgba(14, 165, 233, 0.4)'
    }
};

// Get tier colors
function getTierColors(tier) {
    return TIER_COLORS[tier] || TIER_COLORS.none;
}

// ============================================
// RAZRYAD CONFIGURATION
// ============================================
const RAZRYAD_CONFIG = {
    'none': {
        order: 0,
        tier: 'none',
        labelEn: 'No Razryad',
        labelRu: 'Без разряда',
        labelKk: 'Разрядсыз'
    },
    '4th': {
        order: 1,
        tier: 'silver',
        labelEn: '4th Razryad',
        labelRu: '4 разряд',
        labelKk: '4 разряд'
    },
    '3rd': {
        order: 2,
        tier: 'gold',
        labelEn: '3rd Razryad',
        labelRu: '3 разряд',
        labelKk: '3 разряд'
    },
    '2nd': {
        order: 3,
        tier: 'diamond',
        labelEn: '2nd Razryad',
        labelRu: '2 разряд',
        labelKk: '2 разряд'
    },
    '1st': {
        order: 4,
        tier: 'gold',
        labelEn: '1st Razryad',
        labelRu: '1 разряд',
        labelKk: '1 разряд'
    },
    'kms': {
        order: 5,
        tier: 'platinum',
        labelEn: 'Candidate Master',
        labelRu: 'КМС',
        labelKk: 'ХШҚ'
    },
    'master': {
        order: 6,
        tier: 'diamond',
        labelEn: 'Master',
        labelRu: 'Мастер',
        labelKk: 'Шебер'
    }
};

// Get razryad configuration
function getRazryadConfig(razryad) {
    return RAZRYAD_CONFIG[razryad] || RAZRYAD_CONFIG.none;
}

// Get highest tier between razryad and league
function getHighestTier(razryad, leagueTier) {
    const tierOrder = ['none', 'bronze', 'silver', 'gold', 'platinum', 'diamond'];
    const razryadTier = getRazryadConfig(razryad).tier;
    const razryadIndex = tierOrder.indexOf(razryadTier);
    const leagueIndex = tierOrder.indexOf(leagueTier);
    return tierOrder[Math.max(razryadIndex, leagueIndex)];
}

// ============================================
// PERCENTILE LABELS
// ============================================
function getPercentileLabel(percentile) {
    if (percentile >= 99) return { label: 'Top 1%', tier: 'diamond' };
    if (percentile >= 95) return { label: 'Top 5%', tier: 'platinum' };
    if (percentile >= 90) return { label: 'Top 10%', tier: 'gold' };
    if (percentile >= 75) return { label: 'Top 25%', tier: 'silver' };
    if (percentile >= 50) return { label: 'Top 50%', tier: 'bronze' };
    return { label: `Top ${Math.round(100 - percentile)}%`, tier: 'none' };
}

// ============================================
// EXPORT TO GLOBAL SCOPE
// ============================================
window.CHESS_BOTS = CHESS_BOTS;
window.TOTAL_BOTS = TOTAL_BOTS;
window.LEAGUES = LEAGUES;
window.SURVIVAL_TIERS = SURVIVAL_TIERS;
window.PUZZLE_RUSH_LEVELS = PUZZLE_RUSH_LEVELS;
window.TIER_COLORS = TIER_COLORS;
window.RAZRYAD_CONFIG = RAZRYAD_CONFIG;

// Helper functions
window.getBotByName = getBotByName;
window.getBotByRating = getBotByRating;
window.getNextTargetBot = getNextTargetBot;
window.getLeagueFromRating = getLeagueFromRating;
window.getLeagueName = getLeagueName;
window.getPointsToNextLeague = getPointsToNextLeague;
window.getSurvivalTier = getSurvivalTier;
window.getSurvivalTierName = getSurvivalTierName;
window.getPuzzleRushLevel = getPuzzleRushLevel;
window.getNextPuzzleRushTarget = getNextPuzzleRushTarget;
window.getTierColors = getTierColors;
window.getRazryadConfig = getRazryadConfig;
window.getHighestTier = getHighestTier;
window.getPercentileLabel = getPercentileLabel;
