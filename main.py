from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from bs4 import BeautifulSoup
import requests
import os
import uuid
from urllib.parse import unquote
import threading

app = FastAPI()
DOWNLOAD_FOLDER = "downloads"
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)
tokens = {}

# Helper to delete file after serving
def delete_file_after(filepath: str, delay: int = 5):
    import time
    time.sleep(delay)
    if os.path.exists(filepath):
        os.remove(filepath)

# Extract video info from a valid video URL
def get_video_details(video_url: str):
    headers = {"User-Agent": "Mozilla/5.0"}
    res = requests.get(video_url, headers=headers)
    soup = BeautifulSoup(res.text, "html.parser")

    title = soup.find("meta", property="og:title")["content"]
    duration = soup.find("span", class_="duration").text.strip() if soup.find("span", class_="duration") else "Unknown"
    views = soup.find("strong", class_="mobile-hide").text.strip() if soup.find("strong", class_="mobile-hide") else "Unknown"
    rating = soup.find("span", class_="rating").text.strip() if soup.find("span", class_="rating") else "Unknown"
    thumbnail = soup.find("meta", property="og:image")["content"]

    # Direct video file from 'html5player.setVideoUrlHigh'
    direct_url = None
    for script in soup.find_all("script"):
        if "html5player.setVideoUrlHigh" in script.text:
            start = script.text.find("html5player.setVideoUrlHigh('") + len("html5player.setVideoUrlHigh('")
            end = script.text.find("')", start)
            direct_url = script.text[start:end]
            break

    return {
        "title": title,
        "duration": duration,
        "views": views,
        "rating": rating,
        "thumbnail": thumbnail,
        "url": video_url,
        "direct_video_url": direct_url
    }

# Filter only /video links
def extract_video_url(query: str):
    search_url = f"https://www.xvideos.com/?k={query}"
    headers = {"User-Agent": "Mozilla/5.0"}
    res = requests.get(search_url, headers=headers)
    soup = BeautifulSoup(res.text, "html.parser")
    links = soup.select(".thumb-block a")

    for link in links:
        href = link.get("href", "")
        if href.startswith("/video"):
            return "https://www.xvideos.com" + href
    return None

# Search Endpoint
@app.get("/search")
def search(query: str):
    video_url = extract_video_url(query)
    if not video_url:
        raise HTTPException(status_code=404, detail="No video result found")

    details = get_video_details(video_url)
    return details

# Download Endpoint
@app.get("/download")
def download(url: str):
    url = unquote(url)
    details = get_video_details(url)
    direct_url = details.get("direct_video_url")

    if not direct_url:
        raise HTTPException(status_code=400, detail="Video URL is not available")

    file_name = f"{uuid.uuid4()}.mp4"
    file_path = os.path.join(DOWNLOAD_FOLDER, file_name)

    with requests.get(direct_url, stream=True) as r:
        with open(file_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)

    token = uuid.uuid4().hex
    tokens[token] = file_path

    return {
        "message": "Use this URL to download your video once",
        "download_url": f"/getvideo/{token}"
    }

# Serve one-time video and delete after download
@app.get("/getvideo/{token}")
def get_video(token: str):
    if token not in tokens:
        raise HTTPException(status_code=404, detail="Invalid or expired token")

    file_path = tokens.pop(token)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Serve file and delete after short delay
    threading.Thread(target=delete_file_after, args=(file_path,)).start()
    return FileResponse(file_path, media_type="video/mp4", filename=os.path.basename(file_path))