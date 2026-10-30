#!/usr/bin/env python3
"""
Real-Postgres tests for migration 101 (coach performance reports).

Spins up a throwaway Postgres cluster, creates a minimal stub of the tables the
report reads, loads razryad_rank (039) and migration 101 (twice — idempotent),
seeds a small fixture and checks coach_report / coach_cohort_matrix /
coach_at / v_status_events_dedup / v_student_start against hand-computed
expectations (Kaplan–Meier recomputed independently in Python), then runs
101_coach_reports_verify.sql and requires every check to be ok.

A second database seeds the 2026-10-14 cleanup batch and the 022 backfill
(B1 / B2), frozen-30d / non-cleanup-left additivity (S1, incl. a returner whose
last lesson falls in the batch week) and the as-of-p_end roster (S3).

Run: python3 tests/test_coach_reports_db.py   (needs psycopg2 + PG bins)
Exits 0 with a SKIP line when Postgres binaries are not installed.
"""

import glob
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIG = os.path.join(ROOT, 'supabase', 'migrations')

passed = 0
failed = 0


def check(cond, msg):
    global passed, failed
    if cond:
        passed += 1
        print(f'  ✓ {msg}')
    else:
        failed += 1
        print(f'  ✗ FAIL: {msg}')


def pg_bin():
    for d in sorted(glob.glob('/usr/lib/postgresql/*/bin'), reverse=True):
        if os.path.exists(os.path.join(d, 'initdb')):
            return d
    return None


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


def extract_fn(path, name):
    src = open(path).read()
    m = re.search(r'CREATE OR REPLACE FUNCTION ' + name + r'\(.*?\$\$ LANGUAGE plpgsql IMMUTABLE;', src, re.S)
    assert m, f'{name} not found in {path}'
    return m.group(0)


STUB_SCHEMA = """
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE coaches (id uuid PRIMARY KEY, first_name text NOT NULL, last_name text NOT NULL);
CREATE TABLE students (
  id uuid PRIMARY KEY, first_name text, last_name text,
  status text, coach_id uuid REFERENCES coaches(id) ON DELETE SET NULL,
  razryad text, current_level int, created_at timestamptz
);
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_type text, entity_id uuid, action text,
  field_name text, old_value text, new_value text, changed_at timestamptz
);
CREATE TABLE student_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid, old_status text, new_status text,
  changed_at timestamptz, changed_by uuid, changed_by_email text
);
CREATE TABLE attendance (student_id uuid, attendance_date date, status text);
CREATE TABLE razryad_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid, old_razryad text, new_razryad text,
  changed_at timestamptz, trainer_id_at_change uuid REFERENCES coaches(id) ON DELETE SET NULL
);
CREATE TYPE tournament_kind AS ENUM ('league_c', 'league_b', 'razryad_4', 'razryad_3', 'rated');
CREATE TABLE tournaments_uploads (id uuid PRIMARY KEY, kind tournament_kind, tournament_date date);
CREATE TABLE tournament_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), upload_id uuid, student_id uuid,
  rank smallint, score numeric, games_played smallint
);
"""

A = 'aaaaaaaa-0000-4000-8000-000000000001'
B = 'bbbbbbbb-0000-4000-8000-000000000002'
D = 'dddddddd-0000-4000-8000-000000000004'  # deleted coach (only in audit_log)
S = {i: f'00000000-0000-4000-8000-00000000000{i}' for i in range(1, 8)}
U1, U2, U3 = ('eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002',
              'eeeeeeee-0000-4000-8000-000000000003')
WIN = ('2026-09-01 00:00+05', '2026-10-01 00:00+05')

ALMATY = timezone(timedelta(hours=5))


def ts(s):
    return datetime.fromisoformat(s.replace(' ', 'T')).astimezone(timezone.utc)


