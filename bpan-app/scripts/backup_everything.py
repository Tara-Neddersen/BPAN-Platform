#!/usr/bin/env python3
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple


def now_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def request_json(
    method: str,
    url: str,
    key: str,
    body: Optional[dict] = None,
    extra_headers: Optional[Dict[str, str]] = None,
) -> dict | list:
    data = None
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw) if raw else {}


def request_bytes(method: str, url: str, key: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
        },
        method=method,
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def fetch_openapi(base_url: str, key: str) -> dict:
    url = f"{base_url}/rest/v1/"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/openapi+json",
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def list_public_tables(openapi: dict) -> List[str]:
    tables = []
    paths = openapi.get("paths", {})
    for p in paths.keys():
        # table paths look like "/table_name"
        if re.fullmatch(r"/[A-Za-z0-9_]+", p):
            tables.append(p[1:])
    return sorted(set(tables))


def fetch_table_rows(base_url: str, key: str, table: str, page_size: int = 1000) -> List[dict]:
    rows: List[dict] = []
    start = 0
    while True:
        end = start + page_size - 1
        url = f"{base_url}/rest/v1/{urllib.parse.quote(table)}?select=*"
        req = urllib.request.Request(
            url,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Accept": "application/json",
                "Range-Unit": "items",
                "Range": f"{start}-{end}",
            },
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            batch = json.loads(resp.read().decode("utf-8"))
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    return rows


