const express = require("express");
const puppeteer = require("puppeteer");
const app = express();
const port = 9000;

app.get("/cdn", async (req, res) => {
    const videoPage = req.query.url;
    if (!videoPage) return res.status(400).json({ error: "URL is required" });

    try {
        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(videoPage, { waitUntil: 'networkidle2' });

        const videoUrl = await page.evaluate(() => {
            const video = document.querySelector('video > source');
            return video ? video.src : null;
        });

        await browser.close();

        if (videoUrl) {
            res.json({
                status: true,
                cdn_url: videoUrl
            });
        } else {
            res.status(404).json({ error: "CDN video URL not found" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal error" });
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});