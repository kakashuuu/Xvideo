const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Xvideos API is working!');
});

// 1. Search videos
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Query missing' });

  const url = `https://www.xvideos.com/?k=${encodeURIComponent(query)}`;
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const results = [];
    $('div.mozaique > div').each((i, el) => {
      const title = $(el).find('p.title a').text().trim();
      const link = 'https://www.xvideos.com' + $(el).find('p.title a').attr('href');
      const thumb = $(el).find('div.thumb img').attr('data-src') || $(el).find('div.thumb img').attr('src');
      if (title && link && thumb) {
        results.push({ title, link, thumb });
      }
    });

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch search results' });
  }
});

// 2. Get video info
app.get('/api/video', async (req, res) => {
  const url = req.query.url;
  if (!url || !url.includes('xvideos.com/video')) return res.status(400).json({ error: 'Invalid video URL' });

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    const video = await page.evaluate(() => {
      const title = document.querySelector('h2.page-title').innerText.trim();
      const videoUrl = document.querySelector('video')?.getAttribute('src');
      const thumbnail = document.querySelector('meta[property="og:image"]')?.content;
      return { title, videoUrl, thumbnail };
    });

    await browser.close();

    if (!video.videoUrl) return res.status(404).json({ error: 'Video URL not found' });

    res.json({ success: true, ...video });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch video' });
  }
});

// 3. Force download
app.get('/api/download', async (req, res) => {
  const url = req.query.url;
  if (!url || !url.includes('xvideos.com/video')) return res.status(400).json({ error: 'Invalid video URL' });

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    const videoUrl = await page.evaluate(() => document.querySelector('video')?.getAttribute('src'));
    await browser.close();

    if (!videoUrl) return res.status(404).json({ error: 'Video URL not found' });

    res.setHeader('Content-Disposition', 'attachment; filename=video.mp4');
    res.setHeader('Content-Type', 'video/mp4');

    const stream = await axios({
      url: videoUrl,
      method: 'GET',
      responseType: 'stream',
    });

    stream.data.pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Download failed' });
  }
});

// Listen on all IPs
app.listen(1000, '0.0.0.0', () => {
  console.log('Xvideos API running on http://0.0.0.0:1000');
});