def write_ndjson(path: Path, rows: List[dict]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def resolve_user_id(base_url: str, key: str, email: str) -> Optional[str]:
    enc_email = urllib.parse.quote(email)
    url = f"{base_url}/rest/v1/profiles?select=id,email&email=eq.{enc_email}"
    data = request_json("GET", url, key)
    if isinstance(data, list) and data:
        return data[0].get("id")
    return None


def fetch_auth_user(base_url: str, key: str, email: str) -> Optional[dict]:
    # Admin endpoint may paginate; first pass tries page 1 with larger per_page.
    page = 1
    while page <= 10:
        url = f"{base_url}/auth/v1/admin/users?page={page}&per_page=200"
        try:
            data = request_json("GET", url, key)
        except urllib.error.HTTPError:
            return None
        users = data.get("users", []) if isinstance(data, dict) else []
        for u in users:
            if (u.get("email") or "").lower() == email.lower():
                return u
        if not users or len(users) < 200:
            break
        page += 1
    return None


def list_buckets(base_url: str, key: str) -> List[dict]:
    url = f"{base_url}/storage/v1/bucket"
    data = request_json("GET", url, key)
    return data if isinstance(data, list) else []


def list_objects(base_url: str, key: str, bucket: str, prefix: str = "") -> List[dict]:
    # Supabase list API returns objects for a prefix.
    url = f"{base_url}/storage/v1/object/list/{urllib.parse.quote(bucket)}"
    data = request_json(
        "POST",
        url,
        key,
        body={"prefix": prefix, "limit": 1000, "offset": 0, "sortBy": {"column": "name", "order": "asc"}},
    )
    return data if isinstance(data, list) else []


def download_object(base_url: str, key: str, bucket: str, object_name: str) -> bytes:
    # Public/object endpoint works with service key authorization.
    name = urllib.parse.quote(object_name, safe="/")
    url = f"{base_url}/storage/v1/object/{urllib.parse.quote(bucket)}/{name}"
    return request_bytes("GET", url, key)


def main() -> int:
    base_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    target_email = os.environ.get("TARGET_EMAIL", "").strip()
    backup_root = Path(os.environ.get("BACKUP_ROOT", str(Path.cwd() / "backups")))

    if not base_url or not service_key:
        print("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 1
    if not target_email:
        print("Missing TARGET_EMAIL (e.g. ntahoura@stanford.edu)", file=sys.stderr)
        return 1

    stamp = now_stamp()
    out_dir = backup_root / f"full_api_backup_{stamp}"
    public_dir = out_dir / "public_tables"
    storage_dir = out_dir / "storage"
    account_dir = out_dir / "account"
    meta_dir = out_dir / "meta"

    for d in (out_dir, public_dir, storage_dir, account_dir, meta_dir):
        ensure_dir(d)

    print(f"Backup dir: {out_dir}")

    # 1) OpenAPI and table discovery
    openapi = fetch_openapi(base_url, service_key)
    (meta_dir / "openapi.json").write_text(json.dumps(openapi, indent=2), encoding="utf-8")
    tables = list_public_tables(openapi)
    (meta_dir / "public_tables.json").write_text(json.dumps(tables, indent=2), encoding="utf-8")
    print(f"Discovered {len(tables)} public tables")

    # 2) Export all public table data
    summary: List[Tuple[str, int]] = []
    for t in tables:
        try:
            rows = fetch_table_rows(base_url, service_key, t)
            write_ndjson(public_dir / f"{t}.ndjson", rows)
            summary.append((t, len(rows)))
            print(f"  - {t}: {len(rows)} rows")
        except Exception as e:
            print(f"  - {t}: ERROR ({e})")
            (public_dir / f"{t}.error.txt").write_text(str(e), encoding="utf-8")

    # 3) Resolve and export target account details
    user_id = resolve_user_id(base_url, service_key, target_email)
    account_meta = {"target_email": target_email, "resolved_user_id": user_id}
    (account_dir / "account_meta.json").write_text(json.dumps(account_meta, indent=2), encoding="utf-8")
    if user_id:
        print(f"Resolved user id: {user_id}")
        # Export account rows by scanning exported rows for common ownership columns.
        account_index: Dict[str, int] = {}
        ownership_cols = {"user_id", "owner_user_id", "created_by", "booked_by", "author_user_id", "id"}
        for t, _ in summary:
            path = public_dir / f"{t}.ndjson"
            if not path.exists():
                continue
            matched: List[dict] = []
            with path.open("r", encoding="utf-8") as f:
                for line in f:
                    if not line.strip():
                        continue
                    row = json.loads(line)
                    for col in ownership_cols:
                        if row.get(col) == user_id:
                            matched.append(row)
                            break
            if matched:
                write_ndjson(account_dir / f"{t}.ndjson", matched)
                account_index[t] = len(matched)
        (account_dir / "account_table_counts.json").write_text(json.dumps(account_index, indent=2), encoding="utf-8")

    auth_user = fetch_auth_user(base_url, service_key, target_email)
    if auth_user:
        (account_dir / "auth_user.json").write_text(json.dumps(auth_user, indent=2), encoding="utf-8")

    # 4) Storage metadata + file download
    buckets = list_buckets(base_url, service_key)
    (storage_dir / "buckets.json").write_text(json.dumps(buckets, indent=2), encoding="utf-8")
    print(f"Buckets: {len(buckets)}")

    storage_manifest = []
    for b in buckets:
        bname = b.get("id") or b.get("name")
        if not bname:
            continue
        objs = list_objects(base_url, service_key, bname, prefix="")
        bucket_dir = storage_dir / bname
        ensure_dir(bucket_dir)
        for obj in objs:
            name = obj.get("name")
            if not name or name.endswith("/"):
                continue
            record = {"bucket": bname, "name": name, "metadata": obj}
            storage_manifest.append(record)
            target_path = bucket_dir / name
            ensure_dir(target_path.parent)
            try:
                blob = download_object(base_url, service_key, bname, name)
                target_path.write_bytes(blob)
            except Exception as e:
                (bucket_dir / f"{name}.error.txt").write_text(str(e), encoding="utf-8")
        print(f"  - storage/{bname}: {len(objs)} objects listed")
        time.sleep(0.1)

    (storage_dir / "objects_manifest.json").write_text(json.dumps(storage_manifest, indent=2), encoding="utf-8")

    # 5) Summary
    with (meta_dir / "summary.tsv").open("w", encoding="utf-8") as f:
        f.write("table\trows\n")
        for t, cnt in summary:
            f.write(f"{t}\t{cnt}\n")

    print("Backup complete.")
    print(str(out_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