def seed(cur):
    cur.execute("INSERT INTO coaches VALUES (%s, 'Анна', 'Иванова'), (%s, 'Борис', 'Петров')", (A, B))
    students = [
        # id, status, coach, razryad, level, created_at
        (S[1], 'active', A, '4th', 2, '2026-09-05 10:00+05'),
        (S[2], 'left', B, 'none', 3, '2026-02-20 10:00+05'),
        (S[3], 'frozen', B, '4th', 4, '2026-01-10 10:00+05'),
        (S[4], 'active', B, 'none', 2, '2026-04-01 10:00+05'),
        (S[5], 'active', A, None, 2, '2025-11-10 10:00+05'),
        (S[6], 'active', A, 'none', 1, '2026-01-15 10:00+05'),
        (S[7], 'active', B, '3rd', 5, '2026-06-01 10:00+05'),
    ]
    cur.executemany("INSERT INTO students(id, status, coach_id, razryad, current_level, created_at) "
                    "VALUES (%s,%s,%s,%s,%s,%s)", students)
    hist = [
        (S[1], None, 'active', '2026-09-05 10:00+05'),
        (S[1], None, 'active', '2026-09-05 10:01+05'),   # duplicate (dedupe)
        (S[2], 'active', 'left', '2026-09-10 10:00+05'),
        (S[2], 'active', 'left', '2026-09-10 10:02+05'),  # duplicate (dedupe)
        (S[3], 'active', 'frozen', '2026-08-15 10:00+05'),
        (S[4], 'active', 'frozen', '2026-08-20 10:00+05'),
        (S[4], 'frozen', 'active', '2026-09-16 10:00+05'),
        (S[5], None, 'active', '2026-09-02 10:00+05'),    # backfill, not new
        (S[6], 'active', 'left', '2026-05-01 10:00+05'),
        (S[6], 'left', 'active', '2026-09-05 12:00+05'),  # >60 days → new
        (S[7], 'active', 'left', '2026-08-20 10:00+05'),
        (S[7], 'left', 'active', '2026-09-10 10:00+05'),  # <60 days → not new
    ]
    cur.executemany("INSERT INTO student_status_history(student_id, old_status, new_status, changed_at) "
                    "VALUES (%s,%s,%s,%s)", hist)
    audit = [
        (S[2], 'coach_id', A, B, '2026-09-20 10:00+05'),
        (S[6], 'coach_id', D, A, '2026-09-25 10:00+05'),
        (S[2], 'current_level', '2', '3', '2026-09-15 10:00+05'),  # level 2 when leaving
    ]
    cur.executemany("INSERT INTO audit_log(entity_type, entity_id, action, field_name, old_value, new_value, changed_at) "
                    "VALUES ('students', %s, 'UPDATE', %s, %s, %s, %s)", audit)
    cur.executemany("INSERT INTO attendance VALUES (%s, %s, %s)", [
        (S[1], '2026-09-06', 'present'), (S[1], '2026-09-04', 'absent'),
        (S[2], '2026-03-01', 'present'), (S[2], '2026-03-05', 'present'),
    ])
    cur.executemany("INSERT INTO razryad_history(student_id, old_razryad, new_razryad, changed_at, trainer_id_at_change) "
                    "VALUES (%s,%s,%s,%s,%s)", [
                        (S[1], 'none', '4th', '2026-09-12 10:00+05', A),
                        (S[3], '3rd', '4th', '2026-09-13 10:00+05', B),
                        (S[7], '4th', '3rd', '2026-09-14 10:00+05', None),
                        (S[7], 'none', '4th', '2026-07-01 10:00+05', B),  # outside window
                    ])
    cur.executemany("INSERT INTO tournaments_uploads VALUES (%s,%s,%s)", [
        (U1, 'league_c', '2026-09-07'), (U2, 'razryad_4', '2026-09-14'), (U3, 'rated', '2026-06-01'),
    ])
    cur.executemany("INSERT INTO tournament_results(upload_id, student_id, rank, score, games_played) "
                    "VALUES (%s,%s,%s,%s,%s)", [
                        (U1, S[1], 1, 5, 6), (U2, S[1], 5, 4, 10), (U3, S[1], 2, 4, 5),
                        (U1, S[5], 3, 4, 6), (U2, S[5], 2, 0, 0),
                    ])


def km(samples, t):
    """Kaplan–Meier S(t) — same conventions as the SQL / JS implementations."""
    if not samples:
        return None
    s = 1.0
    for m in sorted({m for m, e in samples if e and m <= t}):
        d = sum(1 for x, e in samples if e and x == m)
        n = sum(1 for x, _ in samples if x >= m)
        s *= 1 - d / n
    if s > 0 and max(m for m, _ in samples) < t:
        return None
    return s


def months(a, b):
    return max(0.0, (b - a).total_seconds()) / 86400 / 30.4375


def setup_db(psycopg2, port, dbname):
    conn = psycopg2.connect(f'host=127.0.0.1 port={port} user=postgres dbname={dbname}')
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(STUB_SCHEMA)
    cur.execute(extract_fn(os.path.join(MIG, '039_tournament_results.sql'), 'razryad_rank'))
    mig = open(os.path.join(MIG, '101_coach_reports.sql')).read()
    cur.execute(mig)
    cur.execute(mig)
    return conn, cur


def verify_rows(cur):
    cur.execute(open(os.path.join(MIG, '101_coach_reports_verify.sql')).read().split('-- Informational')[0])
    return [r for r in cur.fetchall() if r[3] is not True]


def run_tests(psycopg2, port):
    conn, cur = setup_db(psycopg2, port, 'postgres')
    check(True, 'migration 101 applies twice (idempotent)')
    seed(cur)

    def q1(sql, args=()):
        cur.execute(sql, args)
        return cur.fetchone()[0]

    print('\nv_status_events_dedup')
    check(q1("SELECT count(*) FROM v_status_events_dedup") == 10, '12 raw events → 10 after 5-minute dedupe')
    check(q1("SELECT count(*) FROM v_status_events_dedup WHERE student_id=%s", (S[2],)) == 1,
          'duplicate active→left 2 minutes later is dropped')

    print('\ncoach_at')
    check(q1("SELECT coach_at(%s, '2026-09-10 10:00+05')", (S[2],)) == A, 'before first change → old_value')
    check(q1("SELECT coach_at(%s, '2026-09-20 10:00+05')", (S[2],)) == A, 'same instant as change → OLD coach')
    check(q1("SELECT coach_at(%s, '2026-09-21 10:00+05')", (S[2],)) == B, 'after change → new_value')
    check(q1("SELECT coach_at(%s, '2026-09-05 12:00+05')", (S[6],)) is None, 'deleted coach → NULL (Unattributed)')
    check(q1("SELECT coach_at(%s, '2026-01-01 00:00+05')", (S[5],)) == A, 'no coach_id audit rows → current coach')

    print('\nv_student_start')
    cur.execute("SELECT student_id::text, start_date::text, start_source, left_censored FROM v_student_start")
    start = {r[0]: r[1:] for r in cur.fetchall()}
    check(start[S[1]] == ('2026-09-06', 'attendance', False), 'first present attendance wins over created_at')
    check(start[S[3]] == ('2026-01-10', 'created_at', False), 'no attendance → created_at')
    check(start[S[5]] == ('2025-11-10', 'created_at', True), 'start ≤ 2025-12-31 → left_censored')

    print('\ncoach_report (September 2026)')
    rep = q1("SELECT coach_report(%s, %s)", WIN)
    rows = {r['coach_id']: r for r in rep['coaches']}
    a, b, un, sch = rows[A], rows[B], rows[None], rep['school']
    check(a['coach_name'] == 'Анна Иванова' and un['coach_name'] == 'Unattributed', 'names + Unattributed row')
    check(rep['coaches'][-1]['coach_id'] is None, 'Unattributed row listed last')
    check((a['new_students'], un['new_students'], b['new_students'], sch['new_students']) == (1, 1, 0, 2),
          'new: created→active (A) and left→active after 60d with deleted coach (Unattributed); backfill / <60d excluded')
    check((a['left'], b['left'], sch['left']) == (1, 0, 1), 'left credited to coach at the event (A, not current B)')
    check((b['frozen_30d'], sch['frozen_30d']) == (1, 1), 'frozen 30+ (not reactivated) counted; reactivated freeze not')
    check((a['churn'], b['churn'], sch['churn']) == (1, 1, 2), 'churn = left + frozen_30d')
    check(a['net_growth'] == 0 and un['net_growth'] == 1, 'net_growth = new − left')
    check((a['active_students'], b['active_students'], sch['active_students']) == (3, 2, 5), 'active roster sizes')
    check(a['small_sample'] is True, 'small_sample when < 10 active')
    check(a['razryad_snapshot']['4th'] == {'count': 1, 'pct': 33.3} and a['razryad_snapshot']['none']['count'] == 2,
          'razryad snapshot counts + % (NULL razryad → none)')
    rc = sch['razryad_changes']
    check((rc['promotions'], rc['downgrades']) == (2, 1), 'school promotions / downgrades in window')
    check(a['razryad_changes']['promotions_by_razryad'] == {'4th': 1}
          and b['razryad_changes']['downgrades_by_razryad'] == {'4th': 1}
          and un['razryad_changes']['promotions_by_razryad'] == {'3rd': 1},
          'razryad changes credited to trainer_id_at_change (NULL → Unattributed)')
    pp, pl = a['participation']['period'], a['participation']['lifetime']
    check([pp[k]['count'] for k in ('0', '1', '2', '3', '4+')] == [1, 1, 1, 0, 0],
          'period participation buckets (games_played = 0 ignored)')
    check([pl[k]['count'] for k in ('0', '1', '2', '3', '4+')] == [1, 1, 0, 1, 0], 'lifetime participation buckets')
    po = a['podiums']
    check((po['participants'], po['students'], po['finishes'], po['pct_of_participants']) == (2, 2, 2, 100),
          'podiums: distinct students, finishes, % of participants')
    check(po['by_kind']['league_c'] == 2 and po['by_kind']['rated'] == 0, 'podiums by kind (in window only)')

    # retention, recomputed independently
    asof = ts(WIN[1])
    st = lambda d: datetime.fromisoformat(d).replace(tzinfo=ALMATY)  # noqa: E731
    samples = [
        (months(st('2026-09-06'), asof), False),
        (months(st('2026-03-01'), ts('2026-09-10 10:00+05')), True),
        (months(st('2026-01-10'), asof), False),
        (months(st('2026-04-01'), asof), False),
        (months(st('2025-11-10'), asof), False),
        (months(st('2026-01-15'), ts('2026-05-01 10:00+05')), True),
        (months(st('2026-06-01'), ts('2026-08-20 10:00+05')), True),
    ]
    rt = sch['retention']
    check((rt['n'], rt['events'], rt['left_censored']) == (7, 3, 1), 'retention n / events / left_censored')
    check(abs(float(rt['mean_months']) - sum(m for m, _ in samples) / 7) < 0.01, 'mean months')
    check(abs(float(rt['km_survival_3m']) - km(samples, 3)) < 1e-4, f"KM S(3m) = {km(samples, 3):.4f}")
    check(abs(float(rt['km_survival_6m']) - km(samples, 6)) < 1e-4, f"KM S(6m) = {km(samples, 6):.4f}")

    try:
        q1("SELECT coach_report(%s, %s)", (WIN[1], WIN[0]))
        check(False, 'p_start >= p_end raises')
    except psycopg2.Error:
        check(True, 'p_start >= p_end raises')

    print('\ncoach_cohort_matrix')
    cm = q1("SELECT coach_cohort_matrix()")
    by = {r['start_month']: r for r in cm['rows']}
    check(by['2026-06']['cohort_size'] == 1 and by['2026-06']['left_pct'][:3] == [0, 0, 100],
          'June cohort: left in month 2 → cumulative 0, 0, 100')
    check(by['2025-11']['left_censored'] is True, 'Nov 2025 cohort flagged left_censored')
    check(by['2026-01']['churn_pct'][-1] == 100, 'Jan cohort: left + frozen 30+ → 100% churn')
    lv = {r['level']: r for r in cm['by_level_at_leaving']}
    check(lv['2']['left'] >= 1, 'level at leaving taken from audit_log (S2 was level 2)')
    cm_a = q1("SELECT coach_cohort_matrix(%s)", (A,))
    check(sum(r['cohort_size'] for r in cm_a['rows']) == 3, 'per-coach matrix uses coach at start (S1, S2 before transfer, S5)')

    print('\naccess')
    for fn in ('coach_report(timestamptz,timestamptz)', 'coach_cohort_matrix(uuid)', 'coach_at(uuid,timestamptz)'):
        check(not q1("SELECT has_function_privilege('anon', %s, 'EXECUTE')", (fn,))
              and not q1("SELECT has_function_privilege('authenticated', %s, 'EXECUTE')", (fn,))
              and q1("SELECT has_function_privilege('service_role', %s, 'EXECUTE')", (fn,)),
              f'{fn}: service_role only')
    check(not q1("SELECT has_table_privilege('anon', 'v_status_events_dedup', 'SELECT')"), 'views not readable by anon')

    print('\nverify script')
    bad = verify_rows(cur)
    check(not bad, f'101_coach_reports_verify.sql: all checks ok {bad or ""}')

    cur.execute('CREATE DATABASE cleanup_fx')
    conn.close()
    run_cleanup_tests(psycopg2, port)
    print(f'\n  passed: {passed}\n  failed: {failed}')
    return 1 if failed else 0


