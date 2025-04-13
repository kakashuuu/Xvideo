const express = require("express");
const puppeteer = require("puppeteer");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const uuidv4 = require("uuid").v4;

const app = express();
const port = 9000;

// Directory to save videos
const VIDEO_DIR = path.join(__dirname, "videos");
if (!fs.existsSync(VIDEO_DIR)) {
    fs.mkdirSync(VIDEO_DIR);
}

// Temporary links (for 5 minutes expiration)
const TEMP_LINKS = {};

// Utility function for logging
const log = (message) => {
    console.log(`[${new Date().toISOString()}] ${message}`);
};

// Fetch video by URL
app.get("/fetch", async (req, res) => {
    const videoPageUrl = req.query.url;
    if (!videoPageUrl) return res.status(400).send({ error: "URL is required" });

    log("[FETCH] Launching browser...");
    let browser;

    try {
        browser = await puppeteer.launch({
            headless: true,
            executablePath: "/usr/bin/chromium-browser",
            args: ["--no-sandbox", "--disable-setuid-sandbox"]
        });

        const page = await browser.newPage();
        let videoUrl = null;

        // Intercept requests to capture the MP4 URL
        await page.setRequestInterception(true);
        page.on('request', request => {
            const reqUrl = request.url();
            if (reqUrl.endsWith(".mp4")) {
                videoUrl = reqUrl; // Capture video URL
                log("[FETCH] Intercepted MP4:", videoUrl);
            }
            request.continue();
        });

        // Navigate to the video page
        await page.goto(videoPageUrl, { waitUntil: "networkidle2", timeout: 60000 });
        await page.waitForTimeout(5000); // wait for video to load

        const title = await page.title();

        if (!videoUrl) throw new Error("Video URL not found after interception");

        const filename = `${uuidv4()}.mp4`;
        const filepath = path.join(VIDEO_DIR, filename);

        log("[FETCH] Downloading video...");
        const writer = fs.createWriteStream(filepath);
        const response = await axios({
            url: videoUrl,
            method: "GET",
            responseType: "stream"
        });

        // Pipe the response data to the local file
        response.data.pipe(writer);

        writer.on("finish", () => {
            // Generate a temporary token and store the video link
            const token = uuidv4();
            TEMP_LINKS[token] = {
                path: filepath,
                expires: Date.now() + 5 * 60 * 1000 // Expires after 5 minutes
            };

            const downloadUrl = `http://play.leviihosting.shop:${port}/video/${token}`;
            log("[FETCH] Download complete:", filename);

            // Send response with video details and download URL
            res.json({
                status: true,
                title,
                downloadUrl,
                videoUrl // include raw video URL for debugging
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

// Serve the video file (temporary download link)
app.get("/video/:token", (req, res) => {
    const token = req.params.token;
    const videoData = TEMP_LINKS[token];

    if (!videoData || Date.now() > videoData.expires) {
        return res.status(404).send({ error: "Link expired or not found" });
    }

    const filePath = videoData.path;
    res.sendFile(filePath, (err) => {
        if (err) {
            log("[VIDEO ERROR] Failed to send video file", err);
            res.status(500).send({ error: "Failed to send video" });
        } else {
            log("[VIDEO] Sent video successfully");
        }
    });
});

app.listen(port, () => {
    log(`Server running at http://localhost:${port}`);
});