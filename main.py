from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import FileResponse
from bs4 import BeautifulSoup
import requests
import os
import shutil
import uuid

app = FastAPI()

DOWNLOAD_DIR = "downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

@app.get("/")
def home():
    return {"status": "Xvideos API is up."}

@app.get("/search")
def search(query: str = Query(...)):
    url = f"https://www.xvideos.com/?k={query}"
    headers = {"User-Agent": "Mozilla/5.0"}
    res = requests.get(url, headers=headers)
    soup = BeautifulSoup(res.content, "html.parser")
    videos = []
    for video in soup.select(".thumb-block"):
        title_tag = video.select_one(".thumb-under a")
        if not title_tag:
            continue
        href = title_tag.get("href")
        title = title_tag.text.strip()
        thumbnail = video.select_one("img")
        duration = video.select_one("var.duration")
        videos.append({
            "title": title,
            "link": f"https://www.xvideos.com{href}",
            "thumbnail": thumbnail.get("data-src") or thumbnail.get("src") if thumbnail else None,
            "duration": duration.text.strip() if duration else None
        })
    return {"results": videos}

@app.get("/download")
def download_video(url: str = Query(...)):
    if "xvideos.com" not in url:
        raise HTTPException(status_code=400, detail="Invalid Xvideos URL.")

    headers = {"User-Agent": "Mozilla/5.0"}
    res = requests.get(url, headers=headers)
    soup = BeautifulSoup(res.content, "html.parser")

    try:
        title = soup.select_one("h2.page-title")
        duration = soup.select_one("span.duration")
        views = soup.select_one("strong.nb-views")
        rating = soup.select_one("div.rating span.rating")
        thumbnail = soup.select_one("meta[property='og:image']")

        title = title.text.strip() if title else "Unknown Title"
        duration = duration.text.strip() if duration else "Unknown Duration"
        views = views.text.strip() if views else "Unknown Views"
        rating = rating.text.strip() if rating else "Unknown Rating"
        thumbnail = thumbnail["content"] if thumbnail else None

        script_tag = next((s for s in soup.find_all("script") if "setVideoUrlHigh" in s.text), None)
        if not script_tag:
            raise Exception("Video script not found.")

        video_url = None
        for line in script_tag.text.splitlines():
            if "setVideoUrlHigh" in line:
                video_url = line.split("setVideoUrlHigh('")[1].split("')")[0]
                break

        if not video_url:
            raise Exception("Video URL not found.")

        filename = f"{uuid.uuid4()}.mp4"
        filepath = os.path.join(DOWNLOAD_DIR, filename)

        with requests.get(video_url, stream=True) as r:
            with open(filepath, "wb") as f:
                shutil.copyfileobj(r.raw, f)

        return {
            "title": title,
            "duration": duration,
            "views": views,
            "rating": rating,
            "thumbnail": thumbnail,
            "direct_video_url": video_url,
            "download": f"/file/{filename}"
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/file/{filename}")
def serve_file(filename: str):
    filepath = os.path.join(DOWNLOAD_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(filepath, media_type='video/mp4', filename=filename)
