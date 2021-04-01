const path = require('path');
const fs = require('fs-extra');
const cron = require('node-cron');
const router = require('express').Router();
const { findDeadLinks } = require('../src/func');
const { postMessage } = require('../src/traqapi');

let deadLinks = {};
const localDeadLinks = JSON.parse(fs.readFileSync(path.join(__dirname, '../deadLinks.json')));

const main = async () => {
  await postMessage(`Started checking deadlinks.(${process.env.WORK_ENV})`);
  try {
    deadLinks = await findDeadLinks();
  } catch (err) {
    postMessage(`Error Found!\n\n${err}`);
  }
  await postMessage('Finished checking deadlinks. Check this!\nhttps://ras.trap.show/blog-deadlink/');
};

//デプロイ時
main();

//1か月に1回実行
cron.schedule('0 0 1 * *', () => {
  main();
});

// GET 最新のリンク切れを取得
router.get('/', (_req, res) => {
  res.send(deadLinks);
});
router.get('/local', (_req, res) => {
  res.send(localDeadLinks);
});
module.exports = router;
