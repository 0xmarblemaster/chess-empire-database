# Attendance Backup System

This directory contains tools for backing up attendance records to prevent accidental data loss.

## 📁 Files

- **`backup-attendance.js`** - Automated backup script (Node.js)
- **`../migrations/017_backup_attendance_records.sql`** - Manual backup SQL query
- **`../backups/attendance/`** - Backup files storage (auto-created)

---

## 🚀 Quick Start

### Option 1: Automated Backup (Recommended)

Run the Node.js backup script:

```bash
cd /home/marblemaster/Desktop/Cursor/chess-empire-database
node scripts/backup-attendance.js
```

**What it does:**
- ✅ Fetches all attendance records from Supabase
- ✅ Saves to JSON (with full structure) and CSV (for spreadsheets)
- ✅ Generates backup summary statistics
- ✅ Auto-cleans old backups (keeps last 20 files)
- ✅ Creates timestamped files: `attendance_backup_YYYY-MM-DD.json/csv`

**Requirements:**
- Node.js installed
- Environment variables set:
  - `VITE_SUPABASE_URL` or `SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY` or `SUPABASE_ANON_KEY`

### Option 2: Manual Backup (SQL)

Run the SQL backup query in Supabase SQL Editor:

1. Open Supabase Dashboard → SQL Editor
2. Create new query
3. Copy entire contents of `migrations/017_backup_attendance_records.sql`
4. Execute
5. Export results to CSV using the "Download CSV" button

**What it shows:**
- ✅ All attendance records with student/branch/coach details
- ✅ Statistics by branch, schedule type, and month
- ✅ Top students by attendance count
- ✅ Data integrity checks (orphaned records, duplicates, etc.)
- ✅ Recent changes (last 7 days)

---

## ⏰ Automated Scheduling

### Weekly Backup (Recommended)

Add to crontab (Linux/Mac):

```bash
# Open crontab editor
crontab -e

# Add this line (runs every Sunday at 2 AM)
0 2 * * 0 cd /home/marblemaster/Desktop/Cursor/chess-empire-database && node scripts/backup-attendance.js >> /var/log/attendance-backup.log 2>&1
```

### Daily Backup

```bash
# Runs every day at 3 AM
0 3 * * * cd /home/marblemaster/Desktop/Cursor/chess-empire-database && node scripts/backup-attendance.js
```

### Windows Task Scheduler

1. Open Task Scheduler
2. Create Basic Task
3. Trigger: Weekly on Sunday, 2:00 AM
4. Action: Start a program
5. Program: `node`
6. Arguments: `scripts/backup-attendance.js`
7. Start in: `C:\path\to\chess-empire-database`

---

## 📊 Backup File Formats

### JSON Format (Full Structure)

```json
{
  "backup_date": "2026-01-27T13:00:00.000Z",
  "record_count": 1523,
  "records": [
    {
      "id": "uuid-here",
      "student_id": "uuid-here",
      "attendance_date": "2026-01-15",
      "is_present": true,
      "schedule_type": "mon_wed",
      "time_slot": "15:00-16:00",
      "branch_id": "uuid-here",
      "students": {
        "first_name": "John",
        "last_name": "Doe",
        "email": "john@example.com"
      },
      "branches": {
        "name": "Debut"
      },
      "created_at": "2026-01-15T10:00:00",
      "updated_at": "2026-01-15T10:00:00"
    }
  ]
}
```

### CSV Format (Spreadsheet Compatible)

```csv
attendance_id,student_id,student_name,student_email,attendance_date,is_present,schedule_type,time_slot,branch_id,branch_name,created_at,updated_at
uuid-1,uuid-2,John Doe,john@example.com,2026-01-15,true,mon_wed,15:00-16:00,uuid-3,Debut,2026-01-15T10:00:00,2026-01-15T10:00:00
```

---

## 🔧 Restoration

### From JSON Backup

