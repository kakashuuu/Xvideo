import os
import uuid
import shutil
import aiofiles
import httpx
from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import FileResponse
from bs4 import BeautifulSoup

app = FastAPI()
DOWNLOAD_DIR = "downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

@app.get("/")
def root():
    return {"message": "Xvideos API is live"}

@app.get("/search")
async def search_videos(query: str = Query(...)):
    search_url = f"https://www.xvideos.com/?k={query}"
    async with httpx.AsyncClient() as client:
        res = await client.get(search_url)
    if res.status_code != 200:
        raise HTTPException(status_code=500, detail="Failed to fetch search results")

    soup = BeautifulSoup(res.text, "html.parser")
    results = []
    for video in soup.select(".thumb-block")[:10]:
        title_tag = video.select_one(".title a")
        img_tag = video.select_one("img")
        if title_tag and img_tag:
            results.append({
                "title": title_tag.get("title"),
                "url": f"https://www.xvideos.com{title_tag.get('href')}",
                "thumbnail": img_tag.get("data-src") or img_tag.get("src")
            })
    return results

@app.get("/download")
async def download_video(url: str = Query(...)):
    async with httpx.AsyncClient() as client:
        res = await client.get(url)
    if res.status_code != 200:
        raise HTTPException(status_code=404, detail="Video page not found")

    soup = BeautifulSoup(res.text, "html.parser")
    video_tag = soup.select_one("video source")
    title_tag = soup.select_one("title")
    if not video_tag:
        raise HTTPException(status_code=400, detail="No video found on the page")

    video_url = video_tag.get("src")
    title = title_tag.text.strip() if title_tag else str(uuid.uuid4())
    filename = f"{uuid.uuid4()}.mp4"
    filepath = os.path.join(DOWNLOAD_DIR, filename)

    async with httpx.AsyncClient() as client:
        async with client.stream("GET", video_url) as stream:
            async with aiofiles.open(filepath, "wb") as f:
                async for chunk in stream.aiter_bytes():
                    await f.write(chunk)

    return {
        "title": title,
        "filename": filename,
        "download_url": f"http://play.leviihosting.shop:9000/file/{filename}"
    }

@app.get("/file/{filename}")
async def serve_file(filename: str):
    filepath = os.path.join(DOWNLOAD_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")

    def delete_file(path):
        try:
            os.remove(path)
        except:
            pass

    return FileResponse(
        filepath,
        filename=filename,
        media_type='application/octet-stream',
        headers={"Content-Disposition": f"attachment; filename={filename}"},
        background=lambda: delete_file(filepath)
    )
