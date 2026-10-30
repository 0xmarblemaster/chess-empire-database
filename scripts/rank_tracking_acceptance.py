#!/usr/bin/env python3
"""Live acceptance checks for rank tracking (migration 099 + students-api
?action=roster / ?action=rank_history). Run ONLY after 099 is applied and
students-api is deployed.

It mutates exactly one row family: a dedicated test student named
"ZZ TEST RankTracking" (created on first run, reused afterwards). Its rank is
changed through the DB, and the student is set to status 'left' at the end
(even on failure). No real student is ever read-modified.

Checks:
  1. roster(active) total == DB count of active students; pages cover every id once
  2. roster rows carry the full field set; current_rank never null; stage_name "Ступень N"
  3. keyset (after_id) pagination returns the same ids as offset pagination
  4. roster status=all total == DB count of all students; bad params → 400
  5. a service-role rank change on the test student logs one row: source=api,
     trainer_id_at_change = its coach, attribution=event_time, changed_by_id null
  6. optional (CE_ADMIN_JWT): an admin-session rank change logs source=admin_ui
     and changed_by_id = that admin
  7. saving the same rank again logs no new row
  8. razryad_history is append-only: an UPDATE of a row is rejected
  9. rank_history date filters: window returns the change; bad from / to<=from → 400
 10. rank_history(all) total == DB count, no duplicate ids, ordered by changed_at,id,
     no legacy row left un-derived (source=trigger AND source_derived=false)

Environment (no secrets in this file):
  CE_SERVICE_KEY   service-role / sb_secret key for the Chess Empire project (required)
  CE_API_KEY       one CHESS_EMPIRE_WRITE_KEY value for students-api (required)
  CE_SUPABASE_URL  default https://papgcizhfkngubwofjuo.supabase.co
  CE_ADMIN_JWT     optional access token of an admin dashboard session (check 6)
  CE_TEST_BRANCH_ID / CE_TEST_COACH_ID  optional; default: first branch / first coach
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

URL = os.environ.get("CE_SUPABASE_URL", "https://papgcizhfkngubwofjuo.supabase.co").rstrip("/")
SERVICE_KEY = os.environ.get("CE_SERVICE_KEY", "")
API_KEY = os.environ.get("CE_API_KEY", "")
ADMIN_JWT = os.environ.get("CE_ADMIN_JWT", "")
API = f"{URL}/functions/v1/students-api"
TEST_FIRST, TEST_LAST = "ZZ TEST", "RankTracking"
RANK_FIELDS = {"rank_change_id", "student_id", "student_code", "previous_rank", "new_rank", "changed_at",
               "changed_by_id", "changed_by_name", "source", "source_derived", "trainer_id_at_change",
               "trainer_name_at_change", "trainer_attribution"}
ROSTER_FIELDS = {"student_id", "student_code", "full_name", "status", "branch_id", "branch_name", "trainer_id",
                 "trainer_name", "stage_id", "stage_name", "current_rank", "student_created_at"}
RANKS = {"none", "4th", "3rd", "2nd", "1st", "kms"}

results = []


def check(n, ok, msg):
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'} [{n}] {msg}")


def http(method, url, headers, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"content-type": "application/json", **headers})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None), dict(r.headers)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw), dict(e.headers)
        except ValueError:
            return e.code, raw, dict(e.headers)


def db_headers(token=None):
    h = {"apikey": SERVICE_KEY}
    if token:
        h["Authorization"] = f"Bearer {token}"
    elif not SERVICE_KEY.startswith("sb_secret_"):
        h["Authorization"] = f"Bearer {SERVICE_KEY}"
    return h


def rest(method, path, body=None, token=None, prefer=None):
    h = db_headers(token)
    if prefer:
        h["Prefer"] = prefer
    return http(method, f"{URL}/rest/v1/{path}", h, body)


def db_count(path):
    status, _, headers = rest("HEAD", path, prefer="count=exact")
    assert status in (200, 206), f"count {path} → {status}"
    return int(headers.get("Content-Range", "*/0").split("/")[-1])


def api(params):
    return http("GET", f"{API}?{urllib.parse.urlencode(params)}", {"x-api-key": API_KEY})


def history_for(student_id):
    s, body, _ = api({"action": "rank_history", "student_id": student_id})
    assert s == 200, f"rank_history → {s} {body}"
    return body["rank_changes"]


def current_rank(student_id):
    s, rows, _ = rest("GET", f"students?id=eq.{student_id}&select=razryad")
    assert s == 200 and rows, f"read test student rank → {s} {rows}"
    return rows[0]["razryad"] or "none"


def other_rank(student_id):
    return "4th" if current_rank(student_id) == "none" else "none"


def set_rank(student_id, rank, token=None):
    s, body, _ = rest("PATCH", f"students?id=eq.{student_id}", {"razryad": rank}, token=token, prefer="return=minimal")
    assert s in (200, 204), f"PATCH razryad → {s} {body}"


def test_student():
    q = f"students?first_name=eq.{urllib.parse.quote(TEST_FIRST)}&last_name=eq.{TEST_LAST}&select=id,coach_id,branch_id&order=created_at"
    s, rows, _ = rest("GET", q)
    assert s == 200, f"find test student → {s} {rows}"
    branch = os.environ.get("CE_TEST_BRANCH_ID") or rest("GET", "branches?select=id&order=name&limit=1")[1][0]["id"]
    coach = os.environ.get("CE_TEST_COACH_ID") or rest("GET", "coaches?select=id&order=created_at&limit=1")[1][0]["id"]
    if rows:
        sid = rows[0]["id"]
        s, body, _ = rest("PATCH", f"students?id=eq.{sid}", {"status": "active", "coach_id": coach, "branch_id": branch},
                          prefer="return=minimal")
        assert s in (200, 204), f"reactivate test student → {s} {body}"
        return sid, coach
    s, body, _ = rest("POST", "students", {"first_name": TEST_FIRST, "last_name": TEST_LAST, "status": "active",
                                           "branch_id": branch, "coach_id": coach, "razryad": "none",
                                           "current_level": 1}, prefer="return=representation")
    assert s == 201, f"create test student → {s} {body}"
    return body[0]["id"], coach


def page_all(params, mode):
    ids, offset, after = [], 0, None
    while True:
        p = {"action": "roster", "limit": 200, **params}
        if mode == "offset":
            p["offset"] = offset
        elif after:
            p["after_id"] = after
        s, body, _ = api(p)
        assert s == 200, f"roster → {s} {body}"
        ids += [r["student_id"] for r in body["students"]]
        if mode == "offset":
            if len(body["students"]) < 200:
                return ids, body
            offset += 200
        else:
            after = body["next_after_id"]
            if not after:
                return ids, body


def main():
    if not SERVICE_KEY or not API_KEY:
        sys.exit("CE_SERVICE_KEY and CE_API_KEY are required")
    sid, coach = test_student()
    try:
        # 1-4 roster
        ids, last = page_all({}, "offset")
        active = db_count("students?status=eq.active&select=id")
        check(1, last["total"] == active == len(ids) == len(set(ids)),
              f"roster active total={last['total']} db={active} paged={len(ids)} unique={len(set(ids))}")
        s, body, _ = api({"action": "roster", "status": "all", "limit": 1000})
        rows = body["students"]
        check(2, all(set(r) == ROSTER_FIELDS and r["current_rank"] in RANKS
                     and (r["stage_id"] is None or r["stage_name"] == f"Ступень {r['stage_id']}") for r in rows),
              f"{len(rows)} roster rows have the full field set, explicit rank, stage label")
        keyset, _ = page_all({}, "keyset")
        check(3, keyset == ids and keyset == sorted(keyset), "keyset pages == offset pages, ordered by id")
        bad = [api({"action": "roster", **p})[0] for p in ({"status": "x"}, {"limit": 1001}, {"after_id": "x"})]
        check(4, body["total"] == db_count("students?select=id") and bad == [400, 400, 400],
              f"roster all total={body['total']}; bad params → {bad}")

        # 5 service-role change → api
        start = history_for(sid)
        set_rank(sid, other_rank(sid))
        after = history_for(sid)
        new = after[len(start):]
        row = new[0] if len(new) == 1 else {}
        check(5, len(new) == 1 and set(row) == RANK_FIELDS and row["source"] == "api" and not row["source_derived"]
              and row["trainer_id_at_change"] == coach and row["trainer_attribution"] == "event_time"
              and row["changed_by_id"] is None, f"service-role change logged once as api/event_time: {row}")

        # 6 admin session (optional)
        if ADMIN_JWT:
            set_rank(sid, other_rank(sid), token=ADMIN_JWT)
            adm = history_for(sid)[len(after):]
            check(6, len(adm) == 1 and adm[0]["source"] == "admin_ui" and adm[0]["changed_by_id"],
                  f"admin-session change logged as admin_ui: {adm}")
        else:
            print("SKIP [6] CE_ADMIN_JWT not set (admin-UI path; or verify via the dashboard)")

        # 7 no-op save
        before = history_for(sid)
        set_rank(sid, current_rank(sid))
        check(7, len(history_for(sid)) == len(before), "same-rank save logs no row")

        # 8 append-only
        s, body, _ = rest("PATCH", f"razryad_history?id=eq.{before[-1]['rank_change_id']}", {"notes": "tamper"},
                          prefer="return=minimal")
        check(8, s >= 400 and "append-only" in json.dumps(body), f"history UPDATE rejected → {s}")

        # 9 date filters
        changed = row.get("changed_at", before[-1]["changed_at"])
        s, win, _ = api({"action": "rank_history", "student_id": sid, "from": changed, "to": "2100-01-01"})
        bad = [api({"action": "rank_history", **p})[0]
               for p in ({"from": "yesterday"}, {"from": "2026-10-26", "to": "2026-10-19"}, {"to": "2026-10-26T00:00"})]
        check(9, s == 200 and any(r["rank_change_id"] == row.get("rank_change_id") for r in win["rank_changes"])
              and bad == [400, 400, 400], f"window contains the change; bad ranges → {bad}")

        # 10 full history integrity
        allrows, offset = [], 0
        while True:
            s, body, _ = api({"action": "rank_history", "limit": 1000, "offset": offset})
            allrows += body["rank_changes"]
            if len(body["rank_changes"]) < 1000:
                break
            offset += 1000
        keys = [(r["changed_at"], r["rank_change_id"]) for r in allrows]
        rh_ids = [r["rank_change_id"] for r in allrows]
        underived = db_count("razryad_history?source=eq.trigger&source_derived=eq.false&select=id")
        check(10, body["total"] == db_count("razryad_history?select=id") == len(allrows) and len(set(rh_ids)) == len(rh_ids)
              and keys == sorted(keys) and underived == 0,
              f"history total={body['total']} rows={len(allrows)} sorted={keys == sorted(keys)} underived={underived}")
    finally:
        s, body, _ = rest("PATCH", f"students?id=eq.{sid}", {"status": "left"}, prefer="return=minimal")
        print(f"test student {sid} set to left → {s}")

    print(f"\n{sum(results)}/{len(results)} checks passed")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
