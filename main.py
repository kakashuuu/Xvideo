from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import requests
from bs4 import BeautifulSoup
import os
import shutil
import random
import string
from tempfile import NamedTemporaryFile

app = FastAPI()

# Model to store the video data
class VideoDetails(BaseModel):
    title: str
    views: str
    vote: str
    likes: str
    dislikes: str
    size: str
    sizeB: int
    thumb: str
    url_dl: str


def get_video_details(video_url: str):
    try:
        response = requests.get(video_url)
        soup = BeautifulSoup(response.text, 'html.parser')

        title = soup.find("meta", property="og:title")["content"]
        views = soup.find("meta", property="og:description")["content"]
        thumb = soup.find("meta", property="og:image")["content"]
        direct_video_url = soup.find("meta", property="og:video")["content"] if soup.find("meta", property="og:video") else None

        if not direct_video_url:
            raise HTTPException(status_code=404, detail="Direct video URL not found")

        # Example: Extracting more metadata like likes, dislikes, and size from the page
        vote = "Unknown"
        likes = "Unknown"
        dislikes = "Unknown"
        size = "Unknown"
        sizeB = 0

        return VideoDetails(
            title=title,
            views=views,
            vote=vote,
            likes=likes,
            dislikes=dislikes,
            size=size,
            sizeB=sizeB,
            thumb=thumb,
            url_dl=direct_video_url
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching video details: {str(e)}")


@app.get("/search")
async def search(query: str):
    search_url = f"https://www.xvideos.com/?k={query}"
    details = get_video_details(search_url)
    return {"status": True, "creator": "FG98", "result": details.dict()}


@app.get("/download")
async def download(url: str):
    try:
        video_details = get_video_details(url)

        # Generate a unique filename
        file_name = ''.join(random.choices(string.ascii_letters + string.digits, k=12)) + ".mp4"

        # Download and save video temporarily
        video_data = requests.get(video_details.url_dl)
        with NamedTemporaryFile(delete=False, mode='wb') as temp_file:
            temp_file.write(video_data.content)
            temp_file.close()

        # Creating the file path for downloading
        download_path = os.path.join('/tmp', file_name)

        # Rename and move file to /tmp
        shutil.move(temp_file.name, download_path)

        # Generate one-time token download URL (In real-world, you can integrate more complex token generation and expiry)
        download_url = f"/serve/{file_name}"

        # After the file is downloaded, automatically delete it
        os.remove(download_path)

        return {
            "status": True,
            "creator": "FG98",
            "result": {
                "title": video_details.title,
                "views": video_details.views,
                "vote": video_details.vote,
                "likes": video_details.likes,
                "deslikes": video_details.dislikes,
                "size": video_details.size,
                "sizeB": video_details.sizeB,
                "thumb": video_details.thumb,
                "url_dl": download_url
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing download request: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9000)