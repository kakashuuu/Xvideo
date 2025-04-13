const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer-core");

const app = express();
const port = 9000;

// Search Endpoint
app.get("/search", async (req, res) => {
    const query = req.query.query;
    if (!query) return res.status(400).send({ error: "Query is required" });

    try {
        const searchUrl = `https://www.xvideos.com/?k=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl);
        const $ = cheerio.load(response.data);
        const results = [];

        $(".thumb-block").each((i, el) => {
            const title = $(el).find("a[title]").attr("title") || "Unknown";
            let duration = $(el).find(".duration").text().trim() || "Unknown";
            duration = duration.replace(/(\d+ min)\1/, "$1"); // Fix duplicate duration
            const url = "https://www.xvideos.com" + $(el).find("a").attr("href");
            const thumbnail = $(el).find("img").attr("data-src") || "https://cdn.xvideos.com/default.jpg";
            results.push({ title, duration, url, thumbnail });
        });

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch search results" });
    }
});

// Download Endpoint
app.get("/download", async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).send({ error: "URL is required" });

    try {
        const browser = await puppeteer.launch({
            headless: "new",
            executablePath: "/usr/bin/chromium-browser",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(videoUrl, { waitUntil: "domcontentloaded" });

        const data = await page.evaluate(() => {
            const video = document.querySelector("video");
            const source = video?.querySelector("source")?.src;
            const title = document.querySelector("meta[property='og:title']")?.content || "Unknown";
            const thumbnail = document.querySelector("meta[property='og:image']")?.content || "";
            const durationEl = document.querySelector(".duration");
            const duration = durationEl ? durationEl.innerText.trim() : "Unknown";

            return {
                title,
                duration,
                thumbnail,
                url_dl: source || null
            };
        });

        await browser.close();

        if (!data.url_dl) return res.status(404).json({ error: "Video URL not found" });

        res.json({
            status: true,
            creator: "Kakashi",
            result: data
        });

    } catch (err) {
        res.status(500).json({ error: "Failed to fetch video page" });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});