const path = require('path');
const fs = require('fs-extra');
const FormData = require('form-data');
const fetch = require('node-fetch');
const { Apis } = require('@traptitech/traq');
const token = process.env.TRAQ_ACCESS_TOKEN;
const postChannnel = process.env.TRAQ_POST_CHANNEL;

const api = new Apis({
  accessToken: token,
});

const postMessage = (message) => api.postMessage(postChannnel, { content: message, embed: true });
exports.postMessage = postMessage;

const postFile = async () => {
  const file = fs.readFileSync(path.join(__dirname, '../deadLinks.json'));
  const form = new FormData();
  const url = 'https://q.trap.jp/api/v3/files';
  const now = new Date();
  const year = now.getFullYear();
  const month = ('00' + (now.getMonth() + 1)).slice(-2);
  const date = ('00' + now.getDate()).slice(-2);
  form.append('channelId', postChannnel);
  form.append('file', file, {
    filename: `deadLinks_${year}${month}${date}.json`,
    contentType: 'application/json',
    knownLength: file.length,
  });
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });
  const { id } = await response.json();
  postMessage(`https://q.trap.jp/files/${id}`);
};
exports.postFile = postFile;
