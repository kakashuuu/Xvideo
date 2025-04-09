const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const https = require('https');
const http = require('http');

const app = express();
const BASE_URL = 'https://www.xvideos.com';

// Endpoint 1: Search videos
app.get('/api/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing query parameter ?q=' });

    try {
        const searchUrl = `${BASE_URL}/?k=${encodeURIComponent(q)}`;
        const { data } = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const $ = cheerio.load(data);
        const results = [];

        $('.thumb-block').each((i, el) => {
            const title = $(el).find('.title').text().trim();
            const href = $(el).find('a').attr('href');
            const link = href ? BASE_URL + href : null;
            const thumbnail = $(el).find('img').attr('data-src');
            const duration = $(el).find('.duration').text().trim();

            if (title && link) {
                results.push({ title, link, thumbnail, duration });
            }
        });

        res.json({ results });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch search results', details: err.message });
    }
});

// Endpoint 2: Get video details (title, video src, thumbnail)
app.get('/api/video', async (req, res) => {
    const { url } = req.query;
    if (!url || !url.startsWith(BASE_URL)) {
        return res.status(400).json({ error: 'Invalid or missing ?url parameter' });
    }

    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        const videoData = await page.evaluate(() => {
            const title = document.querySelector('h2.page-title')?.innerText;
            const video = document.querySelector('video#html5video');
            const src = video?.querySelector('source')?.src;
            const poster = video?.getAttribute('poster');
            const duration = document.querySelector('.video-duration')?.innerText;
            return { title, video: src, poster, duration };
        });

        await browser.close();

        if (!videoData.video) {
            return res.status(404).json({ error: 'Video not found on page' });
        }

        res.json(videoData);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to extract video', details: err.message });
    }
});

// Endpoint 3: Force video download
app.get('/api/download', async (req, res) => {
    const { url } = req.query;
    if (!url || !url.startsWith(BASE_URL)) {
        return res.status(400).json({ error: 'Invalid or missing ?url parameter' });
    }

    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        const videoUrl = await page.evaluate(() => {
            const video = document.querySelector('video#html5video');
            return video?.querySelector('source')?.src;
        });

        await browser.close();

        if (!videoUrl) return res.status(404).json({ error: 'Video URL not found' });

        const fileName = `xvideos_${Date.now()}.mp4`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'video/mp4');

        const protocol = videoUrl.startsWith('https') ? https : http;
        protocol.get(videoUrl, (stream) => {
            stream.pipe(res);
        }).on('error', (err) => {
            res.status(500).json({ error: 'Failed to stream video', details: err.message });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to prepare download', details: err.message });
    }
});

app.listen(1000, () => {
    console.log('Xvideos API running on http://localhost:1000');
});
