import json
import os
import re
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import requests

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = Path(__file__).parent.parent
ARCHIVE_JSON = BASE_DIR / 'data' / 'archive.json'
ARCHIVE_JS = BASE_DIR / 'data' / 'archive.js'
ENV_PATH = BASE_DIR / '.env'


def load_tmdb_key():
    key = os.environ.get('TMDB_API_KEY', '').strip()
    if key:
        return key
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            if k.strip() == 'TMDB_API_KEY':
                return v.strip().strip('"').strip("'")
    return ''


def norm_title(s):
    if not s:
        return ''
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower().replace('&', ' and ')
    s = re.sub(r'[^a-z0-9]+', ' ', s).strip()
    return s


def extract_year(date_str):
    if not date_str or len(date_str) < 4:
        return None
    y = date_str[:4]
    return int(y) if y.isdigit() else None


def pick_strict_match(results, target_title, target_year, is_tv=False):
    """
    Strict matcher: ONLY accepts exact normalized title/original_title + exact year (preferred)
    or +-1 year. Returns (tmdb_id, poster_path) or None.
    """
    target_norm = norm_title(target_title)
    if not target_norm:
        return None

    exact_year = []
    near_year = []

    for r in results:
        t1 = norm_title(r.get('name' if is_tv else 'title') or '')
        t2 = norm_title(r.get('original_name' if is_tv else 'original_title') or '')
        if target_norm != t1 and target_norm != t2:
            continue

        ry = extract_year(r.get('first_air_date' if is_tv else 'release_date') or '')
        pop = float(r.get('popularity') or 0.0)
        entry = (pop, r.get('id'), r.get('poster_path') or '')

        if target_year is None or ry == target_year:
            exact_year.append(entry)
        elif ry is not None and abs(ry - target_year) == 1:
            near_year.append(entry)

    if exact_year:
        exact_year.sort(key=lambda x: x[0], reverse=True)
        return exact_year[0][1], exact_year[0][2]
    if near_year:
        near_year.sort(key=lambda x: x[0], reverse=True)
        return near_year[0][1], near_year[0][2]
    return None


def tmdb_get_json(session, endpoint, params, headers):
    for attempt in range(4):
        try:
            resp = session.get(f'https://api.themoviedb.org/3/{endpoint}', params=params, headers=headers, timeout=15)
            if resp.status_code == 429:
                wait = float(resp.headers.get('Retry-After', '1.5'))
                time.sleep(wait + 0.25)
                continue
            if resp.status_code == 200:
                return resp.json()
            return {}
        except requests.RequestException:
            time.sleep(0.5 * (attempt + 1))
    return {}


def fetch_director(session, tmdb_id, is_tv, base_params, headers):
    if not tmdb_id:
        return ''
    if is_tv:
        details = tmdb_get_json(session, f'tv/{tmdb_id}', base_params, headers)
        creators = [c.get('name', '').strip() for c in details.get('created_by', []) if c.get('name')]
        if creators:
            return ', '.join(creators[:2])
        credits = tmdb_get_json(session, f'tv/{tmdb_id}/credits', base_params, headers)
        dirs = [c.get('name', '').strip() for c in credits.get('crew', []) if c.get('job') == 'Director' and c.get('name')]
        return ', '.join(dict.fromkeys(dirs[:2]))
    else:
        credits = tmdb_get_json(session, f'movie/{tmdb_id}/credits', base_params, headers)
        dirs = [c.get('name', '').strip() for c in credits.get('crew', []) if c.get('job') == 'Director' and c.get('name')]
        return ', '.join(dict.fromkeys(dirs[:2]))


def lookup_metadata(session, title, year, api_key):
    is_bearer = api_key.startswith('eyJ')
    headers = {'Authorization': f'Bearer {api_key}'} if is_bearer else {}
    base_params = {} if is_bearer else {'api_key': api_key}

    match = None
    is_tv = False

    if year:
        res = tmdb_get_json(session, 'search/movie', {**base_params, 'query': title, 'year': year, 'include_adult': 'true'}, headers).get('results', [])
        match = pick_strict_match(res, title, year, is_tv=False)

    if not match:
        res = tmdb_get_json(session, 'search/movie', {**base_params, 'query': title, 'include_adult': 'true'}, headers).get('results', [])
        match = pick_strict_match(res, title, year, is_tv=False)

    if not match:
        res = tmdb_get_json(session, 'search/tv', {**base_params, 'query': title, 'include_adult': 'true'}, headers).get('results', [])
        match = pick_strict_match(res, title, year, is_tv=True)
        if match:
            is_tv = True

    if not match:
        return '', ''

    tmdb_id, poster_path = match
    director = fetch_director(session, tmdb_id, is_tv, base_params, headers)
    return poster_path, director


def main():
    api_key = load_tmdb_key()
    if not api_key:
        print('Error: TMDB_API_KEY not found in environment or .env', file=sys.stderr)
        sys.exit(1)

    data = json.loads(ARCHIVE_JSON.read_text(encoding='utf-8'))
    films = data.get('films', [])

    missing_keys = []
    seen = set()
    for f in films:
        if f.get('thumb') and f.get('director'):
            continue
        k = (f.get('title', '').strip(), f.get('year'))
        if k[0] and k not in seen:
            seen.add(k)
            missing_keys.append(k)

    print(f'Unique (title, year) pairs needing director/poster: {len(missing_keys)}')
    if not missing_keys:
        print('All entries already have posters & directors!')
        return

    found_map = {}
    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(pool_connections=16, pool_maxsize=16)
    session.mount('https://', adapter)

    done = 0
    matched_dirs = 0
    t0 = time.time()

    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(lookup_metadata, session, t, y, api_key): (t, y) for t, y in missing_keys}
        for fut in as_completed(futures):
            k = futures[fut]
            done += 1
            try:
                poster_path, director = fut.result()
                if poster_path or director:
                    found_map[k] = (poster_path, director)
                    if director:
                        matched_dirs += 1
            except Exception:
                pass
            if done % 300 == 0 or done == len(missing_keys):
                elapsed = time.time() - t0
                print(f'Progress: {done}/{len(missing_keys)} checked | {matched_dirs} directors matched ({elapsed:.1f}s)')

    updated = 0
    for f in films:
        k = (f.get('title', '').strip(), f.get('year'))
        if k not in found_map:
            continue
        poster_path, director = found_map[k]
        changed = False
        if not f.get('thumb') and poster_path:
            f['thumb'] = f'https://image.tmdb.org/t/p/w500{poster_path}'
            f['full'] = f'https://image.tmdb.org/t/p/w780{poster_path}'
            changed = True
        if not f.get('director') and director:
            f['director'] = director
            changed = True
        if changed:
            updated += 1

    json_str = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    ARCHIVE_JSON.write_text(json_str, encoding='utf-8')
    ARCHIVE_JS.write_text(f'window.__DIARY_DATA__={json_str};\n', encoding='utf-8')

    total_dirs = sum(1 for f in films if f.get('director'))
    print(f'Done! Updated {updated} entries. Total films with director: {total_dirs}/{len(films)} ({total_dirs*100/len(films):.1f}%)')


if __name__ == '__main__':
    main()
