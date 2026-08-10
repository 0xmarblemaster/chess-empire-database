-- 067: Exclude students with status 'left' from the public rating leaderboard.
-- Requested 2026-08-10: app.chessempire.kz/ratings showed departed students.
-- Keeps 'active' and 'frozen'; NULL status is treated as 'active' (schema default).

CREATE OR REPLACE FUNCTION public.get_rating_leaderboard()
 RETURNS TABLE(student_id uuid, first_name text, last_name text, photo_url text, branch_id uuid, branch_name text, coach_id uuid, coach_first_name text, coach_last_name text, rating integer, delta integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
WITH latest AS (
    SELECT DISTINCT ON (student_id) student_id, rating, rating_date
    FROM student_ratings
    ORDER BY student_id, rating_date DESC
), previous AS (
    SELECT DISTINCT ON (sr.student_id) sr.student_id, sr.rating
    FROM student_ratings sr
    INNER JOIN latest l ON sr.student_id = l.student_id AND sr.rating_date < l.rating_date
    ORDER BY sr.student_id, sr.rating_date DESC
)
SELECT
    s.id AS student_id,
    s.first_name,
    s.last_name,
    s.photo_url,
    s.branch_id,
    b.name AS branch_name,
    s.coach_id,
    c.first_name AS coach_first_name,
    c.last_name AS coach_last_name,
    l.rating::int4,
    (l.rating - COALESCE(p.rating, l.rating))::int4 AS delta
FROM latest l
INNER JOIN students s ON s.id = l.student_id
LEFT JOIN branches b ON b.id = s.branch_id
LEFT JOIN coaches c ON c.id = s.coach_id
LEFT JOIN previous p ON p.student_id = l.student_id
WHERE l.rating > 0
  AND COALESCE(s.status, 'active') <> 'left'
ORDER BY l.rating DESC;
$function$;
