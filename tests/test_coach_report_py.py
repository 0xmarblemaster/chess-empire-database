#!/usr/bin/env python3
"""
scripts/coach_report.py: fake analytics-coaches payload → xlsx + summary.

  * month report: the 5 sheets (Ranking, Per-coach detail, Cohort churn,
    Tournaments, Data notes), ranking order, Data notes carry the PRD limits
  * week report: no Cohort churn sheet, no cohort_matrix call
  * summary: school headline, top 3, bottom 3, movers; Russian names as stored
  * CLI: missing env → exit 2; stdout is {"xlsx", "summary"} JSON (fetch stubbed)

Run: python3 tests/test_coach_report_py.py
"""

import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('coach_report', os.path.join(ROOT, 'scripts', 'coach_report.py'))
cr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cr)

from openpyxl import load_workbook  # noqa: E402

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


def coach(i, name, rank, score, small=False):
    share = {'count': 2, 'pct': 20.0}
    return {
        'coach_id': f'00000000-0000-4000-8000-00000000000{i}', 'coach_name': name, 'rank': rank, 'score': score,
        'small_sample': small, 'active_students': 10, 'new_students': 2, 'left': 1, 'frozen_30d': 1, 'churn': 2,
        'net_growth': 1,
        'retention': {'n': 30, 'events': 5, 'left_censored': 3, 'mean_months': 5.1, 'median_months': 4.2,
                      'km_survival_3m': 0.9, 'km_survival_6m': 0.8},
        'razryad_snapshot': {k: share for k in ('none', '4th', '3rd', '2nd', '1st', 'other')},
        'razryad_changes': {'promotions': 2, 'downgrades': 0, 'promotions_by_razryad': {'4th': 2},
                            'downgrades_by_razryad': {}},
        'participation': {'period': {b: share for b in ('0', '1', '2', '3', '4+')},
                          'lifetime': {b: share for b in ('0', '1', '2', '3', '4+')}},
        'podiums': {'participants': 6, 'students': 2, 'finishes': 3, 'pct_of_participants': 33.3,
                    'by_kind': {'league_c': 2, 'league_b': 1, 'razryad_4': 0, 'razryad_3': 0, 'rated': 0}},
        'sub_scores': {}, 'ranks': {m: rank for m in cr.METRICS},
    }


NAMES = ['Анна Иванова', 'Борис Петров', 'Вера Смирнова', 'Глеб Орлов', 'Дина Ким', 'Егор Ли', 'Жанна Ахметова']


def payload(period):
    coaches = [coach(i + 1, n, i + 1, round(90 - i * 7.5, 1), small=(i == 6)) for i, n in enumerate(NAMES)]
    coaches.append(dict(coach(8, 'Зоя Новая', None, 50.0), rank=None))  # unranked
    win = {'month': ('2026-10-01', '2026-10-31', '2026-09-01', '2026-09-30'),
           'week': ('2026-10-26', '2026-11-01', '2026-10-19', '2026-10-25')}[period]
    school = dict(coach(9, 'School total', None, None), coach_id=None, active_students=731, new_students=25,
                  left=10, frozen_30d=40, churn=50, net_growth=15)
    unattributed = dict(coach(0, 'Unattributed', None, None), coach_id=None)
    return {
        'report': {
            'period': {'period': period, 'start_date': win[0], 'end_date': win[1]},
            'previous_period': {'period': period, 'start_date': win[2], 'end_date': win[3]},
            'generated_at': '2026-11-01T04:00:00Z',
            'weights': {'retention': 30, 'net_growth': 20, 'razryad_promotions': 20,
                        'tournament_participation': 15, 'podiums': 15},
            'coaches': coaches, 'unattributed': unattributed, 'school': school,
            'previous': {'coaches': [{'coach_id': c['coach_id'], 'coach_name': c['coach_name'],
                                      'score': 60.0, 'rank': 4} for c in coaches[:3]], 'school': None},
            'movers': {
                'up': [{'coach_name': 'Анна Иванова', 'score': 90.0, 'previous_score': 60.0, 'score_delta': 30.0,
                        'rank': 1, 'previous_rank': 4, 'rank_delta': 3}],
                'down': [{'coach_name': 'Вера Смирнова', 'score': 45.0, 'previous_score': 60.0, 'score_delta': -15.0,
                          'rank': 3, 'previous_rank': 1, 'rank_delta': -2}],
            },
        },
        'cohort': None if period == 'week' else {
            'coach_id': None, 'max_months': 2,
            'rows': [{'start_month': '2025-11', 'cohort_size': 400, 'left_censored': True,
                      'left_pct': [1.0, 2.5, 4.0], 'churn_pct': [2.0, 5.0, 9.0]},
                     {'start_month': '2026-09', 'cohort_size': 30, 'left_censored': False,
                      'left_pct': [0.0, 3.3], 'churn_pct': [0.0, 6.7]}],
            'by_level_at_leaving': [{'level': '2', 'left': 5, 'churn': 9}],
            'by_razryad_at_leaving': [{'razryad': 'none', 'left': 5, 'churn': 9}],
        },
    }


