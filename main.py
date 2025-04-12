from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import aiohttp
import os
import uuid
from bs4 import BeautifulSoup
import mimetypes
from pathlib import Path
from playwright.async_api import async_playwright

app = FastAPI()

HOST = "129.146.180.197"
PORT = 9000
DOWNLOAD_DIR = Path("downloads")
DOWNLOAD_DIR.mkdir(exist_ok=True)

class SearchResult(BaseModel):
    title: str
    url: str
    thumb: str | None = None

@app.get("/")
async def root():
    return {"message": "Xvideos API is working!"}

@app.get("/search")
async def search(query: str = Query(...)):
    search_url = f"https://www.xvideos.com/?k={query.replace(' ', '+')}"
    results = []

    async with aiohttp.ClientSession() as session:
        async with session.get(search_url) as response:
            if response.status != 200:
                raise HTTPException(status_code=500, detail="Failed to fetch search results")
            text = await response.text()
            soup = BeautifulSoup(text, "html.parser")
            blocks = soup.select(".thumb-block")
            for block in blocks:
                a_tag = block.select_one(".title a")
                img_tag = block.select_one("img")
                if a_tag:
                    title = a_tag.text.strip()
                    url = f"https://www.xvideos.com{a_tag.get('href')}"
                    thumb = img_tag.get("data-src") or img_tag.get("src") if img_tag else None
                    results.append(SearchResult(title=title, url=url, thumb=thumb))

    return JSONResponse(content={"results": [r.dict() for r in results]})

@app.get("/download")
async def download(url: str = Query(...)):
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.goto(url, timeout=60000)
            await page.wait_for_selector("video")
            video_url = await page.eval_on_selector("video", "el => el.src")
            await browser.close()

        if not video_url:
            raise HTTPException(status_code=404, detail="Video URL not found")

        file_ext = mimetypes.guess_extension(mimetypes.guess_type(video_url)[0]) or ".mp4"
        filename = f"{uuid.uuid4()}{file_ext}"
        filepath = DOWNLOAD_DIR / filename

        async with aiohttp.ClientSession() as session:
            async with session.get(video_url) as resp:
                if resp.status != 200:
                    raise HTTPException(status_code=500, detail="Failed to download video")
                with open(filepath, "wb") as f:
                    while True:
                        chunk = await resp.content.read(1024)
                        if not chunk:
                            break
                        f.write(chunk)

        return {"title": Path(url).name, "download": f"http://{HOST}:{PORT}/file/{filename}"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/file/{filename}")
async def serve_file(filename: str):
    filepath = DOWNLOAD_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        path=filepath,
        filename=filename,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
        background=lambda: filepath.unlink()
    )
