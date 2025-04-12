const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const app = express();
const port = 9000;

// Search endpoint to get video details
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

        // Debugging: Output the entire HTML to see the structure
        console.log(response.data);

        $(".thumb-block").each((i, el) => {
            let title = $(el).find("a").attr("title");
            
            // Check meta tags if the title is not found
            if (!title) {
                title = $("meta[property='og:title']").attr("content");
            }

            // If title is still unknown, try extracting from other places
            if (!title) {
                title = $("h1").text() || $("h2").text() || "Unknown";
            }

            // Handle empty title case and provide a fallback
            if (!title || title.trim() === "") {
                console.log("Could not find title in element", $(el));  // Debug output
                title = "Unknown";
            }

            let duration = $(el).find(".duration").text().trim() || "Unknown";
            if (duration === "Unknown") {
                const altDuration = $(el).find(".thumb-meta span").text().trim() || "Unknown";
                duration = altDuration;
            }

            // Clean duration field (e.g., "1 min11 min" -> "1 min")
            if (duration.match(/\d+\smin.*\d+\smin/)) {
                duration = duration.replace(/(\d+\smin).*\1/, "$1");
            }

            const url = "https://www.xvideos.com" + $(el).find("a").attr("href");
            const thumbnail = $(el).find("img").attr("data-src") || "https://cdn.xvideos.com/default.jpg";

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

        // Debugging: Output the entire HTML to check for title
        console.log(response.data);

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