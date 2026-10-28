#!/usr/bin/env python3
"""
Real-Postgres tests for migration 098 (3rd razryad and higher may register for
League A regardless of rating).

Reuses the throwaway-cluster harness and stub schema from
tests/test_tournament_weekly_cap_db.py, loads migration 098, and exercises the
RPC:

  * 3rd / 2nd / 1st / kms rated below 800 -> League A allowed
  * 3rd razryad with no rating at all -> League A allowed
  * 3rd razryad rated 750 -> League B still razryad_too_high (092 unchanged)
  * 'none' / '4th' / NULL razryad rated 750 -> League A still ineligible
  * 3rd razryad rated 300 -> League C still allowed; rated 750 -> C ineligible
  * rated 900, no razryad -> League A allowed (normal rating path)
  * weekly cap still applies to the razryad pass
  * guests rated below 800 -> League A still ineligible

Run: python3 tests/test_league_a_razryad_db.py   (needs psycopg2 + PG bins)
Exits 0 with a SKIP line when Postgres binaries are not installed.
"""

import os
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_tournament_weekly_cap_db import MIG, STUB_SCHEMA, extract_fn, free_port, pg_bin  # noqa: E402

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

    tmp = tempfile.mkdtemp(prefix='leaguea-pg-')
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
    conn = psycopg2.connect(f'host=127.0.0.1 port={port} user=postgres dbname=postgres')
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(STUB_SCHEMA)
    cur.execute(extract_fn(os.path.join(MIG, '038_student_league_events.sql'), 'calc_league_from_rating'))
    cur.execute(extract_fn(os.path.join(MIG, '039_tournament_results.sql'), 'razryad_rank'))
    cur.execute(open(os.path.join(MIG, '098_league_a_razryad_pass.sql')).read())

    def q1(sql, args=()):
        cur.execute(sql, args)
        return cur.fetchone()[0]

    def student(razryad, rating):
        sid = q1("INSERT INTO students(first_name, razryad, current_level) VALUES ('S', %s, 3) RETURNING id",
                 (razryad,))
        if rating is not None:
            cur.execute("INSERT INTO student_current_ratings VALUES (%s, %s)", (sid, rating))
        return sid

    # Each tournament sits in its own week so the weekly cap never interferes
    # unless a test wants it to.
    week = [0]

    def tourn(league):
        week[0] += 1
        return q1("INSERT INTO tournaments(name, tournament_date, start_time, league) "
                  "VALUES (%s, DATE '2026-11-02' + %s * 7, '14:00', %s) RETURNING id",
                  (f'{league} #{week[0]}', week[0], league))

    def reg(tid, sid):
        return q1("SELECT register_for_tournament(p_tournament_id := %s, p_student_id := %s)", (tid, sid))

    print('\n3rd razryad and higher -> League A regardless of rating')
    for razryad, rating in [('3rd', 750), ('3rd', 372), ('3rd', 800), ('2nd', 600), ('1st', 450), ('kms', 100)]:
        r = reg(tourn('A'), student(razryad, rating))
        check(r['ok'] is True, f'{razryad} rated {rating} -> League A ok')
    r = reg(tourn('A'), student('3rd', None))
    check(r['ok'] is True, '3rd with no rating -> League A ok')
    r = reg(tourn('A'), student('3', 700))
    check(r['ok'] is True, "legacy '3' razryad rated 700 -> League A ok")

    print('\nLeague B gate (092) unchanged')
    r = reg(tourn('B'), student('3rd', 750))
    check(r['ok'] is False and r['reason'] == 'razryad_too_high', '3rd rated 750 -> League B razryad_too_high')

    print('\nbelow 3rd razryad still needs the rating')
    for razryad in ['none', '4th', None]:
        r = reg(tourn('A'), student(razryad, 750))
        check(r['ok'] is False and r['reason'] == 'ineligible', f'{razryad!r} rated 750 -> League A ineligible')
    r = reg(tourn('A'), student(None, None))
    check(r['ok'] is False and r['reason'] == 'ineligible', 'no razryad, no rating -> League A ineligible')
    r = reg(tourn('A'), student('none', 900))
    check(r['ok'] is True, 'no razryad rated 900 -> League A ok (rating path)')

    print('\npass is League A only')
    r = reg(tourn('C'), student('3rd', 300))
    check(r['ok'] is True, '3rd rated 300 -> League C ok (rating maps to C)')
    r = reg(tourn('C'), student('3rd', 750))
    check(r['ok'] is False and r['reason'] == 'ineligible', '3rd rated 750 -> League C ineligible')

    print('\nweekly cap (094) still applies')
    s = student('3rd', 600)
    a1 = q1("INSERT INTO tournaments(name, tournament_date, start_time, league) "
            "VALUES ('A sat', '2027-03-06', '14:00', 'A') RETURNING id")
    a2 = q1("INSERT INTO tournaments(name, tournament_date, start_time, league) "
            "VALUES ('A sun', '2027-03-07', '14:00', 'A') RETURNING id")
    check(reg(a1, s)['ok'] is True, 'first League A of the week ok')
    check(reg(a2, s)['reason'] == 'weekly_limit', 'second League A same week -> weekly_limit')

    print('\nguests unaffected')
    r = q1("SELECT register_for_tournament(p_tournament_id := %s, p_guest_first_name := 'G', "
           "p_guest_last_name := 'Uest', p_guest_rating := 700, p_guest_age := 12, "
           "p_guest_phone := '+77010000000')", (tourn('A'),))
    check(r['ok'] is False and r['reason'] == 'ineligible', 'guest rated 700 -> League A ineligible')

    print(f'\n{passed} passed, {failed} failed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
