const express = require("express");
const puppeteer = require("puppeteer");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const port = 9000;
const VIDEO_DIR = path.join(__dirname, "videos");
if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR);
const TEMP_LINKS = {};

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

app.get("/fetch", async (req, res) => {
  const videoPageUrl = req.query.url;
  if (!videoPageUrl) return res.status(400).json({ error: "URL is required" });

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

    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const reqUrl = request.url();
      if (reqUrl.endsWith(".mp4")) {
        videoUrl = reqUrl;
        log("[FETCH] MP4 Intercepted: " + videoUrl);
      }
      request.continue();
    });

    await page.goto(videoPageUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector("video"); // stable wait

    const title = await page.title();

    if (!videoUrl) throw new Error("Video URL not found");

    const filename = `${uuidv4()}.mp4`;
    const filepath = path.join(VIDEO_DIR, filename);

    log("[FETCH] Downloading...");
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
        expires: Date.now() + 5 * 60 * 1000
      };
      const downloadUrl = `http://play.leviihosting.shop:${port}/video/${token}`;
      log("[FETCH] Download complete");
      res.json({ status: true, title, downloadUrl, videoUrl });
    });

    writer.on("error", (err) => {
      log("[WRITE ERROR] " + err.message);
      res.status(500).json({ error: "Failed to save video" });
    });
  } catch (err) {
    log("[FETCH ERROR] " + err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.get("/video/:token", (req, res) => {
  const token = req.params.token;
  const data = TEMP_LINKS[token];
  if (!data || Date.now() > data.expires)
    return res.status(404).json({ error: "Link expired or not found" });

  res.sendFile(data.path, (err) => {
    if (err) {
      log("[SEND ERROR] " + err.message);
      res.status(500).json({ error: "Failed to send video" });
    } else {
      log("[SEND] Video sent");
    }
  });
});

app.listen(port, () => {
  log(`Server running at http://localhost:${port}`);
});