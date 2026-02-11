# Chess Empire Analytics & System Guide

**Version:** 1.0
**Last Updated:** 2026-02-11
**Target Audience:** Developers, System Administrators, New Team Members

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Overview & History](#2-project-overview--history)
3. [System Architecture](#3-system-architecture)
4. [Analytics Section Deep Dive](#4-analytics-section-deep-dive)
5. [User Roles & Permissions](#5-user-roles--permissions)
6. [Database Schema](#6-database-schema)
7. [Frontend Architecture](#7-frontend-architecture)
8. [Backend API Reference](#8-backend-api-reference)
9. [Common Implementation Patterns](#9-common-implementation-patterns)
10. [Troubleshooting Guide](#10-troubleshooting-guide)
11. [Future Enhancements](#11-future-enhancements)
12. [Appendices](#appendices)

---

## 1. Executive Summary

### What is Chess Empire?

Chess Empire is a comprehensive student management system designed for chess academies and educational institutions. It tracks students across multiple branches, manages coaching assignments, monitors attendance, and maintains detailed analytics of system usage and student progress.

**Key Users:**
- 👨‍💼 Admins: Full system access
- 👨‍🏫 Coaches: Manage their assigned students
- 📊 Viewers: Read-only access to student data

### Key Features at a Glance

| Feature | Status | Purpose |
|---------|--------|---------|
| Student Management | ✅ Complete | CRUD operations on student records |
| Coach Management | ✅ Complete | Manage coaches and their assignments |
| Branch Management | ✅ Complete | Handle multiple academy locations |
| Attendance Tracking | ✅ Complete | Record and analyze student attendance |
| Activity Log (Audit) | ✅ Complete | Track all CRUD changes with user attribution |
| Status History | ✅ Complete | Monitor student status transitions |
| User Sessions | ⚠️ Partial | Infrastructure ready, tracking not integrated |
| Multi-Language Support | ✅ Complete | English, Russian, Kazakh |
| Role-Based Access Control | ✅ Complete | 8 granular permission flags |
| Data Import/Export | ✅ Complete | CSV support for data migration |

### Quick Start for Developers

```bash
# 1. Clone the repository
git clone <repo-url>
cd chess-empire-database

# 2. Read the primary documentation
cat README.md                    # Quick start
cat ARCHITECTURE_DIAGRAM.md      # System overview
cat ANALYTICS_AND_SYSTEM_GUIDE.md # This file (detailed reference)

# 3. Review the database schema
cat migrations/001_initial_schema.sql

# 4. Explore the frontend
ls -la *.html                    # UI components
ls -la *.js                      # Business logic
cat supabase-data.js | head -100 # Data access patterns

# 5. Set up your environment
# See DEPLOYMENT_GUIDE.md for setup instructions
```

---

## 2. Project Overview & History

### Project Genesis

Chess Empire evolved from a need to manage students across multiple chess academy branches. The system has grown through several phases, each adding significant features and improvements.

### Technology Stack Decisions

```
Frontend:
  - HTML5 for structure
  - Vanilla JavaScript (no frameworks) for simplicity
  - CSS3 for responsive design
  - Bootstrap integration for UI components

Backend:
  - Supabase (PostgreSQL) for database
  - Supabase Auth for JWT-based authentication
  - Row-Level Security (RLS) for data isolation
  - SQL triggers for automatic tracking

Deployment:
  - Vercel for frontend hosting
  - Digital Ocean droplet for backend services
  - GitHub for version control
  - GitHub Actions for CI/CD (potential future)

Localization:
  - i18n.js for 3-language support
  - English, Russian, Kazakh translations
  - 185,000+ translation strings
```

### Major Milestones

**Phase 1: Foundation (Initial)**
- Student and coach management
- Basic CRUD operations
- Multi-branch support
- Authentication system

**Phase 2: Attendance**
- Attendance tracking system
- Schedule management
- Time slot assignments
- Attendance reports

**Phase 3: Analytics Foundation**
- Activity Log (Audit Log) - Complete
- Status History tracking - Complete
- User Sessions infrastructure - Ready

**Phase 4: Internationalization**
- Added Russian language support
- Added Kazakh language support
- 3-language UI system

**Phase 5: Role-Based Access Control**
- 8-flag permission system
- Admin/Coach/Viewer roles
- Granular feature access

**Phase 6: Advanced Features**
- Schedule variations (Mon-Wed, Tue-Thu, Sat-Sun, Mon-Wed-Fri, Wed-Fri)
- Branch-specific customizations
- Data import/export

**Phase 7: Current**
- Continued optimization
- Analytics refinement
- Documentation expansion

### Current Status & Roadmap

**Completed:**
- ✅ All core CRUD operations
- ✅ Multi-branch support
- ✅ Attendance tracking
- ✅ Activity Log
- ✅ Status History
- ✅ Role-based permissions
- ✅ Multi-language interface
- ✅ Schedule type management

**In Progress:**
- 🔄 User Sessions tracking integration
- 🔄 Comprehensive documentation

**Planned:**
- 📋 Advanced data visualization
- 📋 Email notifications
- 📋 Custom reporting
- 📋 Session expiry management
- 📋 IP address tracking for security

---

## 3. System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (User Browser)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ index.html   │  │ admin.html   │  │ Other Pages          │   │
│  │ (Public)     │  │ (Dashboard)  │  │ (student, coach...)  │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│         │                  │                      │              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │            JavaScript Layer                              │   │
│  │  ┌─────────────────────┐  ┌──────────────────────────┐  │   │
│  │  │ supabase-data.js    │  │ admin.js, crud.js, etc.  │  │   │
│  │  │ (Data Access Layer) │  │ (Business Logic)         │  │   │
│  │  └─────────────────────┘  └──────────────────────────┘  │   │
│  │                                                          │   │
│  │  ┌────────────────────────────────────────────────────┐ │   │
│  │  │ i18n.js (185,000+ translation strings)           │ │   │
│  │  │ EN, RU, KZ                                        │ │   │
│  │  └────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                    HTTPS/REST API
                             │
┌────────────────────────────┴─────────────────────────────────────┐
│                    Supabase Backend                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           PostgreSQL Database (18 Tables)                │   │
│  │                                                          │   │
│  │  Core Tables:                                           │   │
│  │  • auth.users (Supabase Auth)                          │   │
│  │  • user_roles (Permissions & roles)                    │   │
│  │  • students, coaches, branches                         │   │
│  │  • attendance, student_time_slot_assignments           │   │
│  │                                                        │   │
│  │  Analytics Tables:                                      │   │
│  │  • audit_log (Change tracking)                         │   │
│  │  • student_status_history (Status changes)             │   │
│  │  • user_sessions (Login/logout tracking)               │   │
│  │                                                        │   │
│  │  Supporting:                                            │   │
│  │  • coach_branches (Many-to-many junction)              │   │
│  │  • And others...                                        │   │
│  │                                                        │   │
│  │  Row Level Security (RLS): ✅ Enabled                  │   │
│  │  Triggers: ✅ Active (5 major triggers)               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Database Functions & Triggers              │   │
│  │  • log_entity_changes() - Audit log population        │   │
│  │  • track_status_changes() - Status history tracking   │   │
│  │  • on_auth_user_created() - New user initialization   │   │
│  │  • And 10+ additional helper functions               │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Frontend Architecture

```
chess-empire-database/
├── index.html              # Public homepage, student search
├── login.html              # Authentication page
├── admin.html              # Admin dashboard (MAIN INTERFACE)
├── student.html            # Student profile page
├── coach.html              # Coach profile page
├── branch.html             # Branch details page
├── register.html           # User registration page
│
├── supabase-client.js      # Supabase SDK initialization
├── supabase-data.js        # DATA LAYER (3,056 lines)
│                          # All database queries centralized here
├── admin.js                # Admin dashboard logic (1,379 lines)
├── crud.js                 # CRUD helper functions
├── i18n.js                 # Internationalization (185,245 lines)
│
├── styles/
│   ├── style.css           # Main stylesheet
│   └── ...other CSS files
│
├── migrations/             # Database migrations (001-046)
├── supabase-schema.sql     # Database schema definition
│
├── README.md               # Quick start guide
├── ARCHITECTURE_DIAGRAM.md # System architecture
├── DEPLOYMENT_GUIDE.md     # Deployment instructions
└── ANALYTICS_AND_SYSTEM_GUIDE.md # This file
```

### Backend Architecture

```
Supabase PostgreSQL Database
│
├── Authentication Layer
│   └── auth.users (Supabase managed)
│       └── Firebase/Google OAuth compatible
│
├── Authorization Layer
│   ├── user_roles table (Permissions & roles)
│   ├── RLS policies (Row-level security)
│   └── Helper functions (is_admin, get_user_role)
│
├── Core Data Layer
│   ├── students (15 fields, ~500 records)
│   ├── coaches (7 fields, ~50 records)
│   ├── branches (8 branches fixed)
│   ├── coach_branches (Many-to-many)
│   ├── attendance
│   └── student_time_slot_assignments
│
├── Analytics Layer
│   ├── audit_log (Auto-populated by triggers)
│   ├── student_status_history (Auto-populated by triggers)
│   └── user_sessions (Manual population needed)
│
└── Automation Layer
    ├── Database Triggers
    │   ├── audit_students_changes
    │   ├── audit_coaches_changes
    │   ├── audit_branches_changes
    │   ├── track_student_status_changes
    │   └── on_auth_user_created
    │
    └── Functions
        ├── log_entity_changes()
        ├── track_status_changes()
        ├── is_admin()
        ├── get_user_role()
        └── And 10+ others
```

### Key Design Decisions

1. **Centralized Data Access Layer (supabase-data.js)**
   - All database queries in one file
   - Consistent error handling
   - Easy to audit and maintain
   - Single point of optimization

2. **Row-Level Security (RLS)**
   - Data isolation per user
   - Coach can only see their assigned students
   - Admins see all data
   - Enforced at database level (more secure)

3. **Automatic Tracking via Triggers**
   - Changes logged automatically
   - No manual tracking code in app
   - Reliable audit trail
   - Can't be bypassed

4. **Three-Language Support from Day One**
   - English, Russian, Kazakh
   - Separation of concerns (UI/Translation)
   - Easy to add new languages
   - Handles RTL layouts

5. **Vanilla JavaScript (No Frameworks)**
   - Simpler to understand
   - Fewer dependencies
   - Smaller bundle size
   - But more repetitive code

6. **Modal-Based CRUD Operations**
   - Single page app behavior
   - No page reloads
   - Consistent UX
   - Easier to maintain form state

---

## 4. Analytics Section Deep Dive

### 4.1 Activity Log (Audit Log)

**Purpose:** Track all CRUD operations on students, coaches, and branches. Who changed what, when, and from what to what.

**Implementation Status:** ✅ **Fully Working**

#### How It Works

1. **Automatic Trigger:** When any record is created, updated, or deleted, the `audit_students_changes` trigger fires
2. **Change Detection:** The `log_entity_changes()` function compares old and new values
3. **Field-Level Tracking:** Captures which specific fields changed
4. **User Attribution:** Records the user_id and email of who made the change
5. **Timestamp:** Records the exact time of the change

#### Database Schema: `audit_log` Table

```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50),           -- 'student', 'coach', 'branch'
    entity_id UUID,                    -- ID of changed record
    action VARCHAR(20),                -- 'CREATE', 'UPDATE', 'DELETE'
    changed_by UUID REFERENCES auth.users(id),
    user_email VARCHAR(255),           -- Cached for reporting
    old_values JSONB,                  -- Previous state
    new_values JSONB,                  -- New state
    changed_fields TEXT[],             -- Array of field names changed
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for performance
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_changed_at ON audit_log(changed_at DESC);
CREATE INDEX idx_audit_log_user ON audit_log(changed_by);
```

#### Frontend Implementation

**Location:** `admin.html` lines 971-1061

**HTML Structure:**
- Date range filter dropdown (24h, 7d, 30d, All Time)
- Entity type filter (Students, Coaches, Branches)
- Action filter (Create, Update, Delete)
- User email search box
- Results table with pagination
- CSV export button

**Key Features:**

| Feature | Implementation |
|---------|-----------------|
| Date Range Filtering | JavaScript date calculations (24h = now - 1 day) |
| Entity Type Filtering | Dropdown with hardcoded values |
| Action Filtering | Checkbox group for CREATE/UPDATE/DELETE |
| User Search | Text input with LIKE query |
| Results Display | Table with 50 entries per page |
| CSV Export | `exportAuditLogCSV()` function |
| Color Coding | Entity type color badges |

#### Backend Implementation

**Location:** `supabase-data.js` lines 2536-2723

```javascript
// Main query function
async function getAuditLog(filters) {
    // filters = {
    //   fromDate: Date,
    //   toDate: Date,
    //   entityType: 'student|coach|branch|null',
    //   actions: ['CREATE', 'UPDATE', 'DELETE'],
    //   userEmail: 'email@example.com|null',
    //   limit: 50,
    //   offset: 0
    // }

    // 1. Build WHERE clause based on filters
    // 2. Execute RLS-protected query
    // 3. Return results with pagination metadata
}

// Related functions:
async function getEntityAuditLog(entityType, entityId)  // Get history for one entity
async function exportAuditLogCSV(filters)                // Export to CSV
```

#### Key Triggers

**Trigger: `audit_students_changes`**
```sql
CREATE TRIGGER audit_students_changes
AFTER INSERT OR UPDATE OR DELETE ON students
FOR EACH ROW EXECUTE FUNCTION log_entity_changes('student');
```

**Function: `log_entity_changes(entity_type VARCHAR)`**
- Detects INSERT/UPDATE/DELETE
- For UPDATE: compares old and new values using row constructors
- Records only changed fields
- Inserts into audit_log table
- Includes user_id from auth.uid()

#### Why Data May Appear Empty

| Symptom | Cause | Solution |
|---------|-------|----------|
| No data in table | Default filter: Last 24 hours (very narrow) | Change date filter to "7 days" or "All Time" |
| Too few results | Entity type filter too restrictive | Set entity type to "All" |
| Wrong user results | Search term too specific | Clear email search box |
| Missing old changes | Data deleted before viewing | Verify audit_log table directly |

#### Verification Queries

```sql
-- Check audit log count
SELECT COUNT(*) as total_entries FROM audit_log;

-- Recent activity (all entities)
SELECT
    entity_type,
    action,
    user_email,
    changed_at,
    changed_fields
FROM audit_log
ORDER BY changed_at DESC
LIMIT 20;

-- Activity for specific user
SELECT *
FROM audit_log
WHERE user_email = 'dysonsphere01@proton.me'
ORDER BY changed_at DESC
LIMIT 10;

-- Activities in last 7 days
SELECT
    entity_type,
    COUNT(*) as count,
    MAX(changed_at) as latest
FROM audit_log
WHERE changed_at > NOW() - INTERVAL '7 days'
GROUP BY entity_type;

-- Check if triggers are active
SELECT
    tgname,
    tgenabled,
    tgrelid::regclass as table_name
FROM pg_trigger
WHERE tgname LIKE 'audit_%';
```

---

### 4.2 Status History

**Purpose:** Track student status transitions (active ↔ frozen ↔ left). Why did they change status, and who made the change?

**Implementation Status:** ✅ **Fully Working**

#### How It Works

1. **Status Change Trigger:** When `students.status` is updated, the `track_student_status_changes` trigger fires
2. **State Comparison:** Compares old_status to new_status
3. **Transition Recorded:** Only if status actually changed
4. **User Attribution:** Records who made the change
5. **Timestamp:** Records exact time of change

#### Database Schema: `student_status_history` Table

```sql
CREATE TABLE student_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id),
    student_name VARCHAR(255),         -- Cached for reporting
    branch_id UUID REFERENCES branches(id),
    old_status VARCHAR(50),            -- Previous status
    new_status VARCHAR(50),            -- New status
    changed_by UUID REFERENCES auth.users(id),
    user_email VARCHAR(255),           -- Cached for reporting
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT                         -- Optional notes
);

-- Indexes
CREATE INDEX idx_status_history_student ON student_status_history(student_id);
CREATE INDEX idx_status_history_changed_at ON student_status_history(changed_at DESC);
CREATE INDEX idx_status_history_branch ON student_status_history(branch_id);

-- Materialized View for last 7 days
CREATE MATERIALIZED VIEW recent_status_changes AS
SELECT *
FROM student_status_history
WHERE changed_at > NOW() - INTERVAL '7 days'
ORDER BY changed_at DESC;
```

#### Frontend Implementation

**Location:** `admin.html` lines 1065-1140

**Features:**
- Date range filter (7d, 30d, 90d, All Time)
- Old status filter
- New status filter
- Branch filter
- Student name search
- 100 entry limit
- Color-coded status badges

#### Backend Implementation

**Location:** `supabase-data.js` lines 2774-2887

```javascript
async function getStatusHistory(filters) {
    // filters = {
    //   fromDate: Date,
    //   toDate: Date,
    //   oldStatus: 'active|frozen|left|null',
    //   newStatus: 'active|frozen|left|null',
    //   branchId: 'uuid|null',
    //   studentName: 'text|null',
    //   limit: 100
    // }
}

async function getStudentStatusHistory(studentId) {
    // Get all status changes for one student
}
```

#### Key Trigger

**Trigger: `track_student_status_changes`**
```sql
CREATE TRIGGER track_student_status_changes
AFTER UPDATE ON students
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)  -- Only if status changed
EXECUTE FUNCTION log_status_change();
```

**Function: `log_status_change()`**
- Fires only if status field changed
- Records old and new status
- Captures changed_by from auth.uid()
- Inserts into student_status_history

#### Why Data May Appear Empty

| Symptom | Cause | Solution |
|---------|-------|----------|
| No changes shown | Students don't change status frequently | Check database directly for status_history count |
| Wrong date range | Default filter: 30 days | Change to "All Time" to see older changes |
| Student not found | Search is case-sensitive | Try partial name |
| Status values incorrect | Typo in filter | Use dropdown instead of text input |

#### Verification Queries

```sql
-- Check status history count
SELECT COUNT(*) as total_changes FROM student_status_history;

-- Recent status changes
SELECT
    student_name,
    old_status,
    new_status,
    user_email,
    changed_at
FROM student_status_history
ORDER BY changed_at DESC
LIMIT 20;

-- Status changes for specific student
SELECT *
FROM student_status_history
WHERE student_id = '<student_uuid>'
ORDER BY changed_at DESC;

-- Status change counts by type
SELECT
    CONCAT(old_status, ' → ', new_status) as transition,
    COUNT(*) as count
FROM student_status_history
GROUP BY old_status, new_status
ORDER BY count DESC;

-- Students who changed status in last 30 days
SELECT DISTINCT
    student_name,
    COUNT(*) as changes
FROM student_status_history
WHERE changed_at > NOW() - INTERVAL '30 days'
GROUP BY student_name
ORDER BY changes DESC;
```

---

### 4.3 User Sessions

**Purpose:** Track user login/logout activity, session duration, and device information. When do users access the system, and from what devices?

**Implementation Status:** ⚠️ **Partial - Infrastructure Ready, Integration Missing**

#### Current State

- ✅ Database table created (migration 023)
- ✅ RLS policies configured
- ✅ API functions implemented in supabase-data.js
- ✅ Frontend UI complete in admin.html
- ❌ Login/logout calls NOT integrated in auth flow
- ❌ Session expiry cron job NOT implemented

#### How It Will Work (When Complete)

1. **Login Event:** When user authenticates, `logLogin()` captures session start
2. **Data Captured:** User ID, IP address, User-Agent, login timestamp
3. **Device Detection:** Parse User-Agent for device type (Desktop/Mobile/Tablet)
4. **Session Duration:** Calculated from login to logout time
5. **Session Expiry:** Auto-expiry after inactivity period

#### Database Schema: `user_sessions` Table

```sql
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    user_email VARCHAR(255) NOT NULL,
    login_at TIMESTAMP WITH TIME ZONE NOT NULL,
    logout_at TIMESTAMP WITH TIME ZONE,
    ip_address INET,
    user_agent TEXT,
    device_type VARCHAR(50),           -- 'Desktop', 'Mobile', 'Tablet'
    session_duration_minutes INT,      -- Calculated on logout
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'logged_out', 'expired'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_login_at ON user_sessions(login_at DESC);
CREATE INDEX idx_user_sessions_status ON user_sessions(status);
```

#### Frontend Implementation (Complete)

**Location:** `admin.html` lines 1143-1241

**UI Components:**
- Statistics cards:
  - Total sessions
  - Unique users
  - Average session duration
  - Currently active sessions
- Date range filter (24h, 7d, 30d, All Time)
- Status filter (Active, Logged Out, Expired)
- Device filter (Desktop, Mobile, Tablet)
- User dropdown selector
- Results table (50 entries)

#### Backend Implementation (Complete)

**Location:** `supabase-data.js` lines 2961-3085

```javascript
async function logLogin(token, ipAddress, userAgent) {
    // Captures: user_id, login_at, ip, user_agent
    // Detects: device_type from userAgent parsing
    // Status: 'active'
    // NOT CALLED YET - needs integration in login flow
}

async function logLogout(sessionId) {
    // Updates existing session record
    // Sets: logout_at, status = 'logged_out'
    // Calculates: session_duration_minutes
    // NOT CALLED YET - needs integration in logout flow
}

async function getUserSessions(filters) {
    // filters = {
    //   fromDate: Date,
    //   toDate: Date,
    //   status: 'active|logged_out|expired|null',
    //   deviceType: 'Desktop|Mobile|Tablet|null',
    //   userId: 'uuid|null',
    //   limit: 50,
    //   offset: 0
    // }
}

async function getSessionStats(fromDate, toDate) {
    // Returns: total_sessions, unique_users, avg_duration, active_sessions
}
```

#### Implementation Guide

**Step 1: Find Login Handler**

Search for login submission handler (probably in `supabase-client.js` or `admin.js`):

```javascript
// Somewhere like this:
async function handleLogin(email, password) {
    // 1. Authenticate user
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (data.user) {
        // TODO: Add session logging here
        await logLogin(
            data.session.access_token,
            await getClientIP(),              // Need helper function
            navigator.userAgent
        );
    }

    return { data, error };
}
```

**Step 2: Find Logout Handler**

```javascript
async function handleLogout() {
    // Get current session before logging out
    const session = supabase.auth.getSession();

    // TODO: Log logout
    if (session?.data?.session?.id) {
        await logLogout(session.data.session.id);
    }

    // Then sign out
    await supabase.auth.signOut();
}
```

**Step 3: Get Client IP Address**

```javascript
async function getClientIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        console.error('Failed to get IP:', error);
        return null;
    }
}
```

**Step 4: Create Session Expiry Cron Job**

Use Supabase Edge Functions or external cron service:

```sql
-- Mark sessions as expired if no activity for 24 hours
UPDATE user_sessions
SET status = 'expired'
WHERE status = 'active'
AND login_at < NOW() - INTERVAL '24 hours'
AND logout_at IS NULL;
```

#### Verification Queries

```sql
-- Check session table count
SELECT COUNT(*) as total_sessions FROM user_sessions;

-- Recent login activity
SELECT
    user_email,
    login_at,
    logout_at,
    device_type,
    status
FROM user_sessions
ORDER BY login_at DESC
LIMIT 20;

-- Active sessions right now
SELECT
    user_email,
    login_at,
    device_type,
    NOW() - login_at as session_age
FROM user_sessions
WHERE status = 'active'
ORDER BY login_at DESC;

-- Session statistics
SELECT
    COUNT(*) as total_sessions,
    COUNT(DISTINCT user_id) as unique_users,
    ROUND(AVG(EXTRACT(EPOCH FROM (logout_at - login_at)) / 60)::numeric, 2) as avg_duration_minutes
FROM user_sessions
WHERE logout_at IS NOT NULL;

-- Device type breakdown
SELECT
    device_type,
    COUNT(*) as count,
    ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM user_sessions), 2) as percentage
FROM user_sessions
GROUP BY device_type
ORDER BY count DESC;
```

---

## 5. User Roles & Permissions

### Role Types

| Role | Access Level | Best For | API Access |
|------|-------------|----------|------------|
| **Admin** | Full system access | System administrators | All endpoints |
| **Coach** | Limited to assigned students | Coaches managing their students | Filtered endpoints |
| **Viewer** | Read-only access | Management/reporting | Read-only endpoints |

### Permission Granularity (8 Flags)

The system uses **8 boolean permission flags** for fine-grained control:

| Flag | Purpose | When Checked |
|------|---------|--------------|
| `can_view_all_students` | See all students (not just assigned) | Student list, search |
| `can_edit_students` | Modify student records | Student edit form |
| `can_manage_branches` | CRUD operations on branches | Branch management page |
| `can_manage_coaches` | CRUD operations on coaches | Coach management page |
| `can_manage_app_access` | Grant/revoke analytics dashboard access | Analytics menu visibility |
| `can_manage_ratings` | Modify student rating data | Rating edit operations |
| `can_manage_data` | Import/export data | Data import/export pages |
| `can_manage_attendance` | Add/modify attendance records | Attendance tracking page |

### Database Table: `user_roles`

```sql
CREATE TABLE user_roles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',  -- 'admin', 'coach', 'viewer'
    can_view_all_students BOOLEAN DEFAULT FALSE,
    can_edit_students BOOLEAN DEFAULT FALSE,
    can_manage_branches BOOLEAN DEFAULT FALSE,
    can_manage_coaches BOOLEAN DEFAULT FALSE,
    can_manage_app_access BOOLEAN DEFAULT FALSE,
    can_manage_ratings BOOLEAN DEFAULT FALSE,
    can_manage_data BOOLEAN DEFAULT FALSE,
    can_manage_attendance BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own role
CREATE POLICY "view_own_role"
ON user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Only admins can modify roles
CREATE POLICY "admin_modify_roles"
ON user_roles FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
    )
);
```

### Permission Checking Functions

```sql
-- Check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_roles.user_id = $1
        AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's full role record
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS TABLE (
    role VARCHAR,
    can_view_all_students BOOLEAN,
    can_edit_students BOOLEAN,
    can_manage_branches BOOLEAN,
    can_manage_coaches BOOLEAN,
    can_manage_app_access BOOLEAN,
    can_manage_ratings BOOLEAN,
    can_manage_data BOOLEAN,
    can_manage_attendance BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        user_roles.role,
        user_roles.can_view_all_students,
        user_roles.can_edit_students,
        user_roles.can_manage_branches,
        user_roles.can_manage_coaches,
        user_roles.can_manage_app_access,
        user_roles.can_manage_ratings,
        user_roles.can_manage_data,
        user_roles.can_manage_attendance
    FROM user_roles
    WHERE user_roles.user_id = $1;
END;
$$ LANGUAGE plpgsql;
```

### Granting Admin Access

**Step 1: Verify user exists**

```sql
SELECT id, email FROM auth.users WHERE email = 'newadmin@example.com';
```

**Step 2: Grant full admin access**

```sql
INSERT INTO user_roles (
    user_id, role,
    can_view_all_students, can_edit_students,
    can_manage_branches, can_manage_coaches,
    can_manage_app_access, can_manage_ratings,
    can_manage_data, can_manage_attendance
)
SELECT
    u.id, 'admin',
    true, true, true, true, true, true, true, true
FROM auth.users u
WHERE u.email = 'newadmin@example.com'
ON CONFLICT (user_id)
DO UPDATE SET
    role = 'admin',
    can_view_all_students = true,
    can_edit_students = true,
    can_manage_branches = true,
    can_manage_coaches = true,
    can_manage_app_access = true,
    can_manage_ratings = true,
    can_manage_data = true,
    can_manage_attendance = true,
    updated_at = NOW();
```

**Step 3: Verify permissions**

```sql
SELECT
    u.email,
    ur.role,
    ur.can_view_all_students,
    ur.can_edit_students,
    ur.can_manage_app_access,
    ur.created_at,
    ur.updated_at
FROM user_roles ur
JOIN auth.users u ON ur.user_id = u.id
WHERE u.email = 'newadmin@example.com';
```

**Step 4: Test frontend access**

1. Log in as the new admin
2. Verify Analytics menu appears (requires `can_manage_app_access` = true)
3. Verify all admin features are accessible

### Real Example: Granting dysonsphere01@proton.me Admin Access

**File:** `GRANT_ADMIN_ACCESS_DYSONSPHERE01.sql` (in repository)

```sql
-- ============================================
-- Grant Admin Access to dysonsphere01@proton.me
-- Created: 2026-02-11
-- Purpose: Grant full admin permissions and database role
-- ============================================

INSERT INTO user_roles (
    user_id,
    role,
    can_view_all_students,
    can_edit_students,
    can_manage_branches,
    can_manage_coaches,
    can_manage_app_access,
    can_manage_ratings,
    can_manage_data,
    can_manage_attendance
)
SELECT
    u.id,
    'admin',
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true
FROM auth.users u
WHERE u.email = 'dysonsphere01@proton.me'
ON CONFLICT (user_id)
DO UPDATE SET
    role = 'admin',
    can_view_all_students = true,
    can_edit_students = true,
    can_manage_branches = true,
    can_manage_coaches = true,
    can_manage_app_access = true,
    can_manage_ratings = true,
    can_manage_data = true,
    can_manage_attendance = true,
    updated_at = NOW();
```

### Predefined Role Templates

**Admin Template (Full Access):**
```sql
-- All permissions = true
INSERT INTO user_roles (...) VALUES (..., true, true, true, true, true, true, true, true)
```

**Coach Template (Limited Access):**
```sql
-- Can manage attendance and see students, but not admin features
INSERT INTO user_roles (...) VALUES (
    user_id, 'coach',
    true,   -- can_view_all_students (their assigned students)
    true,   -- can_edit_students
    false,  -- can_manage_branches
    false,  -- can_manage_coaches
    false,  -- can_manage_app_access
    true,   -- can_manage_ratings
    false,  -- can_manage_data
    true    -- can_manage_attendance
)
```

**Viewer Template (Read-Only):**
```sql
-- All permissions = false
INSERT INTO user_roles (...) VALUES (..., false, false, false, false, false, false, false, false)
```

---

## 6. Database Schema

### Core Tables (18 Total)

#### 1. **auth.users** (Supabase Managed)
- Handles user authentication
- Stores email, password hash, auth tokens
- Managed by Supabase Auth service
- Cannot directly edit - use Supabase dashboard

#### 2. **user_roles** (Permissions & Roles)
See Section 5 for detailed information

#### 3. **students**
```sql
CREATE TABLE students (
    id UUID PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone_number VARCHAR(20),
    date_of_birth DATE,
    level VARCHAR(100),               -- Beginner, Intermediate, Advanced
    rating INT,                       -- Chess rating (e.g., 1200)
    status VARCHAR(50) DEFAULT 'active',  -- active, frozen, left
    branch_id UUID REFERENCES branches(id),
    coach_id UUID REFERENCES coaches(id),
    notes TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
-- Triggers: audit_students_changes, track_student_status_changes
```

#### 4. **coaches**
```sql
CREATE TABLE coaches (
    id UUID PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone_number VARCHAR(20),
    expertise VARCHAR(255),           -- e.g., "Openings, Tactics"
    bio TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
-- Triggers: audit_coaches_changes
```

#### 5. **branches**
```sql
CREATE TABLE branches (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,       -- e.g., "НИШ", "Debut", "Main"
    location VARCHAR(255),
    city VARCHAR(100),
    country VARCHAR(100),
    phone_number VARCHAR(20),
    email VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
-- Triggers: audit_branches_changes
-- 8 fixed branches in current system
```

#### 6. **coach_branches** (Many-to-Many Junction)
```sql
CREATE TABLE coach_branches (
    coach_id UUID REFERENCES coaches(id),
    branch_id UUID REFERENCES branches(id),
    PRIMARY KEY (coach_id, branch_id)
);
-- Maps which coaches work at which branches
```

#### 7. **student_time_slot_assignments**
```sql
CREATE TABLE student_time_slot_assignments (
    id UUID PRIMARY KEY,
    student_id UUID REFERENCES students(id),
    branch_id UUID REFERENCES branches(id),
    schedule_type VARCHAR(50),         -- mon_wed, tue_thu, sat_sun, mon_wed_fri, wed_fri
    time_slot VARCHAR(50),             -- e.g., "09:00-10:00"
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
-- Supports schedule variations per branch
```

#### 8. **attendance**
```sql
CREATE TABLE attendance (
    id UUID PRIMARY KEY,
    student_id UUID REFERENCES students(id),
    branch_id UUID REFERENCES branches(id),
    date_attended DATE,
    schedule_type VARCHAR(50),         -- mon_wed, tue_thu, sat_sun, mon_wed_fri, wed_fri
    status VARCHAR(50),                -- present, absent, excused
    notes TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
-- Records attendance for each student
```

#### 9. **audit_log** (Change Tracking)
See Section 4.1 for detailed information

#### 10. **student_status_history** (Status Change Tracking)
See Section 4.2 for detailed information

#### 11. **user_sessions** (Login/Logout Tracking)
See Section 4.3 for detailed information

#### 12-18. **Supporting Tables**
- `student_ratings` - Rating history
- `class_schedules` - Master schedule templates
- `system_config` - Configuration settings
- `data_exports` - Export history
- And 4 more...

### Entity Relationships

```
auth.users (1)
    ↓
    ├─→ (1) user_roles
    ├─→ (many) audit_log (changed_by)
    ├─→ (many) student_status_history (changed_by)
    └─→ (many) user_sessions

students (1)
    ├─→ (many) audit_log (entity_id)
    ├─→ (many) student_status_history
    ├─→ (many) student_time_slot_assignments
    ├─→ (many) attendance
    ├─→ (1) coaches (coach_id)
    └─→ (1) branches (branch_id)

coaches (1)
    ├─→ (many) audit_log (entity_id)
    ├─→ (many) students
    └─→ (many) coach_branches → branches

branches (1)
    ├─→ (many) audit_log (entity_id)
    ├─→ (many) students
    ├─→ (many) coaches (via coach_branches)
    ├─→ (many) student_time_slot_assignments
    └─→ (many) attendance
```

### Indexes (For Performance)

```sql
-- Primary performance indexes
CREATE INDEX idx_students_branch ON students(branch_id);
CREATE INDEX idx_students_coach ON students(coach_id);
CREATE INDEX idx_students_status ON students(status);
CREATE INDEX idx_attendance_student ON attendance(student_id);
CREATE INDEX idx_attendance_date ON attendance(date_attended DESC);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_changed_at ON audit_log(changed_at DESC);
CREATE INDEX idx_status_history_student ON student_status_history(student_id);
CREATE INDEX idx_sessions_user_id ON user_sessions(user_id);

-- Full-text search index (if needed)
CREATE INDEX idx_students_search ON students
USING GIN (to_tsvector('english', first_name || ' ' || last_name));
```

### Major Triggers

| Trigger | Table | Event | Function | Purpose |
|---------|-------|-------|----------|---------|
| `audit_students_changes` | students | INSERT/UPDATE/DELETE | `log_entity_changes('student')` | Log all student changes |
| `audit_coaches_changes` | coaches | INSERT/UPDATE/DELETE | `log_entity_changes('coach')` | Log all coach changes |
| `audit_branches_changes` | branches | INSERT/UPDATE/DELETE | `log_entity_changes('branch')` | Log all branch changes |
| `track_student_status_changes` | students | UPDATE (status only) | `log_status_change()` | Track status transitions |
| `on_auth_user_created` | auth.users | INSERT | `create_user_role()` | Initialize user_roles |

---

## 7. Frontend Architecture

### File Organization

```
chess-empire-database/
│
├── Entry Points
│   ├── index.html              # Public homepage, student search (170 lines)
│   ├── login.html              # Authentication interface (120 lines)
│   └── register.html           # User registration (100 lines)
│
├── Main Application
│   ├── admin.html              # Admin dashboard - MAIN INTERFACE (1,241 lines)
│   │   └── Contains all UI for:
│   │       ├── Student management
│   │       ├── Coach management
│   │       ├── Branch management
│   │       ├── Attendance tracking
│   │       ├── Analytics (Activity Log, Status History, Sessions)
│   │       └── Admin settings
│   │
│   ├── student.html            # Student profile page (200 lines)
│   ├── coach.html              # Coach profile page (200 lines)
│   └── branch.html             # Branch details page (180 lines)
│
├── Business Logic (JavaScript)
│   ├── supabase-client.js      # Supabase SDK initialization (50 lines)
│   ├── supabase-data.js        # DATA ACCESS LAYER (3,056 lines)
│   │   └── All database queries centralized here:
│   │       ├── Student CRUD
│   │       ├── Coach CRUD
│   │       ├── Attendance operations
│   │       ├── Analytics queries
│   │       ├── User permission checks
│   │       └── Export functions
│   │
│   ├── admin.js                # Admin dashboard logic (1,379 lines)
│   │   └── Event handlers for:
│   │       ├── Menu visibility control
│   │       ├── Form submissions
│   │       ├── Modal management
│   │       ├── Analytics page handlers
│   │       ├── Data filtering
│   │       └── Export triggering
│   │
│   └── crud.js                 # CRUD helper functions (500 lines)
│       └── Common operations:
│           ├── Create operations
│           ├── Update operations
│           ├── Delete operations
│           └── Validation
│
├── Internationalization
│   └── i18n.js                 # Translation system (185,245 lines)
│       ├── English translations (60,000 lines)
│       ├── Russian translations (62,000 lines)
│       └── Kazakh translations (63,000 lines)
│       └── Usage: i18n.t('admin.students.title')
│
├── Styling
│   └── styles/
│       ├── style.css           # Main stylesheet
│       ├── admin.css           # Admin-specific styles
│       ├── responsive.css      # Mobile responsiveness
│       └── theme.css           # Color themes
│
└── Database & Configuration
    ├── migrations/             # Database migrations (001-046)
    ├── supabase-schema.sql     # Full database schema
    └── DEPLOYMENT_GUIDE.md     # Deployment instructions
```

### Key JavaScript Modules

#### **supabase-data.js** (3,056 lines) - Data Access Layer

**Purpose:** Centralize ALL database queries in one file for consistency and maintainability

**Organization:**

```javascript
// 1. Supabase client initialization (20 lines)
const supabase = createClient(URL, KEY);

// 2. Authentication helpers (150 lines)
async function signInWithPassword(email, password)
async function signOut()
async function signUp(email, password)
async function resetPassword(email)
async function getCurrentUser()

// 3. Student operations (400 lines)
async function getStudents(filters)
async function getStudent(id)
async function createStudent(data)
async function updateStudent(id, data)
async function deleteStudent(id)
async function searchStudents(query)
async function bulkCreateStudents(data)

// 4. Coach operations (300 lines)
async function getCoaches()
async function getCoach(id)
async function createCoach(data)
async function updateCoach(id, data)
async function deleteCoach(id)
async function getCoachStudents(coachId)

// 5. Branch operations (200 lines)
async function getBranches()
async function getBranch(id)
async function createBranch(data)
async function updateBranch(id, data)
async function deleteBranch(id)

// 6. Attendance operations (250 lines)
async function getAttendance(filters)
async function upsertAttendance(record)
async function bulkUpsertAttendance(records)
async function getAttendanceStats(studentId)

// 7. Analytics - Activity Log (200 lines)
async function getAuditLog(filters)
async function getEntityAuditLog(type, id)
async function exportAuditLogCSV(filters)

// 8. Analytics - Status History (120 lines)
async function getStatusHistory(filters)
async function getStudentStatusHistory(studentId)

// 9. Analytics - User Sessions (150 lines)
async function getUserSessions(filters)
async function getSessionStats(fromDate, toDate)
async function logLogin(token, ip, ua)         // ❌ Not integrated
async function logLogout(sessionId)            // ❌ Not integrated

// 10. User permissions (100 lines)
async function getUserRole(userId)
async function isAdmin(userId)
async function checkPermission(userId, permission)

// 11. Import/Export (150 lines)
async function exportStudentsCSV()
async function importStudentsCSV(file)
async function exportCoachesCSV()
async function importCoachesCSV(file)

// 12. Utility functions (200 lines)
async function handleError(error)
function formatDate(date)
function parseCSV(text)
function generateUUID()
```

**Key Pattern: RLS-Protected Queries**

```javascript
// All queries respect Row Level Security (RLS) policies
// When you query from frontend, Supabase automatically filters
// based on authenticated user's permissions

async function getStudents(filters) {
    let query = supabase
        .from('students')
        .select('*,coaches(*),branches(*)');

    // RLS automatically applies - users only see allowed data

    if (filters.branchId) {
        query = query.eq('branch_id', filters.branchId);
    }

    if (filters.status) {
        query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    return { data, error };
}
```

#### **admin.js** (1,379 lines) - Admin Dashboard Logic

**Purpose:** Handle all UI interactions and event delegation for the admin dashboard

**Organization:**

```javascript
// 1. Module initialization (50 lines)
// - Load Supabase client
// - Set up event listeners
// - Initialize UI state

// 2. Menu visibility control (50 lines) [Lines 104-118]
const analyticsAllowedEmails = [
    '0xmarblemaster@gmail.com',
    'dysonsphere01@proton.me'
];

if (analyticsAllowedEmails.includes(userEmail)) {
    document.getElementById('menuActivityLog').style.display = 'flex';
    document.getElementById('menuStatusHistory').style.display = 'flex';
    document.getElementById('menuSessions').style.display = 'flex';
}

// 3. Main tabs (40 lines)
// - Students tab
// - Coaches tab
// - Branches tab
// - Attendance tab
// - Analytics tab
// - Settings tab

// 4. Students section (200 lines)
async function loadStudents()
async function openCreateStudentModal()
async function saveStudent()
async function deleteStudent(id)
async function filterStudents()
async function openStudentDetail(id)

// 5. Coaches section (200 lines)
async function loadCoaches()
async function openCreateCoachModal()
async function saveCoach()
async function deleteCoach(id)
async function assignCoachToBranches()

// 6. Attendance section (250 lines)
async function loadAttendanceData()
async function openAttendanceForm()
async function saveAttendance()
async function handleScheduleChange(schedule)
async function markPresent(studentId)
async function markAbsent(studentId)

// 7. Analytics handlers (500 lines) [Lines 8305-8838]
// Activity Log
async function loadActivityLog()
async function filterActivityLog()
async function exportActivityLogCSV()

// Status History
async function loadStatusHistory()
async function filterStatusHistory()
async function viewStudentHistory(studentId)

// User Sessions
async function loadUserSessions()
async function filterUserSessions()
async function calculateSessionStats()

// 8. Utility functions (300 lines)
function showModal(modalId)
function closeModal(modalId)
function showToast(message, type)  // type: 'success', 'error', 'info'
function formatDate(date)
function parseFilters(formElement)
function resetForm(formId)
```

#### **i18n.js** (185,245 lines) - Internationalization

**Purpose:** Provide translations for all UI text in 3 languages

**Structure:**

```javascript
const translations = {
    en: {
        // English translations
        'admin.students.title': 'Students',
        'admin.students.firstName': 'First Name',
        'admin.students.lastName': 'Last Name',
        'admin.attendance.monWed': 'Mon-Wed',
        'admin.attendance.wedFri': 'Wed-Fri',      // Added for НИШ branch
        // ... 60,000 more keys
    },
    ru: {
        // Russian translations
        'admin.students.title': 'Студенты',
        'admin.students.firstName': 'Имя',
        'admin.students.lastName': 'Фамилия',
        'admin.attendance.monWed': 'Пн-Ср',
        'admin.attendance.wedFri': 'Ср-Пт',       // Added for НИШ branch
        // ... 62,000 more keys
    },
    kk: {
        // Kazakh translations
        'admin.students.title': 'Студенттер',
        'admin.students.firstName': 'Аты',
        'admin.students.lastName': 'Тегі',
        'admin.attendance.monWed': 'Дс-Сс',
        'admin.attendance.wedFri': 'Ср-Жм',       // Added for НИШ branch
        // ... 63,000 more keys
    }
};

// Usage in code:
const studentTitle = i18n.t('admin.students.title');  // Translates to current language
```

**Integration in HTML:**

```html
<!-- Before translation -->
<button id="createStudentBtn">Create Student</button>

<!-- After translation (in JavaScript) -->
document.getElementById('createStudentBtn').textContent = i18n.t('admin.buttons.createStudent');
```

### UI Component Patterns

#### **Pattern 1: Modal-Based CRUD**

```html
<!-- Modal structure -->
<div id="studentModal" class="modal">
    <div class="modal-content">
        <h2 id="studentModalTitle">New Student</h2>
        <form id="studentForm">
            <input type="text" id="firstName" placeholder="First Name" required>
            <input type="text" id="lastName" placeholder="Last Name" required>
            <input type="email" id="email" placeholder="Email">
            <select id="branchSelect">
                <option value="">Select Branch...</option>
            </select>
            <button type="submit">Save Student</button>
            <button type="button" onclick="closeModal('studentModal')">Cancel</button>
        </form>
    </div>
</div>
```

```javascript
// JavaScript handler
document.getElementById('studentForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
        first_name: document.getElementById('firstName').value,
        last_name: document.getElementById('lastName').value,
        email: document.getElementById('email').value,
        branch_id: document.getElementById('branchSelect').value
    };

    if (data.id) {
        // Update
        const { error } = await updateStudent(data.id, data);
        if (error) showToast('Error updating student', 'error');
        else showToast('Student updated', 'success');
    } else {
        // Create
        const { error } = await createStudent(data);
        if (error) showToast('Error creating student', 'error');
        else showToast('Student created', 'success');
    }

    closeModal('studentModal');
    loadStudents();  // Refresh list
});
```

#### **Pattern 2: Pagination**

```javascript
const ITEMS_PER_PAGE = 50;
let currentPage = 1;

async function loadActivityLog() {
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;
    const filters = {
        fromDate: new Date(...),
        toDate: new Date(...),
        limit: ITEMS_PER_PAGE,
        offset: offset
    };

    const { data, totalCount } = await getAuditLog(filters);
    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    renderActivityLog(data);
    renderPaginationControls(currentPage, totalPages);
}

function goToPage(page) {
    currentPage = page;
    loadActivityLog();
}
```

#### **Pattern 3: Loading States**

```javascript
async function loadStudents() {
    const container = document.getElementById('studentsTable');

    // Show loading state
    container.innerHTML = '<div class="loading">Loading students...</div>';

    try {
        const { data, error } = await getStudents(filters);

        if (error) throw error;

        if (data.length === 0) {
            container.innerHTML = '<div class="empty-state">No students found</div>';
            return;
        }

        // Render students
        container.innerHTML = data.map(student => `
            <tr>
                <td>${student.first_name}</td>
                <td>${student.last_name}</td>
                <td>${student.branches.name}</td>
                <td>
                    <button onclick="editStudent('${student.id}')">Edit</button>
                    <button onclick="deleteStudent('${student.id}')">Delete</button>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        container.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    }
}
```

#### **Pattern 4: Toast Notifications**

```javascript
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Usage:
showToast('Student saved successfully', 'success');
showToast('Error saving student', 'error');
showToast('Loading data...', 'info');
```

---

## 8. Backend API Reference

### Authentication APIs

All authentication handled by Supabase Auth (JWT tokens).

```javascript
// Sign in with email/password
async function signInWithPassword(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });
    return { data, error };
}

// Sign up new user
async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password
    });
    return { data, error };
}

// Sign out current user
async function signOut() {
    const { error } = await supabase.auth.signOut();
    return { error };
}

// Reset password
async function resetPassword(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);
    return { data, error };
}

// Get current session
async function getCurrentSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}
```

### Student APIs

```javascript
// Get students with filtering
async function getStudents(filters = {}) {
    // filters = {
    //   branchId: 'uuid|null',
    //   coachId: 'uuid|null',
    //   status: 'active|frozen|left|null',
    //   searchQuery: 'text|null',
    //   limit: 50,
    //   offset: 0
    // }

    let query = supabase
        .from('students')
        .select('*,coaches(*),branches(*)', { count: 'exact' });

    if (filters.branchId) query = query.eq('branch_id', filters.branchId);
    if (filters.coachId) query = query.eq('coach_id', filters.coachId);
    if (filters.status) query = query.eq('status', filters.status);

    if (filters.searchQuery) {
        query = query.or(`first_name.ilike.%${filters.searchQuery}%,last_name.ilike.%${filters.searchQuery}%`);
    }

    query = query.range(filters.offset || 0, (filters.offset || 0) + (filters.limit || 50) - 1);

    const { data, error, count } = await query;
    return { data, error, count };
}

// Get single student
async function getStudent(studentId) {
    const { data, error } = await supabase
        .from('students')
        .select('*,coaches(*),branches(*)')
        .eq('id', studentId)
        .single();
    return { data, error };
}

// Create student
async function createStudent(data) {
    // data = {
    //   first_name: string,
    //   last_name: string,
    //   email: string|null,
    //   phone_number: string|null,
    //   date_of_birth: date|null,
    //   level: string|null,
    //   rating: number|null,
    //   status: 'active',
    //   branch_id: uuid,
    //   coach_id: uuid|null,
    //   notes: string|null
    // }

    const { data: result, error } = await supabase
        .from('students')
        .insert([data])
        .select();
    return { data: result?.[0], error };
}

// Update student
async function updateStudent(studentId, data) {
    const { data: result, error } = await supabase
        .from('students')
        .update(data)
        .eq('id', studentId)
        .select()
        .single();
    return { data: result, error };
}

// Delete student
async function deleteStudent(studentId) {
    const { error } = await supabase
        .from('students')
        .delete()
        .eq('id', studentId);
    return { error };
}

// Search students
async function searchStudents(query) {
    // Full-text search across name and email
    const { data, error } = await supabase
        .from('students')
        .select('*')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(20);
    return { data, error };
}

// Bulk create students (for import)
async function bulkCreateStudents(students) {
    const { data, error } = await supabase
        .from('students')
        .insert(students)
        .select();
    return { data, error };
}
```

### Coach APIs

```javascript
async function getCoaches() {
    const { data, error } = await supabase
        .from('coaches')
        .select('*,coach_branches(branch_id)');
    return { data, error };
}

async function getCoach(coachId) {
    const { data, error } = await supabase
        .from('coaches')
        .select('*,coach_branches(branch_id)')
        .eq('id', coachId)
        .single();
    return { data, error };
}

async function createCoach(data) {
    const { data: result, error } = await supabase
        .from('coaches')
        .insert([data])
        .select();
    return { data: result?.[0], error };
}

async function updateCoach(coachId, data) {
    const { data: result, error } = await supabase
        .from('coaches')
        .update(data)
        .eq('id', coachId)
        .select()
        .single();
    return { data: result, error };
}

async function deleteCoach(coachId) {
    const { error } = await supabase
        .from('coaches')
        .delete()
        .eq('id', coachId);
    return { error };
}

async function getCoachStudents(coachId) {
    const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('coach_id', coachId);
    return { data, error };
}
```

### Branch APIs

```javascript
async function getBranches() {
    const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('name');
    return { data, error };
}

async function getBranch(branchId) {
    const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('id', branchId)
        .single();
    return { data, error };
}

async function createBranch(data) {
    const { data: result, error } = await supabase
        .from('branches')
        .insert([data])
        .select();
    return { data: result?.[0], error };
}

async function updateBranch(branchId, data) {
    const { data: result, error } = await supabase
        .from('branches')
        .update(data)
        .eq('id', branchId)
        .select()
        .single();
    return { data: result, error };
}

async function deleteBranch(branchId) {
    const { error } = await supabase
        .from('branches')
        .delete()
        .eq('id', branchId);
    return { error };
}
```

### Analytics APIs

#### Activity Log (Audit Log)

```javascript
async function getAuditLog(filters = {}) {
    // filters = {
    //   fromDate: Date,
    //   toDate: Date,
    //   entityType: 'student|coach|branch|null',
    //   actions: ['CREATE', 'UPDATE', 'DELETE'],
    //   userEmail: 'email@example.com|null',
    //   limit: 50,
    //   offset: 0
    // }

    let query = supabase
        .from('audit_log')
        .select('*,changed_by!inner(email)', { count: 'exact' })
        .order('changed_at', { ascending: false });

    if (filters.fromDate) {
        query = query.gte('changed_at', filters.fromDate.toISOString());
    }
    if (filters.toDate) {
        query = query.lte('changed_at', filters.toDate.toISOString());
    }
    if (filters.entityType) {
        query = query.eq('entity_type', filters.entityType);
    }
    if (filters.actions && filters.actions.length > 0) {
        query = query.in('action', filters.actions);
    }
    if (filters.userEmail) {
        query = query.eq('user_email', filters.userEmail);
    }

    query = query.range(filters.offset || 0, (filters.offset || 0) + (filters.limit || 50) - 1);

    const { data, error, count } = await query;
    return { data, error, count };
}

async function getEntityAuditLog(entityType, entityId) {
    const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('changed_at', { ascending: false });
    return { data, error };
}

async function exportAuditLogCSV(filters) {
    // Retrieve all matching records (no limit)
    const { data, error } = await getAuditLog({ ...filters, limit: 10000, offset: 0 });

    if (error) return { error };

    // Convert to CSV format
    const headers = ['Entity Type', 'Action', 'Changed By', 'Changed At', 'Changed Fields'];
    const rows = data.map(row => [
        row.entity_type,
        row.action,
        row.user_email,
        new Date(row.changed_at).toLocaleString(),
        row.changed_fields.join(', ')
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');

    // Trigger download
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
    element.setAttribute('download', `audit_log_${new Date().toISOString()}.csv`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    return { data };
}
```

#### Status History

```javascript
async function getStatusHistory(filters = {}) {
    // filters = {
    //   fromDate: Date,
    //   toDate: Date,
    //   oldStatus: 'active|frozen|left|null',
    //   newStatus: 'active|frozen|left|null',
    //   branchId: 'uuid|null',
    //   studentName: 'text|null',
    //   limit: 100,
    //   offset: 0
    // }

    let query = supabase
        .from('student_status_history')
        .select('*', { count: 'exact' })
        .order('changed_at', { ascending: false });

    if (filters.fromDate) {
        query = query.gte('changed_at', filters.fromDate.toISOString());
    }
    if (filters.toDate) {
        query = query.lte('changed_at', filters.toDate.toISOString());
    }
    if (filters.oldStatus) {
        query = query.eq('old_status', filters.oldStatus);
    }
    if (filters.newStatus) {
        query = query.eq('new_status', filters.newStatus);
    }
    if (filters.branchId) {
        query = query.eq('branch_id', filters.branchId);
    }
    if (filters.studentName) {
        query = query.ilike('student_name', `%${filters.studentName}%`);
    }

    query = query.range(filters.offset || 0, (filters.offset || 0) + (filters.limit || 100) - 1);

    const { data, error, count } = await query;
    return { data, error, count };
}

async function getStudentStatusHistory(studentId) {
    const { data, error } = await supabase
        .from('student_status_history')
        .select('*')
        .eq('student_id', studentId)
        .order('changed_at', { ascending: false });
    return { data, error };
}
```

#### User Sessions

```javascript
async function getUserSessions(filters = {}) {
    // filters = {
    //   fromDate: Date,
    //   toDate: Date,
    //   status: 'active|logged_out|expired|null',
    //   deviceType: 'Desktop|Mobile|Tablet|null',
    //   userId: 'uuid|null',
    //   limit: 50,
    //   offset: 0
    // }

    let query = supabase
        .from('user_sessions')
        .select('*', { count: 'exact' })
        .order('login_at', { ascending: false });

    if (filters.fromDate) {
        query = query.gte('login_at', filters.fromDate.toISOString());
    }
    if (filters.toDate) {
        query = query.lte('login_at', filters.toDate.toISOString());
    }
    if (filters.status) {
        query = query.eq('status', filters.status);
    }
    if (filters.deviceType) {
        query = query.eq('device_type', filters.deviceType);
    }
    if (filters.userId) {
        query = query.eq('user_id', filters.userId);
    }

    query = query.range(filters.offset || 0, (filters.offset || 0) + (filters.limit || 50) - 1);

    const { data, error, count } = await query;
    return { data, error, count };
}

async function getSessionStats(fromDate, toDate) {
    const { data, error } = await supabase
        .rpc('get_session_statistics', {
            from_date: fromDate.toISOString(),
            to_date: toDate.toISOString()
        });

    // Returns: {
    //   total_sessions: number,
    //   unique_users: number,
    //   avg_duration_minutes: number,
    //   active_sessions: number
    // }

    return { data, error };
}

async function logLogin(sessionToken, ipAddress, userAgent) {
    // Called when user logs in
    // ❌ Currently NOT integrated - needs to be called in login handler

    const deviceType = detectDeviceType(userAgent);
    const { user } = await supabase.auth.getUser();

    const { data, error } = await supabase
        .from('user_sessions')
        .insert([{
            user_id: user.id,
            user_email: user.email,
            login_at: new Date().toISOString(),
            ip_address: ipAddress,
            user_agent: userAgent,
            device_type: deviceType,
            status: 'active'
        }])
        .select()
        .single();

    return { data, error };
}

async function logLogout(sessionId) {
    // Called when user logs out
    // ❌ Currently NOT integrated - needs to be called in logout handler

    const { data, error } = await supabase
        .from('user_sessions')
        .update({
            logout_at: new Date().toISOString(),
            status: 'logged_out',
            session_duration_minutes: Math.floor(
                (new Date() - new Date(data.login_at)) / (1000 * 60)
            )
        })
        .eq('id', sessionId)
        .select()
        .single();

    return { data, error };
}

function detectDeviceType(userAgent) {
    if (/mobile/i.test(userAgent)) return 'Mobile';
    if (/tablet|ipad|ipod/i.test(userAgent)) return 'Tablet';
    return 'Desktop';
}
```

### Rating APIs

```javascript
async function getStudentRatings(studentId) {
    const { data, error } = await supabase
        .from('student_ratings')
        .select('*')
        .eq('student_id', studentId)
        .order('rated_at', { ascending: false });
    return { data, error };
}

async function updateStudentRating(studentId, newRating) {
    const { data, error } = await supabase
        .from('students')
        .update({ rating: newRating })
        .eq('id', studentId)
        .select()
        .single();

    // This also triggers an audit_log entry via the audit trigger

    return { data, error };
}
```

### Attendance APIs

```javascript
async function getAttendance(filters = {}) {
    let query = supabase
        .from('attendance')
        .select('*,students(*),branches(*)')
        .order('date_attended', { ascending: false });

    if (filters.studentId) {
        query = query.eq('student_id', filters.studentId);
    }
    if (filters.branchId) {
        query = query.eq('branch_id', filters.branchId);
    }
    if (filters.fromDate) {
        query = query.gte('date_attended', filters.fromDate);
    }
    if (filters.toDate) {
        query = query.lte('date_attended', filters.toDate);
    }
    if (filters.status) {
        query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    return { data, error };
}

async function upsertAttendance(record) {
    // Creates or updates attendance record
    const { data, error } = await supabase
        .from('attendance')
        .upsert([record], { onConflict: 'student_id,date_attended' })
        .select()
        .single();
    return { data, error };
}

async function bulkUpsertAttendance(records) {
    // Batch insert/update
    const { data, error } = await supabase
        .from('attendance')
        .upsert(records, { onConflict: 'student_id,date_attended' })
        .select();
    return { data, error };
}

async function getAttendanceStats(studentId, fromDate, toDate) {
    const { data, error } = await supabase
        .from('attendance')
        .select('status,COUNT(*)::int as count', { count: 'exact' })
        .eq('student_id', studentId)
        .gte('date_attended', fromDate)
        .lte('date_attended', toDate)
        .group_by('status');

    // Returns: [
    //   { status: 'present', count: 15 },
    //   { status: 'absent', count: 2 },
    //   { status: 'excused', count: 1 }
    // ]

    return { data, error };
}
```

---

## 9. Common Implementation Patterns

### Pattern 1: Adding New Analytics Feature

When you need to add a new analytic to track (like "Equipment Usage Tracking"):

**Step 1:** Create database table with RLS policies

```sql
-- Create table
CREATE TABLE equipment_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id),
    equipment_name VARCHAR(255),
    used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    duration_minutes INT,
    condition VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE equipment_usage ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can only see equipment usage for their students
CREATE POLICY "view_own_equipment_usage"
ON equipment_usage FOR SELECT
USING (
    student_id IN (
        SELECT id FROM students WHERE coach_id = auth.uid()
        OR branch_id IN (
            SELECT branch_id FROM coach_branches WHERE coach_id = auth.uid()
        )
    ) OR
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);
```

**Step 2:** Add triggers if auto-population needed

```sql
-- Create trigger function
CREATE OR REPLACE FUNCTION log_equipment_usage()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-populate derived columns if needed
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger
CREATE TRIGGER equipment_usage_changes
AFTER INSERT OR UPDATE ON equipment_usage
FOR EACH ROW EXECUTE FUNCTION log_equipment_usage();
```

**Step 3:** Create API functions in supabase-data.js

```javascript
async function getEquipmentUsage(filters = {}) {
    let query = supabase
        .from('equipment_usage')
        .select('*,students(*)')
        .order('used_at', { ascending: false });

    if (filters.studentId) query = query.eq('student_id', filters.studentId);
    if (filters.fromDate) query = query.gte('used_at', filters.fromDate);
    if (filters.toDate) query = query.lte('used_at', filters.toDate);

    const { data, error } = await query;
    return { data, error };
}

async function logEquipmentUsage(studentId, equipmentName, durationMinutes, condition) {
    const { data, error } = await supabase
        .from('equipment_usage')
        .insert([{
            student_id: studentId,
            equipment_name: equipmentName,
            duration_minutes: durationMinutes,
            condition: condition
        }])
        .select()
        .single();
    return { data, error };
}
```

**Step 4:** Add HTML section in admin.html

```html
<div id="equipmentUsageSection" style="display:none;">
    <h3>Equipment Usage</h3>
    <input type="date" id="equipmentFromDate">
    <input type="date" id="equipmentToDate">
    <button onclick="loadEquipmentUsage()">Load</button>
    <table id="equipmentTable">
        <!-- Table will be populated by JavaScript -->
    </table>
</div>
```

**Step 5:** Add JavaScript handlers in admin.js

```javascript
async function loadEquipmentUsage() {
    const fromDate = new Date(document.getElementById('equipmentFromDate').value);
    const toDate = new Date(document.getElementById('equipmentToDate').value);

    const { data, error } = await getEquipmentUsage({
        fromDate: fromDate,
        toDate: toDate
    });

    if (error) {
        showToast('Error loading equipment usage: ' + error.message, 'error');
        return;
    }

    const table = document.getElementById('equipmentTable');
    table.innerHTML = data.map(record => `
        <tr>
            <td>${record.students.first_name}</td>
            <td>${record.equipment_name}</td>
            <td>${record.duration_minutes} min</td>
            <td>${record.condition}</td>
            <td>${new Date(record.used_at).toLocaleString()}</td>
        </tr>
    `).join('');
}
```

**Step 6:** Add translations in i18n.js

```javascript
const translations = {
    en: {
        'admin.equipment.title': 'Equipment Usage',
        'admin.equipment.name': 'Equipment Name',
        'admin.equipment.duration': 'Duration (minutes)',
        'admin.equipment.condition': 'Condition',
        // ... more keys
    },
    ru: {
        'admin.equipment.title': 'Использование оборудования',
        'admin.equipment.name': 'Название оборудования',
        'admin.equipment.duration': 'Длительность (минуты)',
        'admin.equipment.condition': 'Состояние',
        // ... more keys
    },
    kk: {
        'admin.equipment.title': 'Жабдықты пайдалану',
        'admin.equipment.name': 'Жабдықтың аты',
        'admin.equipment.duration': 'Ұзақтығы (минут)',
        'admin.equipment.condition': 'Жағдай',
        // ... more keys
    }
};
```

**Step 7:** Test with sample data

```sql
-- Insert test data
INSERT INTO equipment_usage (student_id, equipment_name, duration_minutes, condition)
SELECT id, 'Chess Board', 60, 'Good'
FROM students LIMIT 5;

-- Verify
SELECT * FROM equipment_usage ORDER BY used_at DESC LIMIT 10;
```

### Pattern 2: Granting User Permissions

When you need to give specific permissions to a user (e.g., can manage data exports):

**Step 1:** Verify user exists in auth.users

```sql
SELECT id, email FROM auth.users WHERE email = 'newuser@example.com';
```

**Step 2:** Check current user_roles record

```sql
SELECT * FROM user_roles WHERE user_id = '<user_uuid>';
```

**Step 3:** Update or insert with desired permissions

```sql
-- If user exists in auth.users but not in user_roles, INSERT
INSERT INTO user_roles (user_id, role, can_view_all_students, can_manage_data)
SELECT id, 'coach', true, true
FROM auth.users
WHERE email = 'newuser@example.com'
ON CONFLICT (user_id) DO UPDATE SET
    can_manage_data = true,
    updated_at = NOW();

-- Or UPDATE if record already exists
UPDATE user_roles
SET can_manage_data = true, updated_at = NOW()
WHERE user_id = '<user_uuid>';
```

**Step 4:** Verify permissions

```sql
SELECT
    u.email,
    ur.role,
    ur.can_manage_data,
    ur.updated_at
FROM user_roles ur
JOIN auth.users u ON ur.user_id = u.id
WHERE u.email = 'newuser@example.com';
```

**Step 5:** Test frontend access

1. Log in as the user
2. Verify they can access the Data Import/Export page
3. Verify they can download/upload files

**Step 6:** Document in SQL script for audit trail

```sql
-- File: GRANT_DATA_EXPORT_PERMISSION_NEWUSER.sql
-- Created: 2026-02-11
-- Purpose: Grant data management permissions to newuser@example.com

INSERT INTO user_roles (...)
...
```

### Pattern 3: Adding New Database Field

When you need to add a field to an existing table (e.g., add phone_number to coaches):

**Step 1:** Create migration SQL file

```sql
-- migrations/047_add_phone_to_coaches.sql
-- Purpose: Add phone number field to coaches table

ALTER TABLE coaches
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);

-- Create index if searching by phone
CREATE INDEX IF NOT EXISTS idx_coaches_phone ON coaches(phone_number);

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'coaches' AND column_name = 'phone_number';
```

**Step 2:** Add field to table schema documentation

```markdown
# Coaches Table
- id
- first_name
- last_name
- email
- phone_number   ← NEW FIELD
- expertise
- bio
- is_active
- created_at
- updated_at
```

**Step 3:** Update RLS policies if needed

Usually no changes needed, but verify:

```sql
-- Check existing policies
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename = 'coaches';
```

**Step 4:** Update API functions in supabase-data.js

```javascript
// Update getCoach to include new field
async function getCoach(coachId) {
    const { data, error } = await supabase
        .from('coaches')
        .select('*,coach_branches(branch_id)')  // Already gets all fields with *
        .eq('id', coachId)
        .single();
    return { data, error };
}

// No changes needed - * already includes new field

// Update createCoach to accept new field
async function createCoach(data) {
    // data now can include phone_number: 'xxx-xxx-xxxx'
    const { data: result, error } = await supabase
        .from('coaches')
        .insert([data])
        .select();
    return { data: result?.[0], error };
}

// No changes needed - insert accepts any fields
```

**Step 5:** Update frontend forms

```html
<!-- In coach edit modal -->
<div>
    <label>Phone Number</label>
    <input type="tel" id="coachPhone" placeholder="(123) 456-7890">
</div>
```

```javascript
// In form submission handler
const data = {
    first_name: document.getElementById('coachFirstName').value,
    last_name: document.getElementById('coachLastName').value,
    email: document.getElementById('coachEmail').value,
    phone_number: document.getElementById('coachPhone').value  // NEW
};
```

**Step 6:** Update validation logic

```javascript
// Validate phone number format
function validatePhoneNumber(phone) {
    const phoneRegex = /^[\d\s\-()]+$/;
    return phone === '' || phoneRegex.test(phone);  // Allow empty
}

// In form submission
if (!validatePhoneNumber(data.phone_number)) {
    showToast('Invalid phone number format', 'error');
    return;
}
```

**Step 7:** Test CRUD operations

```javascript
// Test 1: Create coach with phone
const { data, error } = await createCoach({
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    phone_number: '(123) 456-7890'  // NEW FIELD
});

// Test 2: Update coach phone
const { data, error } = await updateCoach(coachId, {
    phone_number: '(987) 654-3210'
});

// Test 3: Retrieve coach with phone
const { data, error } = await getCoach(coachId);
console.log(data.phone_number);  // Should print: '(987) 654-3210'
```

### Pattern 4: Implementing Automatic Tracking

When you want to automatically track something (e.g., track lesson completions):

**Step 1:** Define what to track

```
What: Lesson completions
When: After lesson is marked complete
Track: lesson_id, completion_time, student_rating
Purpose: Monitor teaching effectiveness
```

**Step 2:** Create history table with proper schema

```sql
CREATE TABLE lesson_completion_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id UUID REFERENCES lessons(id),
    student_id UUID REFERENCES students(id),
    coach_id UUID REFERENCES coaches(id),
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    student_rating INT,  -- 1-5 stars
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for performance
CREATE INDEX idx_lesson_completion_student ON lesson_completion_history(student_id);
CREATE INDEX idx_lesson_completion_coach ON lesson_completion_history(coach_id);
CREATE INDEX idx_lesson_completion_date ON lesson_completion_history(completed_at DESC);

-- Enable RLS
ALTER TABLE lesson_completion_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_own_completions"
ON lesson_completion_history FOR SELECT
USING (
    student_id IN (SELECT id FROM students WHERE coach_id = auth.uid())
    OR coach_id = auth.uid()
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);
```

**Step 3:** Write trigger function

```sql
CREATE OR REPLACE FUNCTION log_lesson_completion()
RETURNS TRIGGER AS $$
DECLARE
    v_coach_id UUID;
BEGIN
    -- Get coach_id from lesson
    SELECT coach_id INTO v_coach_id FROM lessons WHERE id = NEW.id;

    -- Insert completion record
    INSERT INTO lesson_completion_history (
        lesson_id,
        student_id,
        coach_id,
        completed_at,
        student_rating
    ) VALUES (
        NEW.id,
        NEW.student_id,
        v_coach_id,
        NOW(),
        NEW.rating
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Step 4:** Attach trigger to source table

```sql
CREATE TRIGGER lesson_completion_trigger
AFTER UPDATE ON lessons
FOR EACH ROW
WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    AND NEW.status = 'completed'
)
EXECUTE FUNCTION log_lesson_completion();
```

**Step 5:** Create query functions for frontend

```javascript
async function getLessonCompletions(filters = {}) {
    let query = supabase
        .from('lesson_completion_history')
        .select('*,students(*),coaches(*)')
        .order('completed_at', { ascending: false });

    if (filters.studentId) query = query.eq('student_id', filters.studentId);
    if (filters.coachId) query = query.eq('coach_id', filters.coachId);
    if (filters.fromDate) query = query.gte('completed_at', filters.fromDate);
    if (filters.toDate) query = query.lte('completed_at', filters.toDate);
    if (filters.minRating) query = query.gte('student_rating', filters.minRating);

    const { data, error } = await query;
    return { data, error };
}

async function getCompletionStats(coachId) {
    const { data, error } = await supabase
        .from('lesson_completion_history')
        .select('COUNT(*) as total, AVG(student_rating) as avg_rating')
        .eq('coach_id', coachId)
        .single();

    return { data, error };
}
```

**Step 6:** Build UI to display history

```html
<div id="lessonCompletionsSection">
    <h3>Lesson Completions</h3>
    <input type="date" id="completionFromDate">
    <input type="date" id="completionToDate">
    <select id="coachSelect">
        <option value="">All Coaches</option>
    </select>
    <button onclick="loadCompletions()">Load</button>
    <table id="completionsTable">
        <thead>
            <tr>
                <th>Student</th>
                <th>Coach</th>
                <th>Completed</th>
                <th>Rating</th>
            </tr>
        </thead>
        <tbody></tbody>
    </table>
</div>
```

**Step 7:** Add filtering and pagination

```javascript
let completionPage = 1;
const ITEMS_PER_PAGE = 50;

async function loadCompletions() {
    const fromDate = new Date(document.getElementById('completionFromDate').value);
    const toDate = new Date(document.getElementById('completionToDate').value);
    const coachId = document.getElementById('coachSelect').value;

    const offset = (completionPage - 1) * ITEMS_PER_PAGE;

    const { data, error } = await getLessonCompletions({
        fromDate: fromDate,
        toDate: toDate,
        coachId: coachId || null,
        limit: ITEMS_PER_PAGE,
        offset: offset
    });

    if (error) {
        showToast('Error: ' + error.message, 'error');
        return;
    }

    const tbody = document.querySelector('#completionsTable tbody');
    tbody.innerHTML = data.map(record => `
        <tr>
            <td>${record.students.first_name} ${record.students.last_name}</td>
            <td>${record.coaches.first_name} ${record.coaches.last_name}</td>
            <td>${new Date(record.completed_at).toLocaleString()}</td>
            <td>${record.student_rating} ⭐</td>
        </tr>
    `).join('');
}
```

---

## 10. Troubleshooting Guide

### Issue 1: Analytics Dashboard Not Visible

**Symptom:** User logs in but can't see Analytics menu items (Activity Log, Status History, User Sessions)

**Causes:**
1. User email not in `analyticsAllowedEmails` array in admin.js
2. User's `can_manage_app_access` permission is false in database
3. JavaScript not loading correctly

**Diagnostic Steps:**

```javascript
// In browser console, check user email
console.log('Current user email:', currentUserEmail);

// Check if email is in allowed list
const analyticsAllowedEmails = ['0xmarblemaster@gmail.com', 'dysonsphere01@proton.me'];
console.log('Is in allowed list?', analyticsAllowedEmails.includes(currentUserEmail));

// Check if menu items exist in DOM
console.log('Activity Log menu exists?', !!document.getElementById('menuActivityLog'));
console.log('Menu display style:', document.getElementById('menuActivityLog')?.style.display);
```

**Solutions:**

1. **Add email to allowed list (admin.js)**

```javascript
// admin.js lines 104-118
const analyticsAllowedEmails = [
    '0xmarblemaster@gmail.com',
    'dysonsphere01@proton.me',
    'newadmin@example.com'  // ADD HERE
];
```

2. **Grant database permission**

```sql
UPDATE user_roles
SET can_manage_app_access = true
WHERE user_id IN (
    SELECT id FROM auth.users WHERE email = 'newadmin@example.com'
);

-- Verify
SELECT u.email, ur.can_manage_app_access
FROM user_roles ur
JOIN auth.users u ON ur.user_id = u.id
WHERE u.email = 'newadmin@example.com';
```

3. **Clear browser cache and reload**

```
Ctrl+Shift+Delete (or Cmd+Shift+Delete on Mac)
Select "All time" and "Cookies and cached images"
Reload page
```

---

### Issue 2: Analytics Pages Show "No Data"

**Symptom:** Analytics tables are empty despite expecting data

**Causes:**
1. Default date filter is too narrow (24 hours = very short window)
2. No data exists for selected filters
3. Database triggers not firing (for auto-tracked data)
4. RLS policies blocking access

**Diagnostic Steps:**

```sql
-- Check if data exists at all
SELECT COUNT(*) FROM audit_log;
SELECT COUNT(*) FROM student_status_history;
SELECT COUNT(*) FROM user_sessions;

-- Check if data is within date range
SELECT COUNT(*) FROM audit_log
WHERE changed_at > NOW() - INTERVAL '24 hours';

SELECT COUNT(*) FROM audit_log
WHERE changed_at > NOW() - INTERVAL '30 days';

-- Check trigger status
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgname LIKE 'audit_%';
```

**Solutions:**

1. **Change date filter to wider range**
   - Click date range dropdown
   - Select "All Time" instead of "24 hours"
   - Click "Load"

2. **Create test data**

```sql
-- Insert test audit log entry
INSERT INTO audit_log (
    entity_type, action, changed_by, user_email,
    changed_at, old_values, new_values, changed_fields
)
SELECT
    'student', 'UPDATE', id, email,
    NOW(), '{}', '{}', ARRAY['rating']
FROM auth.users LIMIT 1;

-- Verify
SELECT * FROM audit_log ORDER BY changed_at DESC LIMIT 1;
```

3. **Check RLS policies**

```sql
-- Test if current user can see audit_log
SELECT COUNT(*) FROM audit_log;  -- Should return count, not error

-- If error "Insufficient Privileges", check RLS policy
SELECT policyname, qual FROM pg_policies
WHERE tablename = 'audit_log';
```

---

### Issue 3: User Sessions Table Empty

**Symptom:** User Sessions page shows no data

**Root Cause:** Login/logout tracking is NOT integrated in auth flow (known issue)

**Status:** Infrastructure is ready (database table, API functions, UI complete), but integration is missing

**Solution:** Implement login/logout calls (see Section 4.3 - Implementation Guide)

```javascript
// In login handler, add:
await logLogin(sessionToken, ipAddress, navigator.userAgent);

// In logout handler, add:
await logLogout(sessionId);
```

---

### Issue 4: Permission Denied Errors

**Symptom:** API calls return 403 Forbidden

**Example Error:**
```javascript
{
    status: 403,
    error: "new row violates row-level security policy",
    details: "..."
}
```

**Causes:**
1. User not authenticated (no valid JWT token)
2. RLS policy blocking access for this user
3. User role insufficient

**Diagnostic Steps:**

```javascript
// Check if authenticated
const { data: { user } } = await supabase.auth.getUser();
console.log('Authenticated user:', user?.email);

// Check user role
const { data: role } = await getUserRole(user.id);
console.log('User role:', role);
```

**Solutions:**

1. **Check authentication**
```javascript
// Make sure user is logged in
if (!currentUser) {
    window.location.href = '/login.html';
    return;
}
```

2. **Check RLS policy**

```sql
-- View all policies for a table
SELECT policyname, qual, with_check
FROM pg_policies
WHERE tablename = 'students'
ORDER BY policyname;

-- Test if policy blocks your user
SELECT COUNT(*) FROM students;  -- Try the query
```

3. **Grant required permissions**

```sql
UPDATE user_roles
SET can_view_all_students = true, can_edit_students = true
WHERE user_id = '<user_uuid>';
```

---

### Issue 5: SQL Migration Failures

**Symptom:** Migration script fails to execute

**Example Error:**
```
ERROR: relation "students" does not exist
ERROR: duplicate key value violates unique constraint
ERROR: syntax error at or near "CREATE"
```

**Solutions:**

1. **Run migrations in order**
   - Always execute migrations sequentially (001, 002, 003...)
   - Don't skip migrations
   - Run in single session to avoid transaction issues

2. **Check for existing objects**

```sql
-- Check if table exists
SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'students'
);

-- Check if constraint exists
SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name = 'students' AND constraint_type = 'PRIMARY KEY';
```

3. **Use IF NOT EXISTS clauses**

```sql
-- GOOD - won't fail if already exists
CREATE TABLE IF NOT EXISTS students (...);

-- BAD - fails if table exists
CREATE TABLE students (...);
```

4. **Test in staging first**

```
1. Create test Supabase project
2. Run migration there
3. Verify it works
4. Then run on production
```

---

### Issue 6: Branch-Specific Schedule Not Working

**Symptom:** Schedule type dropdown shows same options for all branches

**Causes:**
1. Branch detection logic not working
2. Branch names in database don't match detection logic
3. JavaScript not loading for НИШ branch check

**Diagnostic Steps:**

```javascript
// Check branch name in database
SELECT id, name FROM branches WHERE name ILIKE '%NISH%' OR name ILIKE '%ниш%';

// Check JavaScript logic
const branchName = 'НИШ';  // or selected branch name
const isNishBranch = branchName.toLowerCase().includes('ниш') ||
                     branchName.toLowerCase().includes('nish');
console.log('Is НИШ branch?', isNishBranch);
```

**Solutions:**

1. **Verify branch name in database**

```sql
SELECT * FROM branches ORDER BY name;

-- If НИШ exists, branch name should exactly match this
```

2. **Update JavaScript detection if name is different**

```javascript
// admin.js - update branch detection
const isNishBranch = attendanceCurrentBranch && (
    attendanceCurrentBranch.toLowerCase().includes('ниш') ||
    attendanceCurrentBranch.toLowerCase().includes('nish') ||
    attendanceCurrentBranch.toLowerCase().includes('nishe')  // Add variant if needed
);
```

3. **Add schedule translation for all languages**

Verify all 3 languages have `admin.attendance.wedFri`:

```sql
-- Check if translation key exists
SELECT * FROM i18n_keys WHERE key = 'admin.attendance.wedFri';

-- If missing, add to i18n.js
```

---

## 11. Future Enhancements

### 🔴 High Priority

#### 1. Implement User Session Tracking

**Current Status:** Infrastructure ready, integration missing

**What's Needed:**
- [ ] Add `logLogin()` call in authentication handler
- [ ] Add `logLogout()` call in sign-out handler
- [ ] Create Edge Function to capture client IP
- [ ] Set up cron job for session expiry

**Files to Modify:**
- `supabase-client.js` (or authentication file)
- Create new Edge Function (or use Cron)

**Estimated Effort:** 4-6 hours

**Value:** Track when users access the system, detect suspicious activity

---

#### 2. Change Default Date Filters

**Current Status:** Filters are too narrow, confusing users

**Changes:**
- Activity Log: 24h → 7d (shows last week)
- Status History: 30d → 90d (shows last quarter)
- User Sessions: 7d → 30d (shows last month)

**Files to Modify:**
- `admin.js` (lines with default date calculations)

**Estimated Effort:** 1-2 hours

**Value:** Better user experience, less confusion about "No Data"

---

#### 3. Add IP Address Tracking

**Current Status:** Not implemented

**What's Needed:**
- [ ] Create Edge Function to capture client IP
- [ ] Pass IP to `logLogin()` function
- [ ] Store IP in `user_sessions.ip_address`
- [ ] Display IP in analytics table
- [ ] Add IP column to CSV export

**Security Benefit:** Detect unauthorized access, track login locations

**Estimated Effort:** 3-4 hours

---

### 🟡 Medium Priority

#### 4. Add Pagination to Status History

**Current Status:** Limited to 100 entries (hard limit)

**What's Needed:**
- [ ] Add next/previous buttons
- [ ] Show page numbers
- [ ] Show total count
- [ ] Match Activity Log pagination pattern

**Files to Modify:**
- `admin.html` (pagination UI)
- `admin.js` (pagination handlers)
- `supabase-data.js` (add limit/offset to query)

**Estimated Effort:** 3-4 hours

---

#### 5. Export Functionality for All Analytics

**Current Status:** Only Activity Log has export

**What's Needed:**
- [ ] Add CSV export to Status History
- [ ] Add CSV export to User Sessions
- [ ] Standardize export format
- [ ] Add filename with timestamp

**Files to Modify:**
- `supabase-data.js` (add export functions)
- `admin.js` (add export buttons)
- `admin.html` (add export button UI)

**Estimated Effort:** 2-3 hours

---

#### 6. Add Audit Log for Ratings

**Current Status:** Rating changes not tracked

**What's Needed:**
- [ ] Create `rating_changes` table
- [ ] Add trigger on student rating updates
- [ ] Create query function `getRatingHistory()`
- [ ] Add UI to view rating change history

**Similar to:** Status History implementation

**Estimated Effort:** 4-5 hours

---

#### 7. Create User Manual

**Current Status:** Developers understand system, end-users don't

**What's Needed:**
- [ ] Write coach user guide (managing students)
- [ ] Write admin user guide (all features)
- [ ] Add screenshots for each major feature
- [ ] Create video tutorials
- [ ] Add FAQ section

**Estimated Effort:** 15-20 hours

---

### 🟢 Low Priority

#### 8. Add Data Visualization

**Current Status:** Tables only, no charts

**What's Needed:**
- [ ] Activity trend chart (X: date, Y: # changes)
- [ ] Status change pie chart (# active/frozen/left)
- [ ] Session activity heatmap (when do users login?)
- [ ] User engagement metrics

**Libraries to Consider:**
- Chart.js (lightweight, simple)
- D3.js (powerful, complex)
- Plotly.js (good balance)

**Estimated Effort:** 8-12 hours

---

#### 9. Implement Email Notifications

**Current Status:** Not implemented

**Examples:**
- Notify admin when student status changes
- Notify coach when student is assigned
- Weekly activity summary emails

**Tools:**
- Supabase Functions (serverless)
- SendGrid or Mailgun (email delivery)

**Estimated Effort:** 6-8 hours

---

#### 10. Add Advanced Filtering

**Current Status:** Basic filters work

**Enhancements:**
- [ ] Custom date range picker
- [ ] Multi-select for entity types
- [ ] Save filter presets
- [ ] Quick filters (Today, This Week, This Month)

**Files to Modify:**
- `admin.html` (UI)
- `admin.js` (filter logic)

**Estimated Effort:** 4-6 hours

---

## Appendices

### Appendix A: SQL Verification Queries

#### Check Analytics Table Counts

```sql
-- How much data in each analytics table?
SELECT 'audit_log' as table_name, COUNT(*) as row_count FROM audit_log
UNION ALL
SELECT 'student_status_history', COUNT(*) FROM student_status_history
UNION ALL
SELECT 'user_sessions', COUNT(*) FROM user_sessions;
```

#### View Recent Analytics Data

```sql
-- Latest 20 activity log entries
SELECT
    entity_type,
    action,
    user_email,
    changed_at,
    changed_fields
FROM audit_log
ORDER BY changed_at DESC
LIMIT 20;

-- Latest 20 status changes
SELECT
    student_name,
    old_status,
    new_status,
    user_email,
    changed_at
FROM student_status_history
ORDER BY changed_at DESC
LIMIT 20;

-- Latest 20 sessions
SELECT
    user_email,
    login_at,
    logout_at,
    device_type,
    status
FROM user_sessions
ORDER BY login_at DESC
LIMIT 20;
```

#### Check if Data Exists

```sql
-- For specific date range
SELECT COUNT(*) as changes_last_7_days
FROM audit_log
WHERE changed_at > NOW() - INTERVAL '7 days';

SELECT COUNT(*) as status_changes_last_30_days
FROM student_status_history
WHERE changed_at > NOW() - INTERVAL '30 days';
```

#### Check Triggers Status

```sql
-- Are analytics triggers enabled?
SELECT
    tgname as trigger_name,
    tgenabled as enabled,
    tgrelid::regclass as table_name
FROM pg_trigger
WHERE tgname IN (
    'audit_students_changes',
    'audit_coaches_changes',
    'audit_branches_changes',
    'track_student_status_changes',
    'on_auth_user_created'
)
ORDER BY tgname;
```

#### Verify User Permissions

```sql
-- Check specific user's full permissions
SELECT
    u.email,
    ur.role,
    ur.can_view_all_students,
    ur.can_edit_students,
    ur.can_manage_branches,
    ur.can_manage_coaches,
    ur.can_manage_app_access,
    ur.can_manage_ratings,
    ur.can_manage_data,
    ur.can_manage_attendance,
    ur.created_at,
    ur.updated_at
FROM user_roles ur
JOIN auth.users u ON ur.user_id = u.id
WHERE u.email = 'user@example.com';

-- Check all admins
SELECT u.email, ur.role
FROM user_roles ur
JOIN auth.users u ON ur.user_id = u.id
WHERE ur.role = 'admin'
ORDER BY u.email;
```

---

### Appendix B: Admin Access SQL Templates

#### Grant Full Admin Access

Use this template when adding a new admin user:

```sql
-- Grant Full Admin Access to user@example.com
-- Created: 2026-02-11
-- Purpose: Grant all admin permissions

INSERT INTO user_roles (
    user_id,
    role,
    can_view_all_students,
    can_edit_students,
    can_manage_branches,
    can_manage_coaches,
    can_manage_app_access,
    can_manage_ratings,
    can_manage_data,
    can_manage_attendance
)
SELECT
    u.id,
    'admin',
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true
FROM auth.users u
WHERE u.email = 'user@example.com'
ON CONFLICT (user_id)
DO UPDATE SET
    role = 'admin',
    can_view_all_students = true,
    can_edit_students = true,
    can_manage_branches = true,
    can_manage_coaches = true,
    can_manage_app_access = true,
    can_manage_ratings = true,
    can_manage_data = true,
    can_manage_attendance = true,
    updated_at = NOW();

-- Verify
SELECT u.email, ur.role, ur.can_manage_app_access
FROM user_roles ur
JOIN auth.users u ON ur.user_id = u.id
WHERE u.email = 'user@example.com';
```

#### Grant Limited Coach Access

Use this when adding a coach who should manage attendance and ratings:

```sql
INSERT INTO user_roles (
    user_id,
    role,
    can_view_all_students,
    can_edit_students,
    can_manage_branches,
    can_manage_coaches,
    can_manage_app_access,
    can_manage_ratings,
    can_manage_data,
    can_manage_attendance
)
SELECT
    u.id,
    'coach',
    true,      -- Can see students (theirs)
    true,      -- Can edit students
    false,     -- Cannot manage branches
    false,     -- Cannot manage coaches
    false,     -- Cannot access analytics
    true,      -- Can manage ratings
    false,     -- Cannot import/export
    true       -- Can manage attendance
FROM auth.users u
WHERE u.email = 'coach@example.com'
ON CONFLICT (user_id)
DO UPDATE SET
    role = 'coach',
    can_view_all_students = true,
    can_edit_students = true,
    can_manage_ratings = true,
    can_manage_attendance = true,
    updated_at = NOW();
```

#### Revoke All Access

Use this to completely remove a user:

```sql
DELETE FROM user_roles
WHERE user_id IN (
    SELECT id FROM auth.users WHERE email = 'user@example.com'
);

-- Note: User still exists in auth.users, just has no permissions
-- To fully delete user, use Supabase dashboard
```

#### Revoke Specific Permission

Use this to remove one permission:

```sql
UPDATE user_roles
SET can_manage_app_access = false, updated_at = NOW()
WHERE user_id IN (
    SELECT id FROM auth.users WHERE email = 'user@example.com'
);
```

---

### Appendix C: Sample Data Import

If you need to test with sample data:

```sql
-- Insert sample students
INSERT INTO students (
    id, first_name, last_name, email, phone_number,
    date_of_birth, level, rating, status, branch_id, coach_id
)
VALUES
    (gen_random_uuid(), 'Alice', 'Johnson', 'alice@example.com', '123-456-7890',
     '2010-05-15', 'Beginner', 800, 'active', 'branch-uuid-1', 'coach-uuid-1'),
    (gen_random_uuid(), 'Bob', 'Smith', 'bob@example.com', '123-456-7891',
     '2009-06-20', 'Intermediate', 1200, 'active', 'branch-uuid-1', 'coach-uuid-2'),
    (gen_random_uuid(), 'Charlie', 'Brown', 'charlie@example.com', '123-456-7892',
     '2008-07-25', 'Advanced', 1600, 'frozen', 'branch-uuid-2', 'coach-uuid-1');

-- Insert sample status history
INSERT INTO student_status_history (
    id, student_id, student_name, branch_id, old_status, new_status,
    changed_by, user_email, changed_at
)
SELECT
    gen_random_uuid(),
    s.id,
    s.first_name || ' ' || s.last_name,
    s.branch_id,
    'active',
    'frozen',
    u.id,
    u.email,
    NOW() - INTERVAL '5 days'
FROM students s, auth.users u
LIMIT 3;
```

---

### Appendix D: File Reference Index

#### Critical Files (Understand These First)

| File | Lines | Purpose | Should Know |
|------|-------|---------|-------------|
| `supabase-data.js` | 3,056 | All database queries | API layer, data access patterns |
| `admin.js` | 1,379 | Admin dashboard logic | UI handlers, event listeners |
| `admin.html` | 1,241 | Admin dashboard UI | HTML structure, section IDs |
| `i18n.js` | 185,245 | Translations (3 languages) | How to add new UI text |
| `supabase-schema.sql` | 367 | Database schema | Table definitions, relationships |

#### Important Files (Understand Second)

| File | Purpose |
|------|---------|
| `index.html` | Public homepage, student search |
| `login.html` | Authentication page |
| `student.html` | Student profile page |
| `coach.html` | Coach profile page |
| `register.html` | User registration |
| `supabase-client.js` | Supabase SDK initialization |
| `crud.js` | CRUD helper functions |

#### Configuration & Setup

| File | Purpose |
|------|---------|
| `README.md` | Quick start guide |
| `DEPLOYMENT_GUIDE.md` | How to deploy |
| `ARCHITECTURE_DIAGRAM.md` | System architecture |
| `.env.local` | Environment variables (not in git) |

#### Database & Migrations

| File | Purpose |
|------|---------|
| `migrations/001_initial_schema.sql` | Initial database setup |
| `migrations/021_add_audit_log.sql` | Activity Log table |
| `migrations/022_add_status_history.sql` | Status History table |
| `migrations/023_add_user_sessions.sql` | User Sessions table |
| `migrations/025_add_wed_fri_schedule_for_nish.sql` | НИШ branch schedule |

#### SQL Scripts & Admin Tools

| File | Purpose |
|------|---------|
| `GRANT_ADMIN_ACCESS_DYSONSPHERE01.sql` | Grant admin to dysonsphere01 |
| Database functions (in migrations) | `log_entity_changes()`, `track_status_changes()`, etc. |

#### Function Index

**Top 20 Most Important Functions:**

```javascript
// Data Access (supabase-data.js)
getStudents(filters)           // Get student list with filters
createStudent(data)            // Create new student
updateStudent(id, data)        // Update student
getAuditLog(filters)           // Get activity log
getStatusHistory(filters)      // Get status change history
getUserSessions(filters)       // Get login/logout history
getCoaches()                   // Get coach list
getBranches()                  // Get branch list
getUserRole(userId)            // Get user permissions

// Admin Dashboard (admin.js)
loadStudents()                 // Load and display student list
loadActivityLog()              // Load and display audit log
loadStatusHistory()            // Load and display status changes
loadUserSessions()             // Load and display sessions
filterActivityLog()            // Apply activity log filters
exportActivityLogCSV()         // Download activity log as CSV
showModal(modalId)             // Open modal dialog
closeModal(modalId)            // Close modal dialog
showToast(message, type)       // Show notification
```

#### Database Table Index

| Table | Rows | Purpose |
|-------|------|---------|
| `students` | ~500 | Main student records |
| `coaches` | ~50 | Coach records |
| `branches` | 8 | Academy branches |
| `attendance` | ~5000 | Attendance records |
| `audit_log` | ~1000+ | Change tracking |
| `student_status_history` | ~100+ | Status change tracking |
| `user_sessions` | 0 (not integrated) | Login/logout tracking |
| `user_roles` | ~10 | User permissions |
| `coach_branches` | ~100 | Coach-branch assignments |

---

## Document Metadata

- **Version:** 1.0
- **Created:** 2026-02-11
- **Last Updated:** 2026-02-11
- **Authors:** Chess Empire Development Team
- **Target Audience:** Developers, System Administrators, New Team Members
- **Maintenance:** Update when adding new features or fixing critical issues
- **Related Files:**
  - README.md (Quick start)
  - ARCHITECTURE_DIAGRAM.md (Visual overview)
  - DEPLOYMENT_GUIDE.md (Deployment steps)

---

**End of Chess Empire Analytics & System Guide**

For questions or clarifications, refer to the inline comments in the source code or create an issue on GitHub.
