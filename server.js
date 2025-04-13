const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const puppeteer = require("puppeteer");
const app = express();
const port = 9000;

const DOWNLOAD_DIR = path.join(__dirname, "downloads");
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

const tokens = {}; // Store one-time tokens

// Search endpoint
app.get("/search", async (req, res) => {
    const query = req.query.query;
    if (!query) return res.status(400).send({ error: "Query is required" });

    try {
        const response = await axios.get(`https://www.xvideos.com/?k=${encodeURIComponent(query)}`);
        const $ = cheerio.load(response.data);
        const results = [];

        $(".thumb-block").each((i, el) => {
            const title = $(el).find("a[title]").attr("title") || "Unknown";
            const duration = $(el).find(".duration").first().text().trim().replace(/(\d+ min).*\1/, "$1");
            const url = "https://www.xvideos.com" + $(el).find("a").attr("href");
            const thumbnail = $(el).find("img").attr("data-src") || "https://cdn.xvideos.com/default.jpg";
            results.push({ title, duration, url, thumbnail });
        });

        res.json(results);
    } catch (err) {
        console.error("[SEARCH ERROR]", err.message);
        res.status(500).json({ error: "Failed to fetch search results" });
    }
});

// Fetch & download endpoint
app.get("/fetch", async (req, res) => {
    const videoPageUrl = req.query.url;
    if (!videoPageUrl) return res.status(400).json({ error: "URL is required" });

    try {
        console.log("[FETCH] Launching browser...");
        const browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"]
        });
        const page = await browser.newPage();
        await page.goto(videoPageUrl, { waitUntil: "networkidle2" });

        const videoUrl = await page.evaluate(() => {
            const source = document.querySelector("video > source");
            return source ? source.src : null;
        });

        const title = await page.title();
        await browser.close();

        if (!videoUrl) {
            console.error("[FETCH ERROR] Video URL not found.");
            return res.status(404).json({ error: "Video URL not found" });
        }

        console.log(`[DOWNLOAD] Downloading from ${videoUrl}`);
        const videoName = `video_${Date.now()}.mp4`;
        const savePath = path.join(DOWNLOAD_DIR, videoName);
        const writer = fs.createWriteStream(savePath);

        const response = await axios({
            method: "get",
            url: videoUrl,
            responseType: "stream"
        });

        response.data.pipe(writer);

        writer.on("finish", () => {
            const token = crypto.randomBytes(8).toString("hex");
            tokens[token] = {
                path: savePath,
                expires: Date.now() + 5 * 60 * 1000 // 5 minutes
            };

            console.log(`[SUCCESS] Video saved. Access via /watch/${token}`);
            res.json({
                status: true,
                title: title,
                url: `http://play.leviihosting.shop:${port}/watch/${token}`
            });
        });

        writer.on("error", (err) => {
            console.error("[FILE WRITE ERROR]", err.message);
            res.status(500).json({ error: "Failed to save video" });
        });

    } catch (err) {
        console.error("[FETCH ERROR]", err.message);
        res.status(500).json({ error: "Failed to fetch video" });
    }
});

// Serve downloaded file via token
app.get("/watch/:token", (req, res) => {
    const tokenData = tokens[req.params.token];
    if (!tokenData) return res.status(404).send("Invalid or expired token");

    if (Date.now() > tokenData.expires) {
        fs.unlinkSync(tokenData.path); // delete expired
        delete tokens[req.params.token];
        return res.status(410).send("Token expired");
    }

    res.sendFile(tokenData.path, {}, (err) => {
        if (!err) {
            fs.unlinkSync(tokenData.path); // delete after one-time access
            delete tokens[req.params.token];
            console.log(`[CLEANUP] Deleted file after access: ${tokenData.path}`);
        }
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});