const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const puppeteer = require("puppeteer-core");

const app = express();
const port = 9000;
const downloadDir = path.join(__dirname, "downloads");
const tokens = new Map(); // token => filepath

// Ensure download directory exists
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

// Generate random token
function generateToken(length = 8) {
    return crypto.randomBytes(length).toString("hex");
}

// ========== DOWNLOAD + GENERATE LINK ==========
app.get("/fetch", async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: "Video URL required" });

    try {
        const browser = await puppeteer.launch({
            headless: "new",
            executablePath: "/usr/bin/chromium-browser",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(videoUrl, { waitUntil: "domcontentloaded" });

        const data = await page.evaluate(() => {
            const source = document.querySelector("video source")?.src;
            const title = document.querySelector("meta[property='og:title']")?.content || "video";
            return { source, title };
        });

        await browser.close();

        if (!data.source) return res.status(404).json({ error: "Video URL not found" });

        const safeName = data.title.replace(/[^\w\d_-]+/g, "_");
        const filePath = path.join(downloadDir, `${safeName}_${Date.now()}.mp4`);
        const writer = fs.createWriteStream(filePath);

        const response = await axios.get(data.source, { responseType: "stream" });
        response.data.pipe(writer);

        writer.on("finish", () => {
            const token = generateToken(6);
            tokens.set(token, filePath);
            setTimeout(() => tokens.delete(token), 5 * 60 * 1000); // auto-expire in 5 min

            return res.json({
                status: true,
                message: "Download ready",
                download_url: `http://yourdomain.com/dl/${token}`
            });
        });

        writer.on("error", () => {
            return res.status(500).json({ error: "Failed to save video" });
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal error" });
    }
});

// ========== ONE-TIME DOWNLOAD ==========
app.get("/dl/:token", (req, res) => {
    const token = req.params.token;
    const file = tokens.get(token);

    if (!file || !fs.existsSync(file)) return res.status(404).send("Invalid or expired link");

    res.download(file, (err) => {
        if (!err) {
            fs.unlinkSync(file); // Delete after sending
            tokens.delete(token); // Invalidate token
        }
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});