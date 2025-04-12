import requests
from bs4 import BeautifulSoup
from fastapi import FastAPI
from pydantic import BaseModel
import uuid
import os

app = FastAPI()

# Function to get video metadata
def get_video_metadata(url: str):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
    }

    # Get the page content
    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        return {"error": "Failed to fetch page content"}

    # Parse the page content using BeautifulSoup
    soup = BeautifulSoup(response.text, 'html.parser')

    # Extract video title
    title_tag = soup.find('meta', {'name': 'title'})
    title = title_tag['content'] if title_tag else 'Unknown Title'

    # Extract video duration
    duration_tag = soup.find('span', {'class': 'duration'})
    duration = duration_tag.text.strip() if duration_tag else 'Unknown Duration'

    # Extract views
    views_tag = soup.find('span', {'class': 'viewcount'})
    views = views_tag.text.strip() if views_tag else 'Unknown Views'

    # Extract rating
    rating_tag = soup.find('span', {'class': 'rating'})
    rating = rating_tag.text.strip() if rating_tag else 'Unknown Rating'

    # Extract thumbnail
    thumbnail_tag = soup.find('meta', {'property': 'og:image'})
    thumbnail = thumbnail_tag['content'] if thumbnail_tag else 'No Thumbnail'

    # Extract video download URL (direct video link)
    video_url_tag = soup.find('video', {'id': 'player'})
    video_url = video_url_tag['src'] if video_url_tag else 'No Video URL'

    return {
        "title": title,
        "duration": duration,
        "views": views,
        "rating": rating,
        "thumbnail": thumbnail,
        "direct_video_url": video_url
    }

# Endpoint for searching video
@app.get("/search")
def search_video(query: str):
    search_url = f"https://www.xvideos.com/?k={query}"
    metadata = get_video_metadata(search_url)
    if "error" in metadata:
        return {"error": "Failed to search videos"}
    return metadata

# Download endpoint
@app.get("/download")
def download_video(url: str):
    metadata = get_video_metadata(url)
    if "error" in metadata:
        return {"error": "Failed to fetch video metadata"}

    # Generate a unique filename
    filename = str(uuid.uuid4()) + ".mp4"
    file_path = f"./downloads/{filename}"

    # Download the video and save it
    video_url = metadata["direct_video_url"]
    video_response = requests.get(video_url)

    if video_response.status_code == 200:
        os.makedirs('./downloads', exist_ok=True)
        with open(file_path, 'wb') as f:
            f.write(video_response.content)
        return {"file": f"/file/{filename}"}
    else:
        return {"error": "Failed to download video"}

# Endpoint to serve downloaded video
@app.get("/file/{filename}")
def get_file(filename: str):
    file_path = f"./downloads/{filename}"
    if os.path.exists(file_path):
        return {"file_url": f"/{file_path}"}
    return {"error": "File not found"}