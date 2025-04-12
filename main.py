from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from bs4 import BeautifulSoup
import requests, os, uuid, shutil
from urllib.parse import quote_plus
from threading import Timer

app = FastAPI()

VIDEO_DIR = "downloads"
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

    thumb_meta = soup.find("meta", property="og:image")
    thumbnail = thumb_meta["content"] if thumb_meta else "https://cdn.xvideos.com/default.jpg"

    scripts = soup.find_all("script")
    video_url = None
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
    search_url = f"https://www.xvideos.com/?k={quote_plus(query)}"
    headers = {"User-Agent": "Mozilla/5.0"}
    response = requests.get(search_url, headers=headers)
    soup = BeautifulSoup(response.content, "html.parser")
    first_result = soup.select_one(".thumb-block a")
    if not first_result:
        return {"error": "No results found"}
    video_url = "https://www.xvideos.com" + first_result["href"]
    details = get_video_details(video_url)
    return details

@app.get("/download")
def download(url: str, request: Request):
    details = get_video_details(url)
    if not details["direct_video_url"]:
        return {"error": "Video URL is not available"}

    # Download the video
    video_id = str(uuid.uuid4())
    filename = f"{video_id}.mp4"
    filepath = os.path.join(VIDEO_DIR, filename)
    with requests.get(details["direct_video_url"], stream=True) as r:
        with open(filepath, "wb") as f:
            shutil.copyfileobj(r.raw, f)

    # Generate one-time token
    token = str(uuid.uuid4())
    token_map[token] = filepath

    # Auto delete after 5 minutes if not downloaded
    Timer(300, lambda: token_map.pop(token, None)).start()

    # Return download link
    host = request.client.host
    return {
        "message": "Video is ready",
        "title": details["title"],
        "views": details["views"],
        "size": f"{round(os.path.getsize(filepath)/1024/1024, 2)} MB",
        "link": f"http://{host}:9000/file/{token}"
    }

token_map = {}

@app.get("/file/{token}")
def serve_file(token: str):
    filepath = token_map.pop(token, None)
    if not filepath or not os.path.exists(filepath):
        return {"error": "Invalid or expired token"}

    def delete_file(path):
        try:
            os.remove(path)
        except:
            pass

    Timer(1, delete_file, args=[filepath]).start()
    return FileResponse(filepath, media_type="video/mp4", filename=os.path.basename(filepath))