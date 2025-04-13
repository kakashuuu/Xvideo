const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();
const port = 9000;
const VIDEO_DIR = path.join(__dirname, "videos");
if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR);

const TEMP_LINKS = {};

function log(...args) {
    console.log("[LOG]", ...args);
}

// 1. SEARCH endpoint
app.get("/search", async (req, res) => {
    const query = req.query.query;
    if (!query) return res.status(400).send({ error: "Query is required" });

    try {
        const searchUrl = `https://www.xvideos.com/?k=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl);
        const $ = cheerio.load(response.data);
        const results = [];

        $(".thumb-block").each((_, el) => {
            const title = $(el).find("a[title]").attr("title") || "Unknown";
            const duration = $(el).find(".duration").first().text().trim().replace(/(\d+ min).*\1/, "$1") || "Unknown";
            const url = "https://www.xvideos.com" + $(el).find("a").attr("href");
            const thumbnail = $(el).find("img").attr("data-src") || "https://cdn.xvideos.com/default.jpg";
            results.push({ title, duration, url, thumbnail });
        });

        res.json(results);
    } catch (err) {
        console.error("[SEARCH ERROR]", err.message);
        res.status(500).send({ error: "Failed to fetch search results" });
    }
});

// 2. FETCH endpoint
app.get("/fetch", async (req, res) => {
    const videoPageUrl = req.query.url;
    if (!videoPageUrl) return res.status(400).send({ error: "URL is required" });

    log("[FETCH] Launching browser...");
    let browser;

    try {
        browser = await puppeteer.launch({
            headless: true,
            executablePath: "/usr/bin/chromium-browser", // Confirm with `which chromium-browser`
            args: ["--no-sandbox", "--disable-setuid-sandbox"]
        });

        const page = await browser.newPage();
        await page.goto(videoPageUrl, { waitUntil: "networkidle2" });

        const videoUrl = await page.evaluate(() => {
            const videoTag = document.querySelector("video > source");
            return videoTag ? videoTag.src : null;
        });

        if (!videoUrl) {
            throw new Error("Video URL not found");
        }

        const title = await page.title();
        const filename = `${uuidv4()}.mp4`;
        const filepath = path.join(VIDEO_DIR, filename);

        log("[FETCH] Downloading video...");
        const writer = fs.createWriteStream(filepath);
        const response = await axios({
            url: videoUrl,
            method: "GET",
            responseType: "stream"
        });

        response.data.pipe(writer);

        writer.on("finish", () => {
            const token = uuidv4();
            TEMP_LINKS[token] = {
                path: filepath,
                expires: Date.now() + 5 * 60 * 1000 // expires in 5 min
            };

            const downloadUrl = `http://play.leviihosting.shop:${port}/video/${token}`;
            log("[FETCH] Download complete:", filename);
            res.json({
                status: true,
                title,
                downloadUrl
            });
        });

        writer.on("error", (err) => {
            log("[FETCH ERROR] Write error", err);
            res.status(500).send({ error: "Failed to save video" });
        });

    } catch (err) {
        log("[FETCH ERROR]", err.message);
        res.status(500).send({ error: err.message });
    } finally {
        if (browser) await browser.close();
    }
});

// 3. One-time video access
app.get("/video/:token", (req, res) => {
    const token = req.params.token;
    const record = TEMP_LINKS[token];

    if (!record) return res.status(404).send("Invalid or expired link");

    if (Date.now() > record.expires) {
        fs.unlink(record.path, () => {});
        delete TEMP_LINKS[token];
        return res.status(410).send("Link expired");
    }

    res.download(record.path, (err) => {
        if (!err) {
            fs.unlink(record.path, () => {});
            delete TEMP_LINKS[token];
        }
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});