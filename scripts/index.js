const cron = require('node-cron');
const { findDeadLinks } = require('../src/func');
const { postMessage, postFile } = require('../src/traqapi');

const main = async () => {
  postMessage(`Started checking deadlinks.(${process.env.WORK_ENV})`);
  try {
    const deadLinks = await findDeadLinks();
    await postFile();
    await postMessage(`Finished checking deadlinks. ${Object.keys(deadLinks).length} pages include deadlinks.`);
  } catch (err) {
    await postMessage(`Error Found!\n\n${err}`);
    throw err;
  }
};

//デプロイ時
main();

//半年に1回実行
cron.schedule('0 0 1 */6 *', () => {
  main();
});
