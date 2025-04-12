const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const app = express();
const port = 9000;

// Search endpoint to get video details based on the query
app.get("/search", async (req, res) => {
    const query = req.query.query;
    if (!query) {
        return res.status(400).json({ error: "Query is required" });
    }

    const searchUrl = `https://www.xvideos.com/?k=${encodeURIComponent(query)}`;

    try {
        const response = await axios.get(searchUrl);
        const $ = cheerio.load(response.data);
        const results = [];

        // Scraping video details
        $(".thumb-block").each((i, el) => {
            const title = $(el).find("a").attr("title") || "Unknown";
            let duration = $(el).find(".duration").text().trim() || "Unknown";
            const url = "https://www.xvideos.com" + $(el).find("a").attr("href");
            const thumbnail = $(el).find("img").attr("data-src") || "https://cdn.xvideos.com/default.jpg";

            // Log the raw duration for debugging
            console.log("Raw Duration:", duration);

            // Try another way to fetch the duration if not found
            if (duration === "Unknown") {
                const altDuration = $(el).find(".thumb-meta span").text().trim() || "Unknown";
                console.log("Alternative Duration:", altDuration);
                duration = altDuration;
            }

            // Clean the duration field (e.g., "1 min11 min" -> "1 min")
            // Remove any duplicates and ensure only one instance of 'min' appears
            if (duration.match(/\d+\smin.*\d+\smin/)) {
                duration = duration.replace(/(\d+\smin).*\1/, "$1");
            }

            console.log("Cleaned Duration:", duration);

            results.push({ title, duration, url, thumbnail });
        });

        if (results.length === 0) {
            return res.status(404).json({ message: "No results found for the given query" });
        }

        res.json(results);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch search results" });
    }
});

// Download endpoint to fetch the video and return the direct link
app.get("/download", async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) {
        return res.status(400).json({ error: "URL is required" });
    }

    try {
        const response = await axios.get(videoUrl);
        const $ = cheerio.load(response.data);

        const title = $("meta[property='og:title']").attr("content") || "Unknown";
        const views = $(".views").text().trim() || "Unknown Views";
        const thumbnail = $("meta[property='og:image']").attr("content") || "https://cdn.xvideos.com/default.jpg";
        const videoUrlDirect = $("video source").attr("src");

        if (!videoUrlDirect) {
            return res.status(404).json({ error: "Video URL not found or unavailable" });
        }

        res.json({
            status: true,
            creator: "Your Creator Name", // Customize with your name or information
            result: {
                title,
                views,
                thumbnail,
                url_dl: videoUrlDirect
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch video details" });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});