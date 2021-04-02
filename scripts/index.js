const { findDeadLinks } = require('../src/func');
const { postMessage, postFile } = require('../src/traqapi');

const main = async () => {
  postMessage(`Started checking deadlinks.(${process.env.WORK_ENV})`);
  try {
    const deadLinks = await findDeadLinks();
    await postFile();
    await postMessage(`Finished checking deadlinks. ${Object.keys(deadLinks).length} pages include deadlinks.`);
    return;
  } catch (err) {
    await postMessage(`Error Found!\n\n${err}`);
    throw err;
  }
};

// 実行
main();
