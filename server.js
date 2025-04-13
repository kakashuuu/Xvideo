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
            // Extract title, duration, and other details from the right parts of the HTML
            const title = $(el).find("a[title]").attr("title") || "Unknown";
            const duration = $(el).find(".duration").text().trim() || "Unknown";
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

        // Extract direct video URL from <video> or <source> tag
        const videoUrlDirect = $("video source").attr("src") || $("source[type='video/mp4']").attr("src");

        // If the video URL is found, return it
        if (videoUrlDirect) {
            res.json({
                status: true,
                result: {
                    url_dl: videoUrlDirect
                }
            });
        } else {
            res.status(404).send({ error: "Video URL not found" });
        }
    } catch (error) {
        console.error("Error fetching video details:", error);
        res.status(500).send({ error: "Failed to fetch video details" });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});