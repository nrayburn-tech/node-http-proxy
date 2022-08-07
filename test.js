const http = require('http');
const { createProxyServer } = require('./lib/http-proxy');
const { createServer, request } = http;

const proxy = createProxyServer({
  target: 'http://127.0.0.1:8080',
});
const proxyServer = createServer((req, res) => {
  proxy.web(req, res);
});

const sourceServer = createServer((req, res) => {
  res.end();
  sourceServer.close();
  proxyServer.close();
});

sourceServer.listen('8080');
proxyServer.listen('8081');

request('http://127.0.0.1:8081').end();
