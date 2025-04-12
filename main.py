import os
import shutil
import uuid
import requests
from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from bs4 import BeautifulSoup
from urllib.parse import urlparse
from pathlib import Path

app = FastAPI()
DOWNLOAD_DIR = "downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)


@app.get("/")
def root():
    return {"message": "Xvideos API is up!"}


@app.get("/search")
def search_videos(query: str = Query(...)):
    url = f"https://www.xvideos.com/?k={query.replace(' ', '+')}"
    headers = {"User-Agent": "Mozilla/5.0"}

    res = requests.get(url, headers=headers)
    soup = BeautifulSoup(res.content, "html.parser")
    results = []

    for video in soup.select(".thumb-block"):
        title = video.select_one(".title").text.strip() if video.select_one(".title") else None
        video_url = "https://www.xvideos.com" + video.select_one("a")["href"]
        thumb = video.select_one("img")["data-src"] if video.select_one("img") else None

        if title and video_url:
            results.append({"title": title, "url": video_url, "thumbnail": thumb})

    return results[:10]


@app.get("/download")
def download_video(url: str = Query(...)):
    if "xvideos.com" not in url:
        raise HTTPException(status_code=400, detail="Invalid Xvideos URL.")

    headers = {"User-Agent": "Mozilla/5.0"}
    res = requests.get(url, headers=headers)
    soup = BeautifulSoup(res.content, "html.parser")

    try:
        title = soup.select_one("h2.page-title").text.strip()
        duration = soup.select_one("span.duration").text.strip()
        views = soup.select_one("strong.nb-views").text.strip()
        rating = soup.select_one("div.rating span.rating").text.strip()
        thumbnail = soup.select_one("meta[property='og:image']")["content"]

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
def get_file(filename: str):
    filepath = os.path.join(DOWNLOAD_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found.")

    def delete_file(path):
        try:
            os.remove(path)
        except Exception:
            pass

    response = FileResponse(filepath, media_type="application/octet-stream", filename=filename)
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    # Schedule delete after response
    from threading import Timer
    Timer(5.0, delete_file, [filepath]).start()
    return response