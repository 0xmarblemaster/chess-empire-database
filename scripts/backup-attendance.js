#!/usr/bin/env node

/**
 * ATTENDANCE BACKUP SCRIPT
 *
 * Automatically backs up all attendance records to JSON and CSV files
 * Run this script periodically (weekly recommended) to prevent data loss
 *
 * Usage:
 *   node scripts/backup-attendance.js
 *
 * Or add to cron (weekly on Sunday at 2 AM):
 *   0 2 * * 0 cd /path/to/chess-empire-database && node scripts/backup-attendance.js
 */

const fs = require('fs');
const path = require('path');

// Configuration
const BACKUP_DIR = path.join(__dirname, '../backups/attendance');
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

// Create backup directory if it doesn't exist
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Fetch all attendance records from Supabase
 */
async function fetchAttendanceRecords() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error('❌ Error: Supabase credentials not found in environment variables');
        console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
        process.exit(1);
    }

    console.log('📡 Connecting to Supabase...');

    const response = await fetch(`${SUPABASE_URL}/rest/v1/attendance?select=*,students(first_name,last_name,parent_name,parent_phone,parent_email),branches(name),coaches(first_name,last_name,email)`, {
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch attendance records: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ Fetched ${data.length} attendance records`);
    return data;
}

/**
 * Save records to JSON file
 */
function saveToJSON(records, timestamp) {
    const filename = `attendance_backup_${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);

    const backup = {
        backup_date: new Date().toISOString(),
        record_count: records.length,
        records: records
    };

    fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));
    console.log(`💾 Saved JSON backup: ${filename}`);
    return filepath;
}

/**
 * Save records to CSV file
 */
function saveToCSV(records, timestamp) {
    const filename = `attendance_backup_${timestamp}.csv`;
    const filepath = path.join(BACKUP_DIR, filename);

    // CSV headers
    const headers = [
        'attendance_id',
        'student_id',
        'student_name',
        'parent_name',
        'parent_phone',
        'parent_email',
        'attendance_date',
        'is_present',
        'schedule_type',
        'time_slot',
        'branch_id',
        'branch_name',
        'created_at',
        'updated_at'
    ];

    // Convert records to CSV rows
    const rows = records.map(record => {
        const student = record.students || {};
        const branch = record.branches || {};

        return [
            record.id,
            record.student_id,
            `${student.first_name || ''} ${student.last_name || ''}`.trim(),
            student.parent_name || '',
            student.parent_phone || '',
            student.parent_email || '',
            record.attendance_date,
            record.is_present,
            record.schedule_type,
            record.time_slot || '',
            record.branch_id,
            branch.name || '',
            record.created_at,
            record.updated_at
        ].map(field => {
            // Escape quotes and wrap in quotes if contains comma
            const str = String(field === null ? '' : field);
            return str.includes(',') || str.includes('"')
                ? `"${str.replace(/"/g, '""')}"`
                : str;
        }).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    fs.writeFileSync(filepath, csvContent);
    console.log(`💾 Saved CSV backup: ${filename}`);
    return filepath;
}

/**
 * Clean up old backups (keep last 10)
 */
function cleanupOldBackups() {
    const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('attendance_backup_'))
        .map(f => ({
            name: f,
            path: path.join(BACKUP_DIR, f),
            mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime); // Sort by newest first

    const filesToDelete = files.slice(20); // Keep last 20 backups (10 JSON + 10 CSV)

    filesToDelete.forEach(file => {
        fs.unlinkSync(file.path);
        console.log(`🗑️  Deleted old backup: ${file.name}`);
    });

    if (filesToDelete.length > 0) {
        console.log(`✅ Cleaned up ${filesToDelete.length} old backup(s)`);
    }
}

/**
 * Generate backup summary
 */
function generateSummary(records) {
    const summary = {
        total_records: records.length,
        date_range: {
            earliest: records.reduce((min, r) => r.attendance_date < min ? r.attendance_date : min, records[0]?.attendance_date),
            latest: records.reduce((max, r) => r.attendance_date > max ? r.attendance_date : max, records[0]?.attendance_date)
        },
        by_branch: {},
        by_schedule: {},
        present_count: 0,
        absent_count: 0
    };

    records.forEach(record => {
        // Count by branch
        const branchName = record.branches?.name || 'Unknown';
        summary.by_branch[branchName] = (summary.by_branch[branchName] || 0) + 1;

        // Count by schedule
        summary.by_schedule[record.schedule_type] = (summary.by_schedule[record.schedule_type] || 0) + 1;

        // Count present/absent
        if (record.is_present) {
            summary.present_count++;
        } else {
            summary.absent_count++;
        }
    });

    summary.attendance_rate = ((summary.present_count / records.length) * 100).toFixed(2) + '%';

    return summary;
}

/**
 * Main backup function
 */
async function backup() {
    console.log('🚀 Starting attendance backup...');
    console.log('='.repeat(50));

    try {
        // Fetch records
        const records = await fetchAttendanceRecords();

        if (records.length === 0) {
            console.warn('⚠️  No attendance records found to backup');
            return;
        }

        // Generate timestamp for filenames
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];

        // Save to both formats
        const jsonPath = saveToJSON(records, timestamp);
        const csvPath = saveToCSV(records, timestamp);

        // Generate and display summary
        const summary = generateSummary(records);
        console.log('\n📊 Backup Summary:');
        console.log(`   Total Records: ${summary.total_records}`);
        console.log(`   Date Range: ${summary.date_range.earliest} to ${summary.date_range.latest}`);
        console.log(`   Attendance Rate: ${summary.attendance_rate}`);
        console.log(`   By Branch:`, summary.by_branch);
        console.log(`   By Schedule:`, summary.by_schedule);

        // Cleanup old backups
        console.log('\n🧹 Cleaning up old backups...');
        cleanupOldBackups();

        console.log('\n✅ Backup completed successfully!');
        console.log(`   JSON: ${jsonPath}`);
        console.log(`   CSV: ${csvPath}`);
        console.log('='.repeat(50));

    } catch (error) {
        console.error('❌ Backup failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run backup
if (require.main === module) {
    backup().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { backup };
