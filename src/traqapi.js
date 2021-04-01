const request = require('request');
const crypto = require('crypto');

const URL = process.env.TRAQ_WEBHOOK_URL;
const secret = process.env.TRAQ_WEBHOOK_SECRET ? '' : 'secret';

const calcHMACSHA1 = (message, secret) => {
  return crypto.createHmac('sha1', secret).update(message).digest('hex');
};

const options = (message) => ({
  uri: URL,
  headers: {
    'Content-Type': 'text/plain',
    'X-TRAQ-Signature': calcHMACSHA1(message, secret),
    'X-TRAQ-Channel-Id': '82b9f8ad-17d9-4597-88f1-0375247a2487',
  },
  body: message,
});

exports.postMessage = (message) => {
  console.log(message);
  return request.post(options(message));
};
