from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from bs4 import BeautifulSoup
import requests
import uuid
import os
from typing import Dict
from threading import Timer

app = FastAPI()
VIDEO_DIR = "temp"
TOKENS: Dict[str, str] = {}

os.makedirs(VIDEO_DIR, exist_ok=True)

def get_video_details(url: str):
    headers = {"User-Agent": "Mozilla/5.0"}
    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch video page")

    soup = BeautifulSoup(response.content, "html.parser")

    title = soup.find("title").text.strip().replace(" - XVIDEOS.COM", "")
    views = soup.select_one(".rating-total-txt").text.strip() if soup.select_one(".rating-total-txt") else "Unknown Views"
    rating = soup.select_one("#video_rating")["data-rating"] if soup.select_one("#video_rating") else "Unknown Rating"
    thumbnail = soup.find("meta", property="og:image")["content"]

    # Extract direct video link from script
    scripts = soup.find_all("script")
    video_url = "No Video URL"
    for script in scripts:
        if "html5player.setVideoUrlHigh" in script.text:
            try:
                start = script.text.index("html5player.setVideoUrlHigh('") + len("html5player.setVideoUrlHigh('")
                end = script.text.index("')", start)
                video_url = script.text[start:end]
                break
            except:
                pass

    return {
        "title": title,
        "views": views,
        "rating": rating,
        "thumbnail": thumbnail,
        "url": url,
        "direct_video_url": video_url
    }

@app.get("/search")
def search(query: str):
    search_url = f"https://www.xvideos.com/?k={query}"
    headers = {"User-Agent": "Mozilla/5.0"}
    response = requests.get(search_url, headers=headers)
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Search failed")

    soup = BeautifulSoup(response.content, "html.parser")
    first_result = soup.find("div", class_="thumb-inside")
    if not first_result:
        raise HTTPException(status_code=404, detail="No videos found")

    video_link = first_result.find("a", href=True)
    if not video_link:
        raise HTTPException(status_code=404, detail="No valid link")

    video_url = "https://www.xvideos.com" + video_link['href']
    details = get_video_details(video_url)
    
    return {
        "title": details["title"],
        "views": details["views"],
        "rating": details["rating"],
        "thumbnail": details["thumbnail"],
        "url": video_url
    }

@app.get("/download")
def download(url: str):
    details = get_video_details(url)
    video_url = details["direct_video_url"]

    if video_url == "No Video URL":
        return {"error": "Video URL is not available"}

    filename = f"{uuid.uuid4()}.mp4"
    filepath = os.path.join(VIDEO_DIR, filename)

    try:
        with requests.get(video_url, stream=True) as r:
            r.raise_for_status()
            with open(filepath, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")

    token = str(uuid.uuid4())
    TOKENS[token] = filepath

    return {
        "title": details["title"],
        "views": details["views"],
        "likes": "Unknown",
        "dislikes": "Unknown",
        "votes": "Unknown",
        "size": f"{round(os.path.getsize(filepath) / 1024 / 1024, 2)} MB",
        "source_url": url,
        "download": f"/file/{token}"
    }

@app.get("/file/{token}")
def get_file(token: str):
    if token not in TOKENS:
        raise HTTPException(status_code=404, detail="Invalid or expired token")

    filepath = TOKENS.pop(token)

    def delete_file():
        try:
            os.remove(filepath)
        except:
            pass

    Timer(3.0, delete_file).start()
    return FileResponse(filepath, media_type="video/mp4", filename=os.path.basename(filepath))