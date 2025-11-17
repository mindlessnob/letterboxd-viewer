import requests
import os
from datetime import datetime
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

# URL of the RSS feed
url = 'https://letterboxd.com/honeypals/rss/'

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
        # Add a user-agent to look like a browser
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        response = requests.get(url, headers=headers)
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
        allowed_tags = ['p', 'br', 'a', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'span', 'div', 'blockquote']
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
    try:
        response = requests.get(url)
        response.raise_for_status()
        
        # Save the RSS feed
        rss_path = data_dir / 'rss.xml'
        with open(rss_path, 'wb') as f:
            f.write(response.content)
        print(f'Successfully downloaded RSS feed to {rss_path}')
        
        # Parse the XML
        tree = ET.fromstring(response.content)
        
        # Create a dictionary to store cleaned descriptions
        cleaned_descriptions = {}
        
        # Find all items
        for item in tree.findall('.//item'):
            title = ""
            try:
                # Extract description and title
                description_elem = item.find('description')
                description = description_elem.text
                title = item.find('title').text
                
                # --- NEW CUSTOM POSTER SCRAPING LOGIC (v3) ---
                img_url = None
                review_link_elem = item.find('link')
                review_link = review_link_elem.text if review_link_elem is not None else None

                # 1. Try to scrape the main film page for the custom poster
                if review_link and '/film/' in review_link:
                    try:
                        # Trim the diary log number (e.g., /2/) to get the main film page
                        parts = review_link.rstrip('/').split('/')
                        if parts[-1].isdigit():
                            main_film_url = '/'.join(parts[:-1]) + '/'
                        else:
                            main_film_url = review_link

                        # We only scrape if it's a film page, not a list page
                        if '/film/' in main_film_url:
                            print(f"Scraping main film page for custom poster: {main_film_url}")
                            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
                            page_response = requests.get(main_film_url, timeout=10, headers=headers)
                            page_response.raise_for_status()
                            page_soup = BeautifulSoup(page_response.content, 'html.parser')
                            
                            # --- NEW METHOD: Find the og:image meta tag ---
                            og_image_tag = page_soup.find('meta', property='og:image')
                            
                            if og_image_tag and og_image_tag.get('content'):
                                img_url = og_image_tag['content']
                                print(f"Found poster via og:image meta tag: {img_url}")
                            else:
                                print("og:image meta tag not found. Falling back to RSS feed.")
                                
                    except Exception as e:
                        print(f"Scraping failed for {review_link}: {e}. Falling back to RSS.")
                
                # 2. If scraping failed or it's not a film, fall back to the RSS description
                if not img_url:
                    print("Falling back to RSS description for image.")
                    img_match = re.search(r'src="([^"]+)"', description)
                    if img_match:
                        img_url = img_match.group(1)
                        print(f"Found poster via RSS: {img_url}")
                
                # --- NEW CHECK: If we STILL have the empty poster, skip ---
                if img_url and 'empty-poster' in img_url:
                    print(f"Found empty-poster placeholder for {title}. Skipping image download for this item.")
                    # Clean the description but skip image processing
                    item_id = item.find('guid').text
                    cleaned_descriptions[item_id] = clean_description(description)
                    continue # Skip to the next item in the loop

                # 3. If we have a GOOD img_url (scraped or RSS), process it
                if img_url:
                    # Get base filename
                    base_filename = sanitize_filename(title)
                    
                    # Check if this is a list entry
                    if "letterboxd-list-" in img_url:
                        pass # Keep original URL for list entries
                    else:
                        # For movie entries, get the highest resolution possible
                        print("Applying high-resolution replacement...")
                        # Use regex to replace any size pattern with -0-2000-
                        img_url = re.sub(r'-0-\d+-0-\d+(-crop)?', '-0-2000-0-3000-crop', img_url)
                        img_url = re.sub(r'-0-\d+-', '-0-2000-', img_url)
                        print(f"Upgraded URL: {img_url}")
                    
                    # Define paths for full and thumb images
                    base_filename = base_filename.rstrip('-')  # Remove any trailing hyphens
                    full_path = fulls_dir / f'{base_filename}_full.jpg'
                    thumb_path = thumbs_dir / f'{base_filename}_thumb.jpg'
                    
                    # Download and create thumbnail only if they don't exist
                    if not full_path.exists():
                        if download_image(img_url, str(full_path)):
                            # Only create thumbnail if download succeeded
                            if not thumb_path.exists():
                                create_thumbnail(str(full_path), str(thumb_path))
                    elif not thumb_path.exists():
                        # If full exists but thumb doesn't, recreate thumb
                        create_thumbnail(str(full_path), str(thumb_path))
                
                # --- END OF IMAGE LOGIC ---
                
                # Clean the description content
                cleaned_description = clean_description(description)
                
                # Store the cleaned description with the item's ID
                item_id = item.find('guid').text
                cleaned_descriptions[item_id] = cleaned_description
                        
            except Exception as e:
                print(f'Error processing item: {e} - Title: {title}')
                continue
        
        # Save the cleaned RSS data to a new file
        cleaned_rss_path = data_dir / 'cleaned_rss.xml'
        
        # Create a new XML string manually to ensure proper formatting
        xml_lines = ['<?xml version="1.0" encoding="utf-8"?>']
        xml_lines.append('<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org">')
        xml_lines.append('  <channel>')
        
        # Add channel metadata
        channel = tree.find('channel')
        for child in channel:
            if child.tag == 'item':
                continue
            
            # Convert element to string
            child_str = ET.tostring(child, encoding='unicode')
            xml_lines.append(f"    {child_str}")
        
        # Add items with cleaned descriptions
        for item in tree.findall('.//item'):
            item_id_elem = item.find('guid')
            if item_id_elem is None:
                continue # Skip items without a GUID
            
            item_id = item_id_elem.text
            
            # Start item tag
            xml_lines.append('    <item>')
            
            # Add all child elements except description
            for child in item:
                if child.tag == 'description':
                    continue
                
                # Convert element to string
                child_str = ET.tostring(child, encoding='unicode')
                xml_lines.append(f"      {child_str}")
            
            # Add description with CDATA if we have a cleaned version
            if item_id in cleaned_descriptions:
                cleaned_desc = cleaned_descriptions[item_id]
                xml_lines.append(f'      <description><![CDATA[{cleaned_desc}]]></description>')
            else:
                # Fallback to original description
                desc_elem = item.find('description')
                desc = desc_elem.text if desc_elem is not None else ""
                xml_lines.append(f'      <description><![CDATA[{desc}]]></description>')
            
            # End item tag
            xml_lines.append('    </item>')
        
        # Close channel and rss tags
        xml_lines.append('  </channel>')
        xml_lines.append('</rss>')
        
        # Write the XML to file
        with open(cleaned_rss_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(xml_lines))
        
        print(f'Successfully saved cleaned RSS feed to {cleaned_rss_path}')
                
    except requests.RequestException as e:
        print(f'Failed to fetch RSS feed: {e}')
    except ET.ParseError as e:
        print(f'Failed to parse RSS feed: {e}')
    except Exception as e:
        print(f'Unexpected error: {e}')

if __name__ == '__main__':
    download_rss()
