import requests
import os
import json
from datetime import datetime, timezone
import xml.etree.ElementTree as ET
from PIL import Image
import sys
from pathlib import Path
import shutil
import re
from bs4 import BeautifulSoup

# Set stdout encoding to UTF-8
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# URL of the RSS feed (loaded from GitHub Actions Secret or local env var)
url = os.environ.get('LETTERBOXD_RSS_URL', '').strip()

# Set up paths using pathlib for cross-platform compatibility
script_dir = Path(__file__).parent
base_dir = script_dir.parent
data_dir = base_dir / 'data'
images_dir = base_dir / 'assets' / 'images'
thumbs_dir = images_dir / 'thumbs'
fulls_dir = images_dir / 'fulls'

# Ensure directories exist
data_dir.mkdir(parents=True, exist_ok=True)
images_dir.mkdir(parents=True, exist_ok=True)
thumbs_dir.mkdir(parents=True, exist_ok=True)
fulls_dir.mkdir(parents=True, exist_ok=True)

# Function to download images
def download_image(url, path):
    try:
        response = requests.get(url)
        response.raise_for_status()
        
        # Ensure path is a Path object
        path = Path(path)
        
        # Write the image data
        path.write_bytes(response.content)
        print(f'Successfully downloaded image to {path}')
        return True
    except Exception as e:
        print(f'Failed to download image {url}: {e}')
        return False

# Function to sanitize filenames
def sanitize_filename(title):
    # Remove "contains spoilers" from the title
    title = title.replace('(contains spoilers)', '').strip()
    title = title.replace('contains spoilers', '').strip()
    
    # Remove special characters and convert to lowercase
    sanitized = title.lower()
    # Replace spaces with hyphens
    sanitized = sanitized.replace(' ', '-')
    # Remove any other special characters except hyphens and alphanumeric
    sanitized = ''.join(c for c in sanitized if c.isalnum() or c == '-')
    # Replace multiple hyphens with single hyphen
    while '--' in sanitized:
        sanitized = sanitized.replace('--', '-')
    # Remove leading/trailing hyphens
    sanitized = sanitized.strip('-')
    # Remove any ½ characters that might appear in ratings
    sanitized = sanitized.replace('½', '')
    return sanitized

# Function to create a thumbnail from a full-size image
def create_thumbnail(full_image_path, thumb_image_path, size=(600, 900)):  # 2:3 aspect ratio with higher resolution
    try:
        # Ensure paths are Path objects
        full_image_path = Path(full_image_path)
        thumb_image_path = Path(thumb_image_path)
        
        # Open the image
        with Image.open(full_image_path) as img:
            # Convert to RGB if necessary
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            
            # Calculate aspect ratio
            aspect = img.width / img.height
            target_aspect = 2/3  # Movie poster ratio
            
            # Determine crop box
            if aspect > target_aspect:  # Image is too wide
                new_width = int(img.height * target_aspect)
                left = (img.width - new_width) // 2
                crop_box = (left, 0, left + new_width, img.height)
            else:  # Image is too tall
                new_height = int(img.width / target_aspect)
                top = (img.height - new_height) // 2
                crop_box = (0, top, img.width, top + new_height)
            
            # Crop and resize
            img = img.crop(crop_box)
            img = img.resize(size, Image.Resampling.LANCZOS)
            
            # Save with high quality
            img.save(thumb_image_path, 'JPEG', quality=95)
        
        print(f'Created thumbnail: {thumb_image_path}')
        return True
    except Exception as e:
        print(f'Failed to create thumbnail: {e}')
        return False

def clean_image_directories():
    """Clean the fulls and thumbs image directories before downloading new images."""
    try:
        # Define paths
        fulls_dir = images_dir / 'fulls'
        thumb_dir = images_dir / 'thumbs'
        
        # Remove and recreate full directory
        if fulls_dir.exists():
            shutil.rmtree(fulls_dir)
        fulls_dir.mkdir(exist_ok=True)
        
        # Remove and recreate thumbs directory
        if thumb_dir.exists():
            shutil.rmtree(thumb_dir)
        thumb_dir.mkdir(exist_ok=True)
        
        print("Successfully cleaned image directories")
    except Exception as e:
        print(f"Error cleaning image directories: {e}")

# Function to clean description content
def clean_description(description):
    """
    Clean the description content by:
    1. Removing <img> tags
    2. Removing non-renderable HTML
    3. Removing empty paragraph tags
    4. Trimming whitespace
    5. Ensuring cleaned content appears below article content
    
    Args:
        description (str): The HTML description content from the RSS feed
        
    Returns:
        str: Cleaned HTML description
    """
    try:
        # If the description is CDATA wrapped, extract the content
        if description.startswith('<![CDATA[') and description.endswith(']]>'):
            description = description[9:-3]
        
        # Decode HTML entities if they exist
        if '&lt;' in description:
            from html import unescape
            description = unescape(description)
        
        # Use BeautifulSoup to parse the HTML
        soup = BeautifulSoup(description, 'html.parser')
        
        # Find and remove all img tags
        for img in soup.find_all('img'):
            img.decompose()
        
        # Remove empty paragraph tags
        for p in soup.find_all('p'):
            if not p.get_text(strip=True):  # If paragraph is empty or contains only whitespace
                p.decompose()
        
        # Keep only renderable HTML elements (p, br, a, ul, ol, li, etc.)
        # This is a whitelist approach to ensure only safe elements remain
        allowed_tags = ['p', 'br', 'a', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'span', 'div']
        for tag in soup.find_all():
            if tag.name not in allowed_tags:
                # Replace with its text content
                tag.replace_with(soup.new_string(tag.get_text()))
        
        # Get the cleaned HTML as a string and trim whitespace
        cleaned_html = str(soup).strip()
        
        # If the result is completely empty, return an empty paragraph
        if not cleaned_html or cleaned_html == "":
            return "<p>No content available</p>"
            
        return cleaned_html
    except Exception as e:
        print(f"Error cleaning description: {e}")
        return description  # Return original if cleaning fails

# Fetch the RSS feed
def download_rss():
    if not url:
        print('Error: LETTERBOXD_RSS_URL environment variable is not set.', file=sys.stderr)
        sys.exit(1)

    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        print('Successfully fetched RSS feed in memory')
        
        # Parse the XML directly in memory (do not write raw XML to disk)
        tree = ET.fromstring(response.content)
        
        # Create a dictionary to store cleaned descriptions
        cleaned_descriptions = {}
        
        # Find all items
        for item in tree.findall('.//item'):
            try:
                # Extract description and title
                description_elem = item.find('description')
                description = description_elem.text
                title = item.find('title').text
                
                # Find image URL using more robust parsing
                img_match = re.search(r'src="([^"]+)"', description)
                if img_match:
                    img_url = img_match.group(1)
                    
                    # Get base filename
                    base_filename = sanitize_filename(title)
                    
                    # Check if this is a list entry (contains "letterboxd-list-")
                    if "letterboxd-list-" in img_url:
                        img_url = img_url
                    else:
                        # For movie entries, get the highest resolution possible
                        img_url = img_url.replace('-0-150-', '-0-2000-')
                        img_url = img_url.replace('-0-230-', '-0-2000-')
                        img_url = img_url.replace('-0-500-', '-0-2000-')
                        img_url = img_url.replace('-0-1000-', '-0-2000-')
                    
                    # Define paths for full and thumb images
                    base_filename = base_filename.rstrip('-')
                    full_path = fulls_dir / f'{base_filename}_full.jpg'
                    thumb_path = thumbs_dir / f'{base_filename}_thumb.jpg'
                    
                    # Download and create thumbnail only if they don't exist
                    if not full_path.exists():
                        if download_image(img_url, str(full_path)):
                            if not thumb_path.exists():
                                create_thumbnail(str(full_path), str(thumb_path))
                    elif not thumb_path.exists():
                        create_thumbnail(str(full_path), str(thumb_path))
                
                # Clean the description content
                cleaned_description = clean_description(description)
                
                # Store the cleaned description with the item's ID
                item_id = item.find('guid').text
                cleaned_descriptions[item_id] = cleaned_description
                    
            except Exception as e:
                print(f'Error processing item: {e}')
                continue

        # Merge into accumulating privacy-safe archive.json and archive.js
        update_archive_json(tree, cleaned_descriptions)
                
    except requests.RequestException as e:
        print(f'Failed to fetch RSS feed: {e}', file=sys.stderr)
        sys.exit(1)
    except ET.ParseError as e:
        print(f'Failed to parse RSS feed: {e}', file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f'Unexpected error: {e}', file=sys.stderr)
        sys.exit(1)


def strip_identifying_links(html_text):
    """Remove any links or references pointing to the Letterboxd user profile."""
    if not html_text:
        return ''
    soup = BeautifulSoup(html_text, 'html.parser')
    for a in soup.find_all('a'):
        href = (a.get('href') or '').lower()
        if 'letterboxd.com' in href:
            # Replace profile/list/letterboxd links with plain text so visitors stay on this site
            a.replace_with(a.get_text())
    return str(soup).strip()


def make_url_slug(title, year=None):
    base = f"{title}-{year}" if year else title
    slug = re.sub(r'[^\w\s-]', '', base.lower())
    slug = re.sub(r'[-\s]+', '-', slug).strip('-')
    return slug or 'entry'


def get_ns_text(item, local_name):
    for child in item:
        tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
        if tag == local_name and child.text:
            return child.text.strip()
    return ''


def update_archive_json(tree, cleaned_descriptions=None):
    """Merge RSS items into an accumulating, privacy-safe data/archive.json."""
    archive_path = data_dir / 'archive.json'
    existing_films = {}
    existing_lists = {}

    if archive_path.exists():
        try:
            old = json.loads(archive_path.read_text(encoding='utf-8'))
            for f in old.get('films', []):
                if f.get('id'):
                    existing_films[f['id']] = f
            for l in old.get('lists', []):
                if l.get('id'):
                    existing_lists[l['id']] = l
        except Exception as e:
            print(f'Warning: could not read existing archive.json: {e}')

    used_slugs = {f.get('slug') for f in existing_films.values() if f.get('slug')}

    items = tree.findall('.//item')
    for idx, item in enumerate(items):
        raw_title = (item.findtext('title') or '').strip()
        guid = (item.findtext('guid') or f'item-{idx}').strip()
        pub_date = (item.findtext('pubDate') or '').strip()

        if cleaned_descriptions and guid in cleaned_descriptions:
            desc_html = cleaned_descriptions[guid]
        else:
            desc_html = clean_description(item.findtext('description') or '')

        desc_html = strip_identifying_links(desc_html)
        plain_text = BeautifulSoup(desc_html, 'html.parser').get_text(' ', strip=True)

        if 'letterboxd-list-' in guid:
            slug = existing_lists.get(guid, {}).get('slug') or make_url_slug(raw_title)
            existing_lists[guid] = {
                'id': guid,
                'slug': slug,
                'title': raw_title,
                'pubDate': pub_date,
                'descriptionHtml': desc_html,
                'plainText': plain_text
            }
            continue

        film_title = get_ns_text(item, 'filmTitle') or re.sub(r',\s*\d{4}.*$', '', raw_title).strip()
        year_str = get_ns_text(item, 'filmYear')
        film_year = int(year_str) if year_str.isdigit() else None
        watched_date = get_ns_text(item, 'watchedDate')
        rating_str = get_ns_text(item, 'memberRating')
        try:
            rating = float(rating_str) if rating_str else None
        except ValueError:
            rating = None
        liked = get_ns_text(item, 'memberLike').lower() == 'yes'
        rewatch = get_ns_text(item, 'rewatch').lower() == 'yes'

        has_spoilers = (
            'contains spoilers' in raw_title.lower()
            or 'this review may contain spoilers' in plain_text.lower()
        )
        # Strip Letterboxd's redundant spoiler notice paragraph if present
        if has_spoilers:
            soup = BeautifulSoup(desc_html, 'html.parser')
            for p in soup.find_all('p'):
                if 'this review may contain spoilers' in p.get_text(' ', strip=True).lower():
                    p.decompose()
            desc_html = str(soup).strip()
            plain_text = BeautifulSoup(desc_html, 'html.parser').get_text(' ', strip=True)

        is_review = (
            'letterboxd-review-' in guid
            or (len(plain_text) > 65 and not re.match(r'^Watched on\s', plain_text, re.I))
        )

        img_base = sanitize_filename(raw_title).rstrip('-')
        slug = existing_films.get(guid, {}).get('slug')
        if not slug:
            candidate = make_url_slug(film_title, film_year)
            slug = candidate
            n = 2
            while slug in used_slugs:
                slug = f'{candidate}-{n}'
                n += 1
            used_slugs.add(slug)

        # Parse pubDate timestamp for reliable chronological sorting
        pub_ts = 0
        if pub_date:
            try:
                from email.utils import parsedate_to_datetime
                pub_ts = int(parsedate_to_datetime(pub_date).timestamp())
            except Exception:
                pub_ts = 0

        existing_films[guid] = {
            'id': guid,
            'slug': slug,
            'title': film_title,
            'year': film_year,
            'watchedDate': watched_date,
            'pubTimestamp': pub_ts,
            'rating': rating,
            'liked': liked,
            'rewatch': rewatch,
            'isReview': is_review,
            'hasSpoilers': has_spoilers,
            'descriptionHtml': desc_html,
            'plainText': plain_text,
            'thumb': f'assets/images/thumbs/{img_base}_thumb.jpg',
            'full': f'assets/images/fulls/{img_base}_full.jpg'
        }

    films_sorted = sorted(
        existing_films.values(),
        key=lambda f: (f.get('watchedDate') or '', f.get('pubTimestamp') or 0),
        reverse=True
    )
    lists_sorted = list(existing_lists.values())

    archive_data = {
        'updatedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'films': films_sorted,
        'lists': lists_sorted
    }

    json_str = json.dumps(archive_data, indent=2, ensure_ascii=False)
    archive_path.write_text(json_str, encoding='utf-8')

    # Also write JS wrapper so index.html works seamlessly even when opened locally via file://
    archive_js_path = data_dir / 'archive.js'
    archive_js_path.write_text(f'window.__DIARY_DATA__ = {json_str};\n', encoding='utf-8')
    print(f'Successfully updated {archive_path} and {archive_js_path} ({len(films_sorted)} films, {len(lists_sorted)} lists)')


if __name__ == '__main__':
    if '--build-archive-only' in sys.argv:
        cleaned_rss_path = data_dir / 'cleaned_rss.xml'
        tree = ET.parse(cleaned_rss_path).getroot()
        update_archive_json(tree)
    else:
        download_rss()
