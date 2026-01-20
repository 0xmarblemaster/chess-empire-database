-- Clear all time slot assignments except for Halyk Arena
-- This allows admins to manually assign students via "Add Student" button
-- Halyk Arena already has manual assignments that should be preserved

DELETE FROM student_time_slot_assignments
WHERE branch_id NOT IN (
    SELECT id FROM branches WHERE name = 'Halyk Arena'
);

-- Verify the deletion
SELECT
    b.name as branch_name,
    COUNT(*) as assignments_count
FROM student_time_slot_assignments stsa
JOIN students s ON s.id = stsa.student_id
JOIN branches b ON b.id = stsa.branch_id
GROUP BY b.name
ORDER BY b.name;
