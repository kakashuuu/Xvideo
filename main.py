from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse
from bs4 import BeautifulSoup
import httpx
import os
import uuid
from urllib.parse import unquote, urlparse

app = FastAPI()

BASE_DIR = "downloads"
os.makedirs(BASE_DIR, exist_ok=True)

# Helper to get video details from an Xvideos URL
def get_video_details(video_url):
    try:
        headers = {"User-Agent": "Mozilla/5.0"}
        res = httpx.get(video_url, headers=headers)
        soup = BeautifulSoup(res.text, "html.parser")

        title = soup.find("meta", property="og:title")
        duration = soup.find("span", class_="duration")
        views = soup.find("div", class_="views")
        rating = soup.find("div", class_="rating")
        thumbnail = soup.find("meta", property="og:image")

        scripts = soup.find_all("script")
        video_url = None
        for script in scripts:
            if "html5player.setVideoUrlHigh" in script.text:
                for line in script.text.split("\n"):
                    if "html5player.setVideoUrlHigh" in line:
                        video_url = line.split("\"")[1]
                        break

        return {
            "title": title["content"] if title else "Unknown",
            "duration": duration.text.strip() if duration else "Unknown",
            "views": views.text.strip() if views else "Unknown",
            "rating": rating.text.strip() if rating else "Unknown",
            "thumbnail": thumbnail["content"] if thumbnail else "https://cdn.xvideos.com/default.jpg",
            "direct_video_url": video_url
        }
    except Exception as e:
        print("Error:", e)
        return None

# Endpoint: /search?query=
@app.get("/search")
def search(query: str):
    try:
        headers = {"User-Agent": "Mozilla/5.0"}
        url = f"https://www.xvideos.com/?k={query}"
        res = httpx.get(url, headers=headers)
        soup = BeautifulSoup(res.text, "html.parser")
        results = []
        for thumb in soup.select(".thumb-block")[:10]:
            a_tag = thumb.select_one("a")
            if not a_tag:
                continue
            video_url = f"https://www.xvideos.com{a_tag['href']}"
            title = a_tag.get("title") or a_tag.text.strip()
            duration = thumb.select_one(".duration")
            details = get_video_details(video_url)
            if details:
                results.append({
                    "title": details['title'] or title,
                    "duration": details['duration'] or (duration.text.strip() if duration else "Unknown Duration"),
                    "url": video_url,
                    "thumbnail": details['thumbnail'],
                    "direct_video_url": details['direct_video_url']
                })
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Endpoint: /download?url=
@app.get("/download")
def download(url: str):
    decoded_url = unquote(url)
    details = get_video_details(decoded_url)
    if details and details.get("direct_video_url"):
        video_url = details["direct_video_url"]
        filename = f"{uuid.uuid4().hex}.mp4"
        filepath = os.path.join(BASE_DIR, filename)

        with httpx.stream("GET", video_url) as r:
            with open(filepath, "wb") as f:
                for chunk in r.iter_bytes():
                    f.write(chunk)

        # Generate a one-time token
        token = uuid.uuid4().hex
        token_path = os.path.join(BASE_DIR, token)
        os.rename(filepath, token_path)

        return JSONResponse({
            "title": details['title'],
            "token_url": f"/file/{token}"
        })

    raise HTTPException(status_code=404, detail="Video or download link not found")

# Serve and delete the file after download
@app.get("/file/{token}")
def serve_file(token: str):
    filepath = os.path.join(BASE_DIR, token)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")

    def delete_after_response():
        os.remove(filepath)

    return FileResponse(filepath, media_type="video/mp4", filename=f"video.mp4", background=delete_after_response)