```javascript
// Read backup file
const backup = require('../backups/attendance/attendance_backup_2026-01-27.json');

// Restore specific records
backup.records.forEach(record => {
    // Use Supabase client to insert
    supabase.from('attendance').insert({
        id: record.id,
        student_id: record.student_id,
        attendance_date: record.attendance_date,
        is_present: record.is_present,
        schedule_type: record.schedule_type,
        time_slot: record.time_slot,
        branch_id: record.branch_id,
        created_at: record.created_at,
        updated_at: record.updated_at
    });
});
```

### From CSV Backup

1. Open Supabase Dashboard → Table Editor → `attendance` table
2. Click "Import" button (top right)
3. Select CSV file: `attendance_backup_YYYY-MM-DD.csv`
4. Map columns to table fields
5. Click "Import"

**Alternative (SQL):**

```bash
# Using psql command
psql -h your-supabase-host -U postgres -d your-database -c "\copy attendance FROM 'backups/attendance/attendance_backup_2026-01-27.csv' CSV HEADER"
```

---

## 🛡️ Best Practices

1. **Run backups regularly** - Weekly minimum, daily for active periods
2. **Store backups off-site** - Copy to Google Drive, Dropbox, or cloud storage
3. **Test restoration** - Periodically verify backups can be restored
4. **Keep multiple versions** - Script auto-keeps last 20 backups
5. **Monitor backup logs** - Check for errors after scheduled runs
6. **Backup before major changes** - Always backup before:
   - Database migrations
   - RLS policy changes
   - Bulk data operations
   - Schema changes

---

## 📝 Backup Checklist

### Before Major Changes
- [ ] Run manual backup: `node scripts/backup-attendance.js`
- [ ] Verify backup files created in `backups/attendance/`
- [ ] Check backup summary for correct record count
- [ ] Copy backup files to secure location

### Weekly Maintenance
- [ ] Verify automated backup ran successfully
- [ ] Check backup log for errors
- [ ] Review backup file sizes (should grow over time)
- [ ] Copy latest backups to cloud storage

### Monthly Review
- [ ] Run SQL diagnostic: `017_backup_attendance_records.sql`
- [ ] Review data integrity checks
- [ ] Check for orphaned or duplicate records
- [ ] Verify student/branch associations

---

## 🚨 Emergency Recovery

If attendance data is accidentally deleted:

1. **STOP** - Don't make any more changes
2. **Find latest backup** - Check `backups/attendance/` directory
3. **Verify backup integrity** - Open JSON/CSV and check records
4. **Restore data** - Use restoration methods above
5. **Verify restoration** - Check record counts match
6. **Update policies** - Prevent similar issues (RLS policies, permissions)

---

## 📞 Support

If you encounter issues:

1. Check backup logs: `backups/attendance/backup.log`
2. Verify Supabase credentials are set
3. Ensure Node.js is installed: `node --version`
4. Check disk space: `df -h`
5. Review error messages in console output

---

## 🔐 Security Notes

- **Never commit backups to Git** - Backups contain sensitive student data
- **Encrypt backups** if storing off-site
- **Restrict access** to backup directory
- **Use environment variables** for credentials (never hardcode)
- **Rotate backup storage** regularly to prevent unlimited growth

---

## 📊 Backup Statistics

After each backup, you'll see:

```
📊 Backup Summary:
   Total Records: 1,523
   Date Range: 2025-09-01 to 2026-01-27
   Attendance Rate: 94.2%
   By Branch: { 'Debut': 523, 'Halyk Arena': 1000 }
   By Schedule: { 'mon_wed': 800, 'tue_thu': 723 }
```

This helps you:
- ✅ Verify backup completeness
- ✅ Monitor data growth trends
- ✅ Identify attendance patterns
- ✅ Detect anomalies (e.g., sudden record drops)

---

## 🎯 Quick Commands

```bash
# Run backup now
node scripts/backup-attendance.js

# Check backup files
ls -lh backups/attendance/

# Count backup files
ls backups/attendance/ | wc -l

# View latest backup summary
tail -n 20 backups/attendance/backup.log

# Disk usage of backups
du -sh backups/attendance/
```

---

**Remember:** Backups are your safety net. Run them regularly and test restoration periodically!
