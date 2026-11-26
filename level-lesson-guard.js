/**
 * Level/Lesson guard for the student edit modals (student.html + admin-v2.html).
 *
 * Rule: a coach/admin may not change a student's Level ("ступень") without also
 * changing the Lesson number. Lowering the level counts as a change too.
 * Values are the *effective* ones the save would write (after the modal's
 * "blank → keep existing" fallback), so a blank Lesson counts as unchanged.
 */
(function (root) {
    'use strict';

    function toInt(v) {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
    }

    function validateLevelLessonChange(orig, next) {
        const levelChanged = toInt(next.level) !== toInt(orig.level);
        const lessonChanged = toInt(next.lesson) !== toInt(orig.lesson);
        return { ok: !levelChanged || lessonChanged, levelChanged, lessonChanged };
    }

    // Highlight the Lesson input and move focus to it; clears on the next edit.
    function flagLessonField(inputId) {
        if (typeof document === 'undefined') return;
        const input = document.getElementById(inputId || 'editCurrentLesson');
        if (!input) return;
        input.style.borderColor = '#ef4444';
        input.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.25)';
        input.setAttribute('aria-invalid', 'true');
        input.addEventListener('input', function clear() {
            input.style.borderColor = '';
            input.style.boxShadow = '';
            input.removeAttribute('aria-invalid');
            input.removeEventListener('input', clear);
        });
        input.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        input.focus();
        input.select?.();
    }

    const api = { validateLevelLessonChange, flagLessonField };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) Object.assign(root, api);
})(typeof window !== 'undefined' ? window : null);
