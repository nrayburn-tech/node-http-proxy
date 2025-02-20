/*
  reverse-proxy.js: Example of reverse proxying (with HTTPS support)
  Copyright (c) 2015 Alberto Pose <albertopose@gmail.com>

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
  net = require('net'),
  httpProxy = require('../../dist'),
  url = require('url');
const { getPort } = require('../helpers/port');

const proxy = httpProxy.createProxy();

const server = http
  .createServer(function (req, res) {
    console.log('Receiving reverse proxy request for:' + req.url);
    const parsedUrl = url.parse(req.url);
    const target = parsedUrl.protocol + '//' + parsedUrl.hostname;
    proxy.web(req, res, { target: target, secure: false });
  })
  .listen(getPort());

server.on('connect', function (req, socket) {
  console.log('Receiving reverse proxy request for:' + req.url);

  const serverUrl = url.parse('https://' + req.url);

  const srvSocket = net.connect(
    serverUrl.port,
    serverUrl.hostname,
    function () {
      socket.write(
        'HTTP/1.1 200 Connection Established\r\n' +
          'Proxy-agent: Node-Proxy\r\n' +
          '\r\n',
      );
      srvSocket.pipe(socket);
      socket.pipe(srvSocket);
    },
  );
});

// Test with:
// curl -vv -x http://127.0.0.1:8213 https://www.google.com
// curl -vv -x http://127.0.0.1:8213 http://www.google.com
