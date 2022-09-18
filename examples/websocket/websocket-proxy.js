/*
  web-socket-proxy.js: Example of proxying over HTTP and WebSockets.

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

const util = require('util'),
  httpProxy = require('../../lib'),
  io = require('socket.io'),
  client = require('socket.io-client');
const { getPort } = require('../helpers/port');

const proxyPort = getPort();
const targetPort = getPort();

//
// Create the target HTTP server and setup
// socket.io on it.
//
const server = io.listen(targetPort);
server.sockets.on('connection', function (client) {
  util.debug('Got websocket connection');

  client.on('message', function (msg) {
    util.debug('Got message from client: ' + msg);
  });

  client.send('from server');
});

//
// Create a proxy server with node-http-proxy
//
httpProxy
  .createProxy({ target: 'ws://localhost:' + targetPort, ws: true })
  .listen(proxyPort);

//
// Setup the socket.io client against our proxy
//
const ws = client.connect('ws://localhost:' + proxyPort);

ws.on('message', function (msg) {
  util.debug('Got message: ' + msg);
  ws.send('I am the client');
});
