const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const mime = require('mime-types');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 9000;
const HOST = '129.146.180.197'; // Your VPS IP

app.get('/', (req, res) => {
  res.send('Xvideos API is working!');
});

// Search Endpoint
app.get('/search', async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'Missing ?query=' });

  const searchUrl = `https://www.xvideos.com/?k=${encodeURIComponent(query)}`;
  try {
    const { data } = await axios.get(searchUrl);
    const $ = cheerio.load(data);
    const results = [];

    $('div.thumb-block').each((i, el) => {
      const title = $(el).find('.title a').text().trim();
      const url = 'https://www.xvideos.com' + $(el).find('.title a').attr('href');
      const thumb = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
      if (title && url) results.push({ title, url, thumb });
    });

    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch search results' });
  }
});

// Download Link Generator
app.get('/download', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing ?url=' });

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    const videoSrc = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video ? video.src : null;
    });

    await browser.close();

    if (!videoSrc) return res.status(404).json({ error: 'Video URL not found' });

    const ext = mime.extension(mime.lookup(videoSrc) || 'video/mp4');
    const filename = `${uuidv4()}.${ext}`;
    const filePath = path.join(__dirname, 'downloads', filename);

    const writer = fs.createWriteStream(filePath);
    const response = await axios.get(videoSrc, { responseType: 'stream' });

    response.data.pipe(writer);

    writer.on('finish', () => {
      const downloadLink = `http://${HOST}:${PORT}/file/${filename}`;
      res.json({ title: path.basename(url), download: downloadLink });
    });

    writer.on('error', () => {
      res.status(500).json({ error: 'Failed to download video' });
    });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong', details: err.message });
  }
});

// Serve File with Force Download
app.get('/file/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'downloads', req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found');

  res.download(filePath, (err) => {
    if (!err) {
      fs.unlinkSync(filePath); // Delete after download
    }
  });
});

// Create downloads folder if doesn't exist
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

app.listen(PORT, HOST, () => {
  console.log(`Xvideos API running on http://${HOST}:${PORT}`);
});
