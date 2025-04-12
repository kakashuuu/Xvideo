from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from bs4 import BeautifulSoup
import requests
import concurrent.futures

app = FastAPI()

def extract_video_links(query: str, limit: int = 10):
    url = f"https://www.xvideos.com/?k={query}"
    headers = {"User-Agent": "Mozilla/5.0"}
    res = requests.get(url, headers=headers)
    soup = BeautifulSoup(res.text, "html.parser")
    links = soup.select(".thumb-block a")
    video_urls = []

    for link in links:
        href = link.get("href", "")
        if href.startswith("/video") and "video" in href:
            full_url = "https://www.xvideos.com" + href
            if full_url not in video_urls:
                video_urls.append(full_url)
        if len(video_urls) >= limit:
            break

    return video_urls

def get_video_details(video_url: str):
    headers = {"User-Agent": "Mozilla/5.0"}
    res = requests.get(video_url, headers=headers)
    soup = BeautifulSoup(res.text, "html.parser")

    try:
        title = soup.find("meta", property="og:title")["content"]
        duration = soup.find("span", class_="duration").text.strip() if soup.find("span", class_="duration") else "Unknown"
        views = soup.find("strong", class_="mobile-hide").text.strip() if soup.find("strong", class_="mobile-hide") else "Unknown"
        rating = soup.find("span", class_="rating").text.strip() if soup.find("span", class_="rating") else "Unknown"
        thumbnail = soup.find("meta", property="og:image")["content"]

        # Direct video URL
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
    except Exception:
        return None

@app.get("/search")
def search(query: str, limit: int = 10):
    urls = extract_video_links(query, limit)
    if not urls:
        raise HTTPException(status_code=404, detail="No video results found")

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        details = list(executor.map(get_video_details, urls))

    for item in details:
        if item:
            results.append(item)

    return JSONResponse(content=results)