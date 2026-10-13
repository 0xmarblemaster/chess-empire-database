#!/usr/bin/env python3
"""
Real-Postgres tests for migration 094 (one tournament per student per week).

Spins up a throwaway Postgres cluster (initdb from /usr/lib/postgresql/*/bin),
creates a minimal stub of the tables register_for_tournament touches, loads the
real helper functions (calc_league_from_rating, razryad_rank) and migration 094
itself, then exercises the RPC:

  * cross-branch: second tournament in the same Mon–Sun week -> weekly_limit
  * same branch Sat + Sun -> weekly_limit
  * next week -> allowed (Sunday -> Monday boundary)
  * cancel (delete registration) frees the week
  * cancelled tournament does not count
  * p_force (admin override) bypasses the cap; NULL p_force does not
  * guests are not capped
  * concurrency: two sessions registering the same student for two different
    tournaments at the same time -> exactly one succeeds

Run: python3 tests/test_tournament_weekly_cap_db.py   (needs psycopg2 + PG bins)
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
import threading
import time

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

CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text, last_name text,
  razryad text, current_level int
);
CREATE TABLE student_current_ratings (student_id uuid PRIMARY KEY, rating int);
CREATE TABLE tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch text, name text, tournament_date date NOT NULL,
  start_time time, time_format text, league text,
  capacity int NOT NULL DEFAULT 50, status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','closed','cancelled')),
  registration_deadline timestamptz
);
CREATE TABLE tournament_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id),
  player_name text, display_name text, source text, external_contact text,
  registered_at timestamptz DEFAULT now()
);
CREATE TABLE tournament_guest_contacts (
  registration_id uuid REFERENCES tournament_registrations(id) ON DELETE CASCADE,
  first_name text, last_name text, rating int, age int, phone text, email text
);
"""


def main():
    try:
        import psycopg2  # noqa: F401
    except ImportError:
        print('SKIP: psycopg2 not installed')
        return 0
    import psycopg2

    bindir = pg_bin()
    if not bindir:
        print('SKIP: no Postgres binaries under /usr/lib/postgresql')
        return 0

    tmp = tempfile.mkdtemp(prefix='wkcap-pg-')
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


def run_tests(psycopg2, port):
    dsn = f'host=127.0.0.1 port={port} user=postgres dbname=postgres'
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(STUB_SCHEMA)
    cur.execute(extract_fn(os.path.join(MIG, '038_student_league_events.sql'), 'calc_league_from_rating'))
    cur.execute(extract_fn(os.path.join(MIG, '039_tournament_results.sql'), 'razryad_rank'))
    cur.execute(open(os.path.join(MIG, '094_tournament_weekly_cap.sql')).read())

    def q1(sql, args=()):
        cur.execute(sql, args)
        return cur.fetchone()[0]

    def student(name):
        sid = q1("INSERT INTO students(first_name, current_level) VALUES (%s, 3) RETURNING id", (name,))
        cur.execute("INSERT INTO student_current_ratings VALUES (%s, 300)", (sid,))  # League C
        return sid

    def tourn(branch, date, status='open'):
        return q1("INSERT INTO tournaments(branch, name, tournament_date, start_time, league, status) "
                  "VALUES (%s, %s, %s, '14:00', 'C', %s) RETURNING id",
                  (branch, f'C {branch} {date}', date, status))

    def reg(tid, sid, force=False, c=None):
        k = (c or conn).cursor()
        k.execute("SELECT register_for_tournament(p_tournament_id := %s, p_student_id := %s, p_force := %s)",
                  (tid, sid, force))
        return k.fetchone()[0]

    # Week of Mon 2026-10-19 .. Sun 2026-10-25
    halyk_sat = tourn('Halyk Arena', '2026-10-24')
    gagarin_sat = tourn('Gagarin Park', '2026-10-24')
    gagarin_sun = tourn('Gagarin Park', '2026-10-25')
    debut_sun = tourn('Debut', '2026-10-25')
    next_mon = tourn('Debut', '2026-10-26')
    prev_sun = tourn('Debut', '2026-10-18')
    cancelled_sat = tourn('Debut', '2026-10-24', status='cancelled')

    print('\ncross-branch')
    s = student('Cross')
    check(reg(halyk_sat, s)['ok'] is True, 'first tournament of the week succeeds')
    r = reg(gagarin_sun, s)
    check(r['ok'] is False and r['reason'] == 'weekly_limit', 'other branch same week -> weekly_limit')
    check(r.get('conflict_tournament', {}).get('id') == halyk_sat, 'conflict_tournament points at the existing registration')
    check(r.get('week_start') == '2026-10-19', 'week_start is the Monday (2026-10-19)')
    check(q1("SELECT count(*) FROM tournament_registrations WHERE student_id=%s", (s,)) == 1, 'no second row inserted')
    r = reg(halyk_sat, s)
    check(r['reason'] == 'duplicate', 'same tournament again still reports duplicate (not weekly_limit)')

    print('\nsame branch Sat + Sun')
    s = student('SatSun')
    check(reg(gagarin_sat, s)['ok'] is True, 'Saturday succeeds')
    check(reg(gagarin_sun, s)['reason'] == 'weekly_limit', 'Sunday same branch -> weekly_limit')

    print('\nweek boundaries')
    s = student('Boundary')
    check(reg(debut_sun, s)['ok'] is True, 'Sunday 2026-10-25 succeeds')
    check(reg(next_mon, s)['ok'] is True, 'Monday 2026-10-26 (next week) is allowed')
    check(reg(prev_sun, s)['ok'] is True, 'Sunday 2026-10-18 (previous week) is allowed')

    print('\ncancel frees the week')
    s = student('Cancel')
    r1 = reg(halyk_sat, s)
    check(reg(debut_sun, s)['reason'] == 'weekly_limit', 'blocked while first registration exists')
    cur.execute("DELETE FROM tournament_registrations WHERE id=%s", (r1['registration_id'],))
    check(reg(debut_sun, s)['ok'] is True, 'after cancelling, registering for another tournament works')

    print('\ncancelled tournaments do not count')
    s = student('CancelledT')
    cur.execute("INSERT INTO tournament_registrations(tournament_id, student_id, source) VALUES (%s, %s, 'web')",
                (cancelled_sat, s))
    check(reg(gagarin_sun, s)['ok'] is True, 'registration on a cancelled tournament does not block the week')

    print('\nadmin override')
    s = student('Admin')
    check(reg(halyk_sat, s)['ok'] is True, 'first tournament succeeds')
    k = conn.cursor()
    k.execute("SELECT register_for_tournament(p_tournament_id := %s, p_student_id := %s, p_force := NULL)",
              (gagarin_sun, s))
    check(k.fetchone()[0]['reason'] == 'weekly_limit', 'p_force NULL does NOT bypass the cap')
    check(reg(gagarin_sun, s, force=True)['ok'] is True, 'p_force true (admin) bypasses the cap')

    print('\nguests unaffected')
    for t in (halyk_sat, gagarin_sun):
        k.execute("SELECT register_for_tournament(p_tournament_id := %s, p_guest_first_name := 'G', "
                  "p_guest_last_name := 'Uest', p_guest_age := 10, p_guest_phone := '+77010000000', p_force := true)",
                  (t,))
        check(k.fetchone()[0]['ok'] is True, f'guest with same phone registers in a 2nd tournament same week')

    print('\nconcurrency')
    s = student('Race')
    c1 = psycopg2.connect(f'host=127.0.0.1 port={port} user=postgres dbname=postgres')
    c2 = psycopg2.connect(f'host=127.0.0.1 port={port} user=postgres dbname=postgres')
    r_a = reg(halyk_sat, s, c=c1)  # txn 1 open, holds the student's advisory lock
    out = {}

    def second():
        out['r'] = reg(debut_sun, s, c=c2)
        c2.commit()

    th = threading.Thread(target=second)
    th.start()
    time.sleep(0.5)
    check(th.is_alive(), 'second session blocks on the per-student lock while the first is uncommitted')
    c1.commit()
    th.join(5)
    check(r_a['ok'] is True, 'first concurrent registration succeeds')
    check(out.get('r', {}).get('reason') == 'weekly_limit', 'second concurrent registration -> weekly_limit')
    check(q1("SELECT count(*) FROM tournament_registrations WHERE student_id=%s", (s,)) == 1, 'exactly one row for the raced student')
    c1.close()
    c2.close()

    print(f'\n{passed} passed, {failed} failed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
