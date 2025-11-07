/**
 * Toast Notification System
 * Provides consistent toast notifications across the application
 */

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - Type of notification: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
function showToast(message, type = 'success', duration = 3000) {
    // Create notification element
    const notification = document.createElement('div');

    // Get colors and icon based on type
    const styles = {
        success: {
            gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            shadow: 'rgba(16, 185, 129, 0.3)',
            icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>`
        },
        error: {
            gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            shadow: 'rgba(239, 68, 68, 0.3)',
            icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>`
        },
        warning: {
            gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            shadow: 'rgba(245, 158, 11, 0.3)',
            icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>`
        },
        info: {
            gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            shadow: 'rgba(59, 130, 246, 0.3)',
            icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>`
        }
    };

    const style = styles[type] || styles.success;

    notification.style.cssText = `
        position: fixed;
        top: 2rem;
        right: 2rem;
        background: ${style.gradient};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.75rem;
        box-shadow: 0 10px 25px -5px ${style.shadow};
        font-weight: 600;
        font-size: 0.9375rem;
        z-index: 2000;
        animation: slideInRight 0.3s ease-out;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        max-width: 400px;
        word-wrap: break-word;
    `;

    notification.innerHTML = `
        ${style.icon}
        <span>${message}</span>
    `;

    document.body.appendChild(notification);

    // Remove after specified duration
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, duration);
}

// Add animations if they don't exist
if (!document.getElementById('toast-animations')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'toast-animations';
    styleSheet.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(400px);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(styleSheet);
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.showToast = showToast;
}
