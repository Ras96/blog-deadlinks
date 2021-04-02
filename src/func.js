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
const sitemap = new Sitemapper();
const semaphore = new Semaphore(5);

const wait = async (times = 1) => {
  await new Promise((resolve) => {
    setTimeout(resolve, INTERVAL_MS * times);
  });
};

const fetchLink = async (link) => {
  const release = await semaphore.acquire();
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
    release();
    if (fetched.status === 200) {
      return null;
    } else {
      console.log('    Dead Link Found:', link, fetched.status);
      return {
        url: link,
        error: `${fetched.status} ${fetched.statusText}`,
      };
    }
  } catch (err) {
    console.log('    Error Page Found:', link, err.code);
    release();
    return { url: link, error: `${err.name}: ${err.code}` };
  }
};

exports.findDeadLinks = async () => {
  const deadLinks = {};
  const { sites: pages_urls } = await sitemap.fetch(SITEMAP_PAGES_URL);
  const { sites: posts_urls } = await sitemap.fetch(SITEMAP_POSTS_URL);
  const urls = pages_urls.concat(posts_urls);

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  page.setRequestInterception(true);
  page.on('request', (r) => {
    if (r.resourceType() !== 'document') {
      return r.abort();
    }
    return r.continue();
  });

  console.log(`Start checking ${urls.length} pages...`);

  // 展開したURL内のaタグを検索
  for (const url of urls) {
    console.log(`Checking ${url}`);
    try {
      await page.goto(url);
    } catch (err) {
      console.log(`  Error Page Found: ${url} ${err.name}`);
      deadLinks[url] = { error: err.name };
      continue;
    }
    await wait();
    const links = await page.$$eval('article a', (list) => list.map((elm) => elm.href));
    const authors = await page.$$eval('.author-detail > a', (list) => list.map((elm) => elm.href));
    const fetchedLinks = await Promise.all(links.map((link) => fetchLink(link)));
    const dl = fetchedLinks.filter((link) => link !== null);
    if (dl.length > 0) {
      deadLinks[url] = { authors, links: dl };
    }
    await wait();
  }

  await browser.close();

  // とりあえず一部のエラーをもう一回調べてみる
  for (const key of Object.keys(deadLinks)) {
    const links = deadLinks[key].links;
    if (links) {
      const refetchedLinks = await Promise.all(
        links.map(async (elm, index) => {
          // 500番台 or 429
          if (elm.error.match(/^(5|429)/)) {
            wait(index);
            console.log(`  Rechecking ${elm.url}`);
            return await fetchLink(elm.url);
          }
          return elm;
        })
      );
      const dl = refetchedLinks.filter((link) => link !== null);
      if (dl.length > 0) {
        deadLinks[key].links = dl;
        continue;
      }
      delete deadLinks[key];
    }
  }

  await fs.outputJSON(path.join(__dirname, `../deadLinks.json`), deadLinks, { spaces: '\t' });
  console.log('Finished checking.');
  return deadLinks;
};