# ---------------------------------------------------------------- B1 / B2 / S1 / S3 fixture
C = {k: f'cccccccc-0000-4000-8000-0000000000{i:02d}' for i, k in enumerate(
    ['L1', 'L2', 'R1', 'R2', 'R3', 'RL', 'RL2', 'F1', 'F2', 'F3', 'BF1', 'BF2', 'T1', 'T2', 'T3', 'R4'],
    start=1)}
ADMIN = '99999999-0000-4000-8000-000000000009'
WAVE1, WAVE2 = '2026-10-14 16:10+00', '2026-10-14 16:50+00'  # cleanup batch, logged twice
BACKFILL_AT = '2026-02-04 10:00+00'


def seed_cleanup(cur):
    cur.execute("INSERT INTO coaches VALUES (%s, 'Анна', 'Иванова'), (%s, 'Борис', 'Петров')", (A, B))
    apr = '2026-04-01 10:00+05'
    students = [  # key, status, coach, created_at, razryad
        ('L1', 'frozen', B, '2026-03-01 10:00+05', None),   # dated cleanup leaver (last lesson 09-20, coach A then)
        ('L2', 'frozen', B, '2026-09-01 10:00+05', None),   # undated cleanup leaver (never attended)
        ('R1', 'active', A, apr, None),                     # returned: →active 10-20
        ('R2', 'frozen', A, apr, None),                     # returned: lesson 10-22, status still frozen
        ('R3', 'active', A, apr, None),                     # returned: →active 10-25
        ('RL', 'frozen', B, apr, None),                     # already left 08-20, batch row left→frozen
        ('RL2', 'frozen', B, apr, None),                    # left 08-20 after last lesson 08-10, →active 08-25, batch
        ('F1', 'frozen', A, apr, None),                     # frozen 09-20 → 30d on 10-20
        ('F2', 'active', A, apr, None),                     # frozen 09-25, active 10-10 (broken before 30d)
        ('F3', 'active', A, apr, None),                     # frozen 08-25 → 30d 09-24, active 09-28 (counts in Sep)
        ('BF1', 'left', B, '2025-06-01 10:00+05', None),    # 022 backfill null→left
        ('BF2', 'frozen', B, '2025-06-01 10:00+05', None),  # 022 backfill null→frozen
        ('T1', 'active', B, apr, '4th'),                    # coach A→B 10-05, razryad none→4th 10-06
        ('T2', 'left', A, apr, None),                       # active→left 10-10
        ('T3', 'active', A, '2026-10-05 10:00+05', None),   # created in October
        ('R4', 'active', A, apr, None),                     # last lesson 10-12 (week 10-08), →active 10-22
    ]
    cur.executemany("INSERT INTO students(id, status, coach_id, created_at, razryad) VALUES (%s,%s,%s,%s,%s)",
                    [(C[k], st, co, cr, rz) for k, st, co, cr, rz in students])
    hist = [(C[k], None, 'active', cr, ADMIN, 'admin@x') for k, st, co, cr, rz in students if not k.startswith('BF')]
    hist += [
        (C['BF1'], None, 'left', BACKFILL_AT, None, 'system@chessempire.kz'),
        (C['BF2'], None, 'frozen', BACKFILL_AT, None, 'system@chessempire.kz'),
        (C['RL'], 'active', 'left', '2026-08-20 10:00+05', ADMIN, 'admin@x'),
        (C['RL2'], 'active', 'left', '2026-08-20 10:00+05', ADMIN, 'admin@x'),
        (C['RL2'], 'left', 'active', '2026-08-25 10:00+05', ADMIN, 'admin@x'),
        (C['F1'], 'active', 'frozen', '2026-09-20 10:00+05', ADMIN, 'admin@x'),
        (C['F2'], 'active', 'frozen', '2026-09-25 10:00+05', ADMIN, 'admin@x'),
        (C['F2'], 'frozen', 'active', '2026-10-10 10:00+05', ADMIN, 'admin@x'),
        (C['F3'], 'active', 'frozen', '2026-08-25 10:00+05', ADMIN, 'admin@x'),
        (C['F3'], 'frozen', 'active', '2026-09-28 10:00+05', ADMIN, 'admin@x'),
        (C['T2'], 'active', 'left', '2026-10-10 10:00+05', ADMIN, 'admin@x'),
        (C['R1'], 'frozen', 'active', '2026-10-20 10:00+05', ADMIN, 'admin@x'),
        (C['R3'], 'frozen', 'active', '2026-10-25 10:00+05', ADMIN, 'admin@x'),
        (C['R4'], 'frozen', 'active', '2026-10-22 10:00+05', ADMIN, 'admin@x'),
    ]
    for k in ('L1', 'L2', 'R1', 'R2', 'R3', 'R4', 'RL2'):  # both waves, > 5 min apart (survive the dedupe)
        hist += [(C[k], 'active', 'frozen', WAVE1, None, None), (C[k], 'active', 'frozen', WAVE2, None, 'system@chessempire.kz')]
    hist.append((C['RL'], 'left', 'frozen', WAVE1, None, None))
    cur.executemany("INSERT INTO student_status_history(student_id, old_status, new_status, changed_at, changed_by, "
                    "changed_by_email) VALUES (%s,%s,%s,%s,%s,%s)", hist)
    cur.executemany("INSERT INTO audit_log(entity_type, entity_id, action, field_name, old_value, new_value, changed_at) "
                    "VALUES ('students', %s, 'UPDATE', %s, %s, %s, %s)", [
                        (C['L1'], 'coach_id', A, B, '2026-10-01 10:00+05'),
                        (C['T1'], 'coach_id', A, B, '2026-10-05 10:00+05'),
                        (C['T1'], 'razryad', 'none', '4th', '2026-10-06 10:00+05'),
                    ])
    cur.executemany("INSERT INTO attendance VALUES (%s, %s, 'present')", [
        (C['L1'], '2026-09-05'), (C['L1'], '2026-09-20'), (C['R1'], '2026-09-10'), (C['R2'], '2026-09-12'),
        (C['R2'], '2026-10-22'), (C['R3'], '2026-09-15'), (C['RL'], '2026-08-10'), (C['RL2'], '2026-08-10'),
        (C['R4'], '2026-08-12'), (C['R4'], '2026-10-12'),
    ])


