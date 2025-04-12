const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const app = express();
const port = 9000;

// Search endpoint to get video details
app.get("/search", async (req, res) => {
    const query = req.query.query;
    if (!query) {
        return res.status(400).send({ error: "Query is required" });
    }

    const searchUrl = `https://www.xvideos.com/?k=${encodeURIComponent(query)}`;

    try {
        const response = await axios.get(searchUrl);
        const $ = cheerio.load(response.data);
        const results = [];
        
        $(".thumb-block").each((i, el) => {
            const title = $(el).find("a").attr("title") || "Unknown";
            const duration = $(el).find(".duration").text() || "Unknown";
            const url = "https://www.xvideos.com" + $(el).find("a").attr("href");
            const thumbnail = $(el).find("img").attr("data-src") || "https://cdn.xvideos.com/default.jpg";

            results.push({ title, duration, url, thumbnail });
        });

        res.json(results);
    } catch (error) {
        res.status(500).send({ error: "Failed to fetch search results" });
    }
});

// Download endpoint to fetch the video and return the direct link
app.get("/download", async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) {
        return res.status(400).send({ error: "URL is required" });
    }

    try {
        const response = await axios.get(videoUrl);
        const $ = cheerio.load(response.data);
        const title = $("meta[property='og:title']").attr("content") || "Unknown";
        const views = $(".views").text() || "Unknown Views";
        const thumbnail = $("meta[property='og:image']").attr("content") || "https://cdn.xvideos.com/default.jpg";
        const videoUrlDirect = $("video source").attr("src");

        if (videoUrlDirect) {
            res.json({
                status: true,
                creator: "Your Creator Name",
                result: {
                    title,
                    views,
                    thumbnail,
                    url_dl: videoUrlDirect
                }
            });
        } else {
            res.status(404).send({ error: "Video URL not found" });
        }
    } catch (error) {
        res.status(500).send({ error: "Failed to fetch video details" });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
