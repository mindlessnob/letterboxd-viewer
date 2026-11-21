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
    # Decompose accents and strip diacritics
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
    Strict matcher: ONLY accepts an exact normalized title (or original_title) match
    with release year matching exactly (preferred) or within +-1 year (festival/regional offset).
    Never accepts partial or fuzzy title matches.
    """
    target_norm = norm_title(target_title)
    if not target_norm:
        return None

    exact_year_candidates = []
    near_year_candidates = []

    for r in results:
        poster_path = r.get('poster_path')
        if not poster_path:
            continue

        t1 = norm_title(r.get('name' if is_tv else 'title') or '')
        t2 = norm_title(r.get('original_name' if is_tv else 'original_title') or '')
        if target_norm != t1 and target_norm != t2:
            continue

        ry = extract_year(r.get('first_air_date' if is_tv else 'release_date') or '')
        pop = float(r.get('popularity') or 0.0)

        if target_year is None:
            exact_year_candidates.append((pop, poster_path))
        elif ry == target_year:
            exact_year_candidates.append((pop, poster_path))
        elif ry is not None and abs(ry - target_year) == 1:
            near_year_candidates.append((pop, poster_path))

    if exact_year_candidates:
        exact_year_candidates.sort(key=lambda x: x[0], reverse=True)
        return exact_year_candidates[0][1]

    if near_year_candidates:
        near_year_candidates.sort(key=lambda x: x[0], reverse=True)
        return near_year_candidates[0][1]

    return None


def tmdb_get(session, endpoint, params, headers):
    for attempt in range(4):
        try:
            resp = session.get(f'https://api.themoviedb.org/3/{endpoint}', params=params, headers=headers, timeout=15)
            if resp.status_code == 429:
                wait = float(resp.headers.get('Retry-After', '1.5'))
                time.sleep(wait + 0.25)
                continue
            if resp.status_code == 200:
                return resp.json().get('results', [])
            return []
        except requests.RequestException:
            time.sleep(0.5 * (attempt + 1))
    return []


def lookup_poster(session, title, year, api_key):
    is_bearer = api_key.startswith('eyJ')
    headers = {'Authorization': f'Bearer {api_key}'} if is_bearer else {}
    base_params = {} if is_bearer else {'api_key': api_key}

    # 1. Search movies WITH year filter first (fast & precise)
    if year:
        params = {**base_params, 'query': title, 'year': year, 'include_adult': 'true'}
        results = tmdb_get(session, 'search/movie', params, headers)
        poster = pick_strict_match(results, title, year, is_tv=False)
        if poster:
            return poster

    # 2. Search movies WITHOUT year filter (catches +-1 year festival vs theatrical release dates)
    params = {**base_params, 'query': title, 'include_adult': 'true'}
    results = tmdb_get(session, 'search/movie', params, headers)
    poster = pick_strict_match(results, title, year, is_tv=False)
    if poster:
        return poster

    # 3. Fallback: check limited series / miniseries on TV with exact same strict rule
    results = tmdb_get(session, 'search/tv', params, headers)
    poster = pick_strict_match(results, title, year, is_tv=True)
    if poster:
        return poster

    return None


def main():
    api_key = load_tmdb_key()
    if not api_key:
        print('Error: TMDB_API_KEY not found in environment or .env', file=sys.stderr)
        sys.exit(1)

    data = json.loads(ARCHIVE_JSON.read_text(encoding='utf-8'))
    films = data.get('films', [])

    # Collect unique (title, year) pairs missing posters
    missing_keys = []
    seen = set()
    for f in films:
        if f.get('thumb'):
            continue
        k = (f.get('title', '').strip(), f.get('year'))
        if k[0] and k not in seen:
            seen.add(k)
            missing_keys.append(k)

    print(f'Unique (title, year) pairs needing posters: {len(missing_keys)}')
    if not missing_keys:
        print('Nothing to backfill!')
        return

    found_map = {}
    session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(pool_connections=16, pool_maxsize=16)
    session.mount('https://', adapter)

    done = 0
    matched = 0
    t0 = time.time()

    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(lookup_poster, session, t, y, api_key): (t, y) for t, y in missing_keys}
        for fut in as_completed(futures):
            k = futures[fut]
            done += 1
            try:
                poster_path = fut.result()
                if poster_path:
                    found_map[k] = poster_path
                    matched += 1
            except Exception:
                pass
            if done % 250 == 0 or done == len(missing_keys):
                elapsed = time.time() - t0
                print(f'Progress: {done}/{len(missing_keys)} checked | {matched} strict matches ({elapsed:.1f}s)')

    updated_entries = 0
    for f in films:
        if f.get('thumb'):
            continue
        k = (f.get('title', '').strip(), f.get('year'))
        poster_path = found_map.get(k)
        if poster_path:
            f['thumb'] = f'https://image.tmdb.org/t/p/w500{poster_path}'
            f['full'] = f'https://image.tmdb.org/t/p/w780{poster_path}'
            updated_entries += 1

    json_str = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    ARCHIVE_JSON.write_text(json_str, encoding='utf-8')
    ARCHIVE_JS.write_text(f'window.__DIARY_DATA__={json_str};\n', encoding='utf-8')

    total_with_posters = sum(1 for f in films if f.get('thumb'))
    print(f'Done! Updated {updated_entries} entries. Total films with posters: {total_with_posters}/{len(films)} ({total_with_posters*100/len(films):.1f}%)')


if __name__ == '__main__':
    main()
