# Fix: Add Student Function Not Saving to Database

## Problem

The "Add Student" button in the admin dashboard uses `submitAddStudent()` function which only adds students to the local JavaScript array but **doesn't save to Supabase database**.

## Root Cause

File: [admin.js:1530-1572](admin.js#L1530-L1572)

The `submitAddStudent()` function:
```javascript
function submitAddStudent(event) {
    // ... gets form data ...

    // ❌ PROBLEM: Only adds to local array
    students.push(newStudent);

    // ❌ PROBLEM: No Supabase save!
    closeAddStudentModal();
    showSuccessMessage(t('admin.form.addSuccess'));
    updateDashboard();
    renderTable();
    updateStats();
}
```

## Solution

Replace the broken `submitAddStudent()` function with one that calls the proper `createStudent()` function from [crud.js](crud.js#L217), which properly saves to Supabase.

## Files to Modify

1. **admin.js** - Replace `submitAddStudent()` function (lines 1529-1572)

## Detailed Fix

The proper flow should be:

```
User clicks "Save"
  ↓
submitAddStudent() [admin.js]
  ↓
createStudent() [crud.js]
  ↓
supabaseData.addStudent() [supabase-data.js]
  ↓
INSERT INTO students table
  ↓
Success!
```

Currently it's stuck at step 1 and never reaches the database.
