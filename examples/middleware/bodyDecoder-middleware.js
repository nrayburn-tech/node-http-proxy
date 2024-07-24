/*
  bodyDecoder-middleware.js: Basic example of `connect.bodyParser()` middleware in http-proxy

  Copyright (c) 2013 - 2016 Charlie Robbins, Jarrett Cruger & the Contributors.

  Permission is hereby granted, free of charge, to any person obtaining
  a copy of this software and associated documentation files (the
  "Software"), to deal in the Software without restriction, including
  without limitation the rights to use, copy, modify, merge, publish,
  distribute, sublicense, and/or sell copies of the Software, and to
  permit persons to whom the Software is furnished to do so, subject to
  the following conditions:

  The above copyright notice and this permission notice shall be
  included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
  NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
  LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
  OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
  WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

const http = require('http'),
  connect = require('connect'),
  queryString = require('querystring'),
  bodyParser = require('body-parser'),
  httpProxy = require('../../dist'),
  proxy = httpProxy.createProxy({});
const { getPort } = require('../helpers/port');

//restream parsed body before proxying
proxy.on('proxyReq', function (proxyReq, req, res, options) {
  if (!req.body || !Object.keys(req.body).length) {
    return;
  }

  const contentType = proxyReq.getHeader('Content-Type');
  let bodyData;

  if (contentType === 'application/json') {
    bodyData = JSON.stringify(req.body);
  }

  if (contentType === 'application/x-www-form-urlencoded') {
    bodyData = queryString.stringify(req.body);
  }

  if (bodyData) {
    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
    proxyReq.write(bodyData);
  }
});

const proxyPort = getPort();
const targetPort = getPort();
//
//  Basic Http Proxy Server
//
const app = connect()
  .use(bodyParser.json()) //json parser
  .use(bodyParser.urlencoded({ extended: true })) //urlencoded parser
  .use(function (req, res) {
    // modify body here,
    // eg: req.body = {a: 1}.
    console.log('proxy body:', req.body);
    proxy.web(req, res, {
      target: 'http://127.0.0.1:' + targetPort,
    });
  });

http.createServer(app).listen(proxyPort);

//
//  Target Http Server
//
const app1 = connect()
  .use(bodyParser.json())
  .use(function (req, res) {
    console.log('app1:', req.body);
    res.end(
      'request successfully proxied to: ' +
        req.url +
        '\n' +
        JSON.stringify(req.headers, true, 2),
    );
  });
http.createServer(app1).listen(targetPort, function () {
  //request to 8013 to proxy
  fetch('http://127.0.0.1:' + proxyPort, {
    method: 'POST',
    body: JSON.stringify({ content: 123, type: 'greeting from json request' }),
  })
    .then((response) => {
      return response.text();
    })
    .then((data) => {
      console.log('return for json request:', data);
    })
    .catch((err) => {
      console.error(err);
    });

  // application/x-www-form-urlencoded request
  fetch('http://127.0.0.1:' + proxyPort, {
    method: 'POST',
    body: new URLSearchParams({
      content: 123,
      type: 'greeting from urlencoded request',
    }),
  })
    .then((response) => {
      return response.text();
    })
    .then((data) => {
      console.log('return for urlencoded request:', data);
    })
    .catch((err) => {
      console.error(err);
    });
});
