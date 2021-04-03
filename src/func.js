// process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

const fs = require('fs-extra');
const path = require('path');
const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
const Sitemapper = require('sitemapper');
const { Semaphore } = require('await-semaphore');

const SITEMAP_PAGES_URL = 'https://trap.jp/sitemap-pages.xml';
const SITEMAP_POSTS_URL = 'https://trap.jp/sitemap-posts.xml';
const INTERVAL_MS = 5000;
const SEMAPHORE_COUNT = 3;
const sitemap = new Sitemapper();
const fetchSema = new Semaphore(5);
const crawlSema = new Semaphore(SEMAPHORE_COUNT);
const pages = [];
let deadLinks = {};

exports.findDeadLinks = async () => {
  // 1. initialize
  deadLinks = {};
  const { sites: pages_urls } = await sitemap.fetch(SITEMAP_PAGES_URL);
  const { sites: posts_urls } = await sitemap.fetch(SITEMAP_POSTS_URL);
  const urls = pages_urls.concat(posts_urls);
  // 2. open a new browser and tabs;
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  for (let i = 0; i < SEMAPHORE_COUNT; i++) {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      if (r.resourceType() !== 'document') {
        return r.abort();
      }
      return r.continue();
    });
    pages.push({ page: page, using: false });
  }
  // 3. crawl links
  console.log(`Start checking ${urls.length} pages...`);
  await Promise.all(urls.map((url) => crawlLink(url)));
  // 4. close the browser
  await browser.close();
  // 5. recheck errored links
  for (const key of Object.keys(deadLinks)) {
    const links = deadLinks[key].links;
    if (links) {
      const refetchedLinks = await Promise.all(links.map((elm) => refetchLink(elm)));
      const dl = refetchedLinks.filter((link) => link !== null);
      if (dl.length > 0) {
        deadLinks[key].links = dl;
        continue;
      }
      delete deadLinks[key];
    }
  }
  //6. output to json file
  await fs.outputJSON(path.join(__dirname, `../deadLinks.json`), deadLinks, { spaces: '\t' });
  console.log('Finished checking.');
  return deadLinks;
};

const crawlLink = async (url) => {
  const release = await crawlSema.acquire();
  const i = usablePageIndex();
  const page = pages[i].page;
  console.log(`Page${i}: Checking ${url}`);
  try {
    await page.goto(url);
  } catch (err) {
    console.log(`Page${i}: Error at ${url}:\n\t${err}`);
    deadLinks[url] = { error: err };
    pages[i].using = false;
    await wait();
    release();
    return url;
  }
  const links = await page.$$eval('article a', (list) => list.map((elm) => elm.href));
  const authors = await page.$$eval('.author-detail > a', (list) => list.map((elm) => elm.href));
  const fetchedLinks = await Promise.all(links.map((link) => fetchLink(link)));
  const dl = fetchedLinks.filter((link) => link !== null);
  if (dl.length > 0) {
    deadLinks[url] = { authors, links: dl };
  }
  pages[i].using = false;
  await wait();
  release();
  return url;
};

const usablePageIndex = () => {
  for (let i = 0; i < SEMAPHORE_COUNT; i++) {
    if (pages[i].using == false) {
      pages[i].using = true;
      return i;
    }
  }
};

const fetchLink = async (link) => {
  const release = await fetchSema.acquire();
  if (link === '' || !link.startsWith('http') || link.includes('/content/images')) {
    release();
    return null;
  }
  try {
    const fetched = await fetch(link, {
      redirect: 'follow',
      follow: 20,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36',
      },
    });
    if (fetched.status === 200) {
      release();
      return null;
    } else {
      console.log(`\tDead Link Found: ${link} ${fetched.status}`);
      release();
      return {
        url: link,
        error: `${fetched.status} ${fetched.statusText}`,
      };
    }
  } catch (err) {
    console.log(`\tError Page Found:, ${link} ${err.code}`);
    release();
    return { url: link, error: `${err.name}: ${err.code}` };
  }
};

const refetchLink = async (elm) => {
  const release = await fetchSema.acquire();
  // 500番台 or 429
  if (elm.error.match(/^(5[0-9]{2}|429)/)) {
    await wait();
    console.log(`    Rechecking ${elm.url}`);
    return await fetchLink(elm.url);
  }
  release();
  return elm;
};

const wait = async (times = 1) => {
  await new Promise((resolve) => {
    setTimeout(resolve, INTERVAL_MS * times);
  });
};
