const express = require("express");
const puppeteer = require("puppeteer");
const axios = require("axios");
const cheerio = require("cheerio");
const app = express();
const port = 9000;

// Endpoint 1: Search videos
app.get("/search", async (req, res) => {
    const query = req.query.query;
    if (!query) return res.status(400).json({ error: "Query is required" });

    try {
        const searchUrl = `https://www.xvideos.com/?k=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl);
        const $ = cheerio.load(response.data);
        const results = [];

        $(".thumb-block").each((_, el) => {
            const title = $(el).find("a[title]").attr("title") || "Unknown";
            let duration = $(el).find(".duration").first().text().trim() || "Unknown";
            if (duration.includes(duration)) duration = duration.replace(/(.+)\1/, "$1");

            const url = "https://www.xvideos.com" + $(el).find("a").attr("href");
            const thumbnail = $(el).find("img").attr("data-src") || "https://cdn.xvideos.com/default.jpg";
            results.push({ title, duration, url, thumbnail });
        });

        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch search results" });
    }
});

// Endpoint 2: Get CDN Video URL
app.get("/cdn", async (req, res) => {
    const videoPage = req.query.url;
    if (!videoPage) return res.status(400).json({ error: "URL is required" });

    try {
        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(videoPage, { waitUntil: "networkidle2" });

        const cdnUrl = await page.evaluate(() => {
            const source = document.querySelector("video source");
            return source ? source.src : null;
        });

        await browser.close();

        if (!cdnUrl) {
            return res.status(404).json({ error: "CDN video URL not found" });
        }

        res.json({
            status: true,
            cdn_url: cdnUrl
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Something went wrong" });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});