/*
  modifyBody-middleware.js: Example of middleware which modifies response

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
  app = connect(),
  httpProxy = require('../../dist');
const { getPort } = require('../helpers/port');

const proxyPort = getPort();
const targetPort = getPort();
//
// Basic Connect App
//
app.use(function (req, res, next) {
  const _write = res.write;

  res.write = function (data) {
    _write.call(res, data.toString().replace('Ruby', 'http-party'));
  };
  next();
});

app.use(function (req, res) {
  proxy.web(req, res);
});

http.createServer(app).listen(proxyPort);

//
// Basic Http Proxy Server
//
const proxy = httpProxy.createProxy({
  target: 'http://localhost:' + targetPort,
});

//
// Target Http Server
//
http
  .createServer(function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello, I love Ruby\n');
  })
  .listen(targetPort);

console.log('http proxy server started on port ' + proxyPort);
console.log('http server started on port ' + targetPort);