with tempfile.TemporaryDirectory() as tmp:
    print('\nmonth report')
    out = cr.write_report(payload('month'), tmp)
    check(os.path.basename(out['xlsx']) == 'coach-report-month-2026-10-01.xlsx', 'xlsx named coach-report-<period>-<start>')
    check(os.path.basename(out['summary']) == 'coach-report-month-2026-10-01-summary.txt', 'summary file name')
    wb = load_workbook(out['xlsx'])
    check(wb.sheetnames == ['Ranking', 'Per-coach detail', 'Cohort churn', 'Tournaments', 'Data notes'],
          f'5 sheets in order ({wb.sheetnames})')
    ranking = [r for r in wb['Ranking'].iter_rows(min_row=2, values_only=True)]
    check([r[1] for r in ranking[:7]] == NAMES, 'Ranking lists coaches in rank order (Cyrillic names as stored)')
    check(ranking[0][0] == 1 and ranking[0][2] == 90.0 and ranking[0][10] == 90.0, 'rank, score, survival 3m %')
    check(ranking[0][15] == 4 and ranking[0][16] == 30.0, 'previous rank + score Δ')
    check([r[1] for r in ranking[-2:]] == ['Unattributed', 'School total'], 'Unattributed + School total rows at the end')
    cohort = [r for r in wb['Cohort churn'].iter_rows(values_only=True)]
    check(cohort[0][:5] == ('Start month', 'Cohort size', 'Start ≤ Dec 2025', 'M0', 'M1'), 'cohort header M0..')
    check(any(r[0] == '2025-11' and r[2] == 'yes' and r[3] == 1.0 for r in cohort), 'cohort row with left-censored flag')
    check(any(r[0] == 'Level 2' for r in cohort), 'exits by level at leaving')
    tourn = [r for r in wb['Tournaments'].iter_rows(values_only=True)]
    check('Lifetime: 4+ tournaments' in tourn[0] and 'Podiums rated' in tourn[0], 'tournament buckets + podium kinds')
    notes = ' '.join(str(c) for r in wb['Data notes'].iter_rows(values_only=True) for c in r if c)
    check(all(n in notes for n in cr.DATA_NOTES), 'Data notes state every PRD data limit')
    check('yearly 2026 report is partial' in notes and 'lower bound' in notes and 'weekly cohort matrix' in notes,
          'data limits: partial 2026, retention lower bound, weekly cohort')

    summary = open(out['summary'], encoding='utf-8').read()
    print('\nsummary')
    check(summary.startswith('Coach report — month 2026-10-01 … 2026-10-31'), 'header with period')
    check('active 731' in summary and 'churn 50' in summary and 'net +15' in summary, 'school headline numbers')
    top = summary.split('Top 3:')[1].split('Bottom 3:')[0]
    bottom = summary.split('Bottom 3:')[1].split('Movers')[0]
    check(all(n in top for n in NAMES[:3]) and NAMES[3] not in top, 'top 3')
    check(all(n in bottom for n in NAMES[-3:]) and NAMES[0] not in bottom, 'bottom 3')
    check('(small sample)' in bottom, 'small sample flagged')
    check('Зоя Новая' not in summary, 'unranked coach not in top / bottom')
    check('▲ Анна Иванова +30.0 (rank 4 → 1)' in summary and '▼ Вера Смирнова -15.0' in summary, 'movers')
    check(len(summary) < 4096, 'fits one Telegram message')

    print('\nweek report')
    out = cr.write_report(payload('week'), tmp)
    check(load_workbook(out['xlsx']).sheetnames == ['Ranking', 'Per-coach detail', 'Tournaments', 'Data notes'],
          'weekly: no Cohort churn sheet')

    print('\nCLI')
    calls = []
    cr.fetch = lambda base, key, params: calls.append(params) or (payload('week')['report'])
    os.environ.pop('CE_SERVICE_KEY', None)
    with contextlib.redirect_stderr(io.StringIO()):
        check(cr.main(['--period', 'week', '--out', tmp]) == 2, 'missing CE_SERVICE_KEY → exit 2')
    os.environ['CE_SERVICE_KEY'] = 'test-key'
    os.environ['CE_SUPABASE_URL'] = 'https://example.invalid'
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = cr.main(['--period', 'week', '--date', '2026-10-28', '--out', tmp])
    res = json.loads(buf.getvalue())
    check(rc == 0 and set(res) == {'xlsx', 'summary'} and os.path.exists(res['xlsx']), 'stdout JSON with both paths')
    check(calls == [{'action': 'report', 'period': 'week', 'date': '2026-10-28'}], 'week: report only, date passed')
    calls.clear()
    with contextlib.redirect_stdout(io.StringIO()):
        cr.main(['--period', 'month', '--out', tmp])
    check([c['action'] for c in calls] == ['report', 'cohort_matrix'] and 'date' not in calls[0],
          'month: report + cohort_matrix; no --date → server default')

print(f'\n  passed: {passed}\n  failed: {failed}')
sys.exit(1 if failed else 0)