def run_cleanup_tests(psycopg2, port):
    conn, cur = setup_db(psycopg2, port, 'cleanup_fx')
    seed_cleanup(cur)

    def q1(sql, args=()):
        cur.execute(sql, args)
        return cur.fetchone()[0]

    def rep(s, e):
        return q1("SELECT coach_report(%s, %s)", (s, e))

    def by(r):
        return {x['coach_id']: x for x in r['coaches']}

    def month(m, y=2026):
        nm, ny = (1, y + 1) if m == 12 else (m + 1, y)
        return f'{y}-{m:02d}-01 00:00+05', f'{ny}-{nm:02d}-01 00:00+05'

    print('\nB1 cleanup batch classification (as of now)')
    cur.execute("SELECT student_id::text, outcome, leave_date::text FROM coach_report_cleanup(now())")
    cls = {r[0]: r[1:] for r in cur.fetchall()}
    inv = {v: k for k, v in C.items()}
    got = {inv[k]: v for k, v in cls.items()}
    check(set(got) == {'L1', 'L2', 'R1', 'R2', 'R3', 'R4', 'RL', 'RL2'},
          'batch = distinct students of both waves (8, not 15 rows)')
    check(got['L1'] == ('dated', '2026-09-20'), 'still frozen, no later lesson → dated at last present lesson')
    check(got['L2'][0] == 'undated', 'never attended → undated')
    check(got['R1'][0] == got['R2'][0] == got['R3'][0] == got['R4'][0] == 'returned', 'later →active or later lesson → returned')
    check(got['RL'][0] == 'real_left' and got['RL2'][0] == 'real_left',
          'real →left before the batch (status left / after last lesson) overrides the lesson date')

    sep, octo = rep(*month(9)), rep(*month(10))
    sa, oa = by(sep), by(octo)
    check((sa[A]['left'], sa[B]['left'], sep['school']['left']) == (1, 0, 1),
          'Sep: dated leaver counted as left on 09-20, credited to coach then (A, not current B)')
    check(rep(*month(8))['school']['left'] == 2, 'Aug: real lefts counted once each (RL, RL2) — no synthetic double')
    check(octo['school']['left'] == 1 and oa[A]['left'] == 1, 'Oct: only the real →left (T2); batch is not a departure')
    day14 = rep('2026-10-14 00:00+05', '2026-10-15 00:00+05')['school']
    nov13 = rep('2026-11-13 00:00+05', '2026-11-14 00:00+05')['school']
    check((day14['left'], day14['frozen_30d'], nov13['left'], nov13['frozen_30d']) == (0, 0, 0, 0),
          'nothing lands on 2026-10-14 or 2026-11-13 (batch + 30 days)')
    cf = octo['data_notes']['cleanup_freeze']
    check(cf['label'] == 'cleanup_freeze_2026_10_14' and cf['batch_students'] == 8 and cf['returned'] == 4
          and cf['real_left'] == 2, 'data_notes.cleanup_freeze: label, batch students, returned, real_left')
    d = cf['cleanup_leavers_dated']
    check(d['total'] == 1 and d['in_window'] == 0 and d['by_coach'] == [
        {'coach_id': A, 'coach_name': 'Анна Иванова', 'total': 1, 'in_window': 0}], 'dated leavers per coach (Oct)')
    check(sep['data_notes']['cleanup_freeze']['cleanup_leavers_dated']['in_window'] == 1, 'Sep: dated leaver in window')
    u = cf['cleanup_leavers_undated']
    check(u['total'] == 1 and u['by_coach'] == [{'coach_id': B, 'coach_name': 'Борис Петров', 'total': 1}],
          'undated leavers per coach at batch time (data_notes only)')

    print('\nB1 as of p_end')
    wk = rep('2026-10-12 00:00+05', '2026-10-19 00:00+05')
    wd = wk['data_notes']['cleanup_freeze']
    check(wd['cleanup_leavers_dated']['total'] == 5 and wd['returned'] == 0,
          'week ending 10-19: R1–R4 had not returned yet → dated leavers as of p_end')
    check(by(wk)[A]['active_students'] == 3 and wk['school']['active_students'] == 4,
          'week ending 10-19: roster as of p_end (dated leavers gone, transfers by coach_at)')

    print('\nB2 022 backfill')
    rt = octo['school']['retention']
    check(octo['data_notes']['excluded_pre_history_leavers'] == 1, 'backfill →left → excluded_pre_history_leavers')
    check((rt['n'], rt['events']) == (14, 4),
          'retention excludes backfill leaver + undated leaver; events = L1 (lesson date), RL, RL2, T2')
    check(rep(*month(2))['school']['left'] == 0, 'Feb: backfill →left is not a departure')
    check(rep(*month(3))['school']['frozen_30d'] == 0, 'Mar: backfill →frozen is not a freeze spell (no fake 30+)')

    print('\nS1 frozen_30d / non-cleanup left additivity')
    check(sep['school']['frozen_30d'] == 1 and octo['school']['frozen_30d'] == 1,
          'Sep: 30th day 09-24 counts even though the spell ended 09-28; Oct: F1 (30th day 10-20)')
    q3 = rep('2026-07-01 00:00+05', '2026-10-01 00:00+05')['school']
    check(q3['frozen_30d'] == sum(rep(*month(m))['school']['frozen_30d'] for m in (7, 8, 9)) == 1
          and q3['left'] == sum(rep(*month(m))['school']['left'] for m in (7, 8, 9)) == 3,
          'Jul + Aug + Sep = Q3 (frozen_30d, left)')
    q4 = rep('2026-10-01 00:00+05', '2027-01-01 00:00+05')['school']
    check(q4['frozen_30d'] == sum(rep(*month(m))['school']['frozen_30d'] for m in (10, 11, 12)),
          'Oct + Nov + Dec = Q4 (frozen_30d)')
    weeks = [rep(f'2026-10-{d:02d} 00:00+05', f'2026-10-{d + 7:02d} 00:00+05' if d + 7 <= 31 else '2026-11-01 00:00+05')
             for d in (1, 8, 15, 22, 29)]
    check(sum(w['school']['frozen_30d'] for w in weeks) == octo['school']['frozen_30d'],
          'weeks inside October sum to October (frozen_30d)')

    def non_cleanup_left(r):
        return r['school']['left'] - r['data_notes']['cleanup_freeze']['cleanup_leavers_dated']['in_window']

    wk2 = weeks[1]
    check(wk2['school']['left'] == 2 and by(wk2)[A]['left'] == 2
          and wk2['data_notes']['cleanup_freeze']['cleanup_leavers_dated']['in_window'] == 1,
          'week 10-08 (contains the batch, judged as of 10-15): T2 + R4 left on 10-12 — R4 returned only on 10-22')
    check(sum(w['school']['left'] for w in weeks) == octo['school']['left'] + 1,
          'Σ weeks left = October + 1: cleanup left is judged per window end, not additive (intended)')
    check(sum(non_cleanup_left(w) for w in weeks) == non_cleanup_left(octo) == 1,
          'non-cleanup left (left − cleanup in_window) stays additive: Σ weeks = October')
    check(sum(non_cleanup_left(rep(*month(m))) for m in (10, 11, 12))
          == non_cleanup_left(rep('2026-10-01 00:00+05', '2027-01-01 00:00+05')),
          'Oct + Nov + Dec = Q4 (non-cleanup left)')

    print('\nS3 roster as of p_end')
    check((sa[A]['active_students'], sa[B]['active_students'], sep['school']['active_students']) == (7, 2, 9),
          'Sep (p_end 10-01): roster reconstructed — T1 still with A, T2 still active, dated leaver L1 gone')
    check((oa[A]['active_students'], oa[B]['active_students']) == (6, 1), 'Oct (running): live roster')
    check(sa[A]['razryad_snapshot']['4th']['count'] == 0 and oa[B]['razryad_snapshot']['4th']['count'] == 1,
          'razryad snapshot as of p_end (T1 4th only from 10-06)')

    print('\ncohort matrix (B1 / B2)')
    cm = q1("SELECT coach_cohort_matrix()")
    rows = {r['start_month']: r for r in cm['rows']}
    check(rows['2026-09']['cohort_size'] == 4 and rows['2026-09']['left_pct'][0] == 25.0,
          'Sep cohort: L1 left in month 0; returned R1–R3 not leavers')
    check(cm['excluded_pre_history_leavers'] == 1 and cm['cleanup_leavers_undated'] == 1,
          'backfill leaver + undated leaver excluded and counted')
    allm = q1("SELECT coach_cohort_matrix_all()")
    ca = {c['coach_id']: c for c in allm['coaches']}
    check(allm['school'] == cm | {'generated_at': allm['school']['generated_at']}, 'all: school block = coach_cohort_matrix()')
    check(ca[A]['coach_name'] == 'Анна Иванова' and ca[A]['rows'] == q1("SELECT coach_cohort_matrix(%s)", (A,))['rows'],
          'all: per-coach block = coach_cohort_matrix(coach)')

    print('\nverify script (cleanup fixture)')
    bad = verify_rows(cur)
    check(not bad, f'101_coach_reports_verify.sql: all checks ok {bad or ""}')
    conn.close()


