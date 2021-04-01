const express = require('express');
const index = require('./index');

const app = express();

app.use('/', index);

app.listen(3000);
