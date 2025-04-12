import os
import uuid
import requests
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from bs4 import BeautifulSoup

app = FastAPI()

# Path where videos will be stored
VIDEO_DIR = './videos'
os.makedirs(VIDEO_DIR, exist_ok=True)

# Helper function to download video
def download_video(url: str, filename: str):
    video_response = requests.get(url, stream=True)
    if video_response.status_code == 200:
        file_path = os.path.join(VIDEO_DIR, filename)
        with open(file_path, 'wb') as f:
            for chunk in video_response.iter_content(chunk_size=8192):
                f.write(chunk)
        return file_path
    else:
        raise HTTPException(status_code=400, detail="Failed to download the video")

# Helper function to get video details (title, duration, URL, views, likes, size)
def get_video_details(url: str):
    response = requests.get(url)
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch video details")
    
    soup = BeautifulSoup(response.content, 'html.parser')
    
    title = soup.find('title').get_text()
    views = soup.find('span', {'class': 'view-count'}).get_text() if soup.find('span', {'class': 'view-count'}) else 'Unknown Views'
    likes = soup.find('span', {'class': 'like-count'}).get_text() if soup.find('span', {'class': 'like-count'}) else 'Unknown Likes'
    dislikes = soup.find('span', {'class': 'dislike-count'}).get_text() if soup.find('span', {'class': 'dislike-count'}) else 'Unknown Dislikes'
    votes = soup.find('span', {'class': 'vote-count'}).get_text() if soup.find('span', {'class': 'vote-count'}) else 'Unknown Votes'
    size = "47.14 MB"  # Assuming static size for now, you can modify to scrape this info if needed

    return {
        "title": title,
        "views": views,
        "likes": likes,
        "dislikes": dislikes,
        "votes": votes,
        "size": size,
        "url": url
    }

# Generate one-time download token
def generate_token(filename: str):
    return str(uuid.uuid4())

# Clean up the video after download
def delete_video(filename: str):
    file_path = os.path.join(VIDEO_DIR, filename)
    if os.path.exists(file_path):
        os.remove(file_path)

@app.get("/download")
async def download(url: str, background_tasks: BackgroundTasks):
    # Fetch video details
    video_details = get_video_details(url)
    
    # Generate a unique filename for the video
    filename = str(uuid.uuid4()) + ".mp4"
    
    # Download the video from the given URL
    file_path = download_video(url, filename)
    
    # Generate a one-time token for the video
    token = generate_token(filename)
    
    # Add a background task to delete the file after it is downloaded
    background_tasks.add_task(delete_video, filename)
    
    # Return the response with additional metadata
    response = {
        "message": "Sending video...",
        "title": video_details["title"],
        "views": video_details["views"],
        "likes": video_details["likes"],
        "dislikes": video_details["dislikes"],
        "votes": video_details["votes"],
        "size": video_details["size"],
        "source_url": video_details["url"],
        "download_link": f"/file/{token}"
    }
    
    return JSONResponse(content=response)

@app.get("/file/{token}")
async def serve_file(token: str):
    # Find the file associated with the token
    filename = token + ".mp4"
    file_path = os.path.join(VIDEO_DIR, filename)
    
    # Check if the file exists
    if os.path.exists(file_path):
        # Serve the file for download
        return FileResponse(file_path, media_type='video/mp4', filename=filename)
    
    raise HTTPException(status_code=404, detail="File not found or expired")

# Background task to clean up files after download
@app.get("/delete_file/{token}")
async def delete_file(token: str):
    filename = token + ".mp4"
    file_path = os.path.join(VIDEO_DIR, filename)
    
    if os.path.exists(file_path):
        os.remove(file_path)
        return {"message": "File deleted successfully."}
    
    return {"error": "File not found"}