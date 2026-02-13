# Mobile More Menu + User Activity Dashboard

## Changes (2026-02-13)

### 1. New "More" Menu Section (`admin.html`)
- Added `#moreMenuSection` content section with menu items for:
  - User Activity, Activity Log, Status History, User Sessions, Ratings
  - Logout button with divider
- Each item has a colored icon, label with i18n support, and chevron indicator
- Items navigate via `showMobileSection()` to their respective sections

### 2. JavaScript Changes (`admin.js`)
- **`showSection()`**: Added handlers for `'settings'`/`'moreMenu'` → switches to moreMenu section + re-initializes lucide icons; added `'ratings'` → switches to ratings section
- **`mobileSectionTitles`**: Added entries for `userActivity`, `activityLog`, `statusHistory`, `sessions`, `ratings` so mobile header shows correct titles
- **`showMobileSection()`**: Added logic to keep "More" bottom nav tab highlighted when navigating to any sub-section (userActivity, activityLog, statusHistory, sessions, ratings, moreMenu, settings)

### 3. Mobile CSS (`admin-styles.css`)
- **More Menu styles**: `.more-menu-list`, `.more-menu-item`, `.more-menu-icon`, `.more-menu-chevron`, `.more-menu-divider`, `.more-menu-logout`
- **User Activity responsive** (`@media max-width: 768px`):
  - Summary cards: 2×2 grid layout
  - Period filter: horizontal scrollable pills
  - Tables: compact font, scrollable
  - Session history: card-style rows (hidden thead)
  - User selector: full-width, 16px font (prevents iOS zoom)
  - Session actions modal: full-screen on mobile
  - Header: stacked layout with full-width actions

### Notes
- All changes are additive — desktop layout unchanged
- Responsive rules scoped to `@media (max-width: 768px)`
- Commit: `9314d8c` on `main`