def main():
    try:
        import psycopg2
    except ImportError:
        print('SKIP: psycopg2 not installed')
        return 0
    bindir = pg_bin()
    if not bindir:
        print('SKIP: no Postgres binaries under /usr/lib/postgresql')
        return 0

    tmp = tempfile.mkdtemp(prefix='coachrep-pg-')
    datadir = os.path.join(tmp, 'data')
    as_root = os.geteuid() == 0
    prefix = ['runuser', '-u', 'postgres', '--'] if as_root else []
    if as_root:
        shutil.chown(tmp, 'postgres')
    port = free_port()
    subprocess.run(prefix + [f'{bindir}/initdb', '-D', datadir, '-U', 'postgres', '-A', 'trust'],
                   check=True, stdout=subprocess.DEVNULL)
    subprocess.run(prefix + [f'{bindir}/pg_ctl', '-D', datadir, '-o', f'-p {port} -k {tmp} -c listen_addresses=127.0.0.1',
                             '-l', os.path.join(tmp, 'log'), '-w', 'start'],
                   check=True, stdout=subprocess.DEVNULL)
    try:
        return run_tests(psycopg2, port)
    finally:
        subprocess.run(prefix + [f'{bindir}/pg_ctl', '-D', datadir, '-m', 'immediate', 'stop'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
