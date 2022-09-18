import { createProxy } from '../lib';
import { createServer, request } from 'http';
import { connect } from 'net';
import ws, { WebSocketServer } from 'ws';
import { Server as _Server } from 'socket.io';
import SSE from 'sse';
import { connect as _connect } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import { waitForClosed } from './util';

const io = new _Server();
//
// Expose a port number generator.
// thanks to @3rd-Eden
//
let initialPort = 1024;
const gen = {};
Object.defineProperty(gen, 'port', {
  get: function get() {
    return initialPort++;
  },
});

describe('lib/http-proxy.js', () => {
  describe('#createProxy', () => {
    it.skip('should throw without options', function () {
      let error;
      try {
        createProxy();
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(Error);
    });

    it('should return an object otherwise', () => {
      const obj = createProxy({
        target: 'http://www.google.com:80',
      });

      expect(obj.web).toBeInstanceOf(Function);
      expect(obj.ws).toBeInstanceOf(Function);
      expect(obj.listen).toBeInstanceOf(Function);
    });
  });

  describe('#createProxy with forward options and using web-incoming passes', () => {
    it('should pipe the request using web-incoming#stream method', async () => {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = createProxy({
        forward: 'http://127.0.0.1:' + ports.source,
      }).listen(ports.proxy);

      const source = createServer(function (req, res) {
        res.end();
        source.close();
        // TODO: Why am I having to manually emit the close event for this proxy?
        proxy.close(() => {
          proxy.emit('close');
        });
        expect(req.method).toEqual('GET');
        expect(req.headers.host.split(':')[1]).toEqual(String(ports.proxy));
      });

      source.listen(ports.source);
      request('http://127.0.0.1:' + ports.proxy, function () {}).end();
      await waitForClosed(source, proxy);
    });
  });

  describe('#createProxy using the web-incoming passes', () => {
    it('should proxy sse', async () => {
      const ports = { source: gen.port, proxy: gen.port },
        proxy = createProxy({
          target: 'http://localhost:' + ports.source,
        }),
        proxyServer = proxy.listen(ports.proxy),
        source = createServer(),
        sse = new SSE(source, { path: '/' });

      sse.on('connection', function (client) {
        client.send('Hello over SSE');
        client.close();
      });

      source.listen(ports.source);

      const options = {
        hostname: 'localhost',
        port: ports.proxy,
      };

      const serversClosed = new Promise((resolve) => {
        request(options, function (res) {
          let streamData = '';
          res.on('data', function (chunk) {
            streamData += chunk.toString('utf8');
          });
          res.on('end', function (chunk) {
            expect(streamData).toBe(':ok\n\ndata: Hello over SSE\n\n');
            source.close(() => {
              proxyServer.close(() => {
                resolve();
              });
            });
          });
        }).end();
      });

      await serversClosed;
    });

    it('should make the request on pipe and finish it', async () => {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = createProxy({
        target: 'http://127.0.0.1:' + ports.source,
      }).listen(ports.proxy);

      const serversClosed = new Promise((resolve) => {
        const source = createServer(function (req, res) {
          res.end();
          expect(req.method).toEqual('POST');
          expect(req.headers['x-forwarded-for']).toEqual('127.0.0.1');
          expect(req.headers.host.split(':')[1]).toEqual(String(ports.proxy));
          source.close(() => {
            proxy.close(() => {
              resolve();
            });
          });
        }).listen(ports.source);
      });

      request(
        {
          hostname: '127.0.0.1',
          port: ports.proxy,
          method: 'POST',
          headers: {
            'x-forwarded-for': '127.0.0.1',
          },
        },
        function () {},
      ).end();

      await serversClosed;
    });
  });

  describe('#createProxy using the web-incoming passes', () => {
    it('should make the request, handle response and finish it', async () => {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = createProxy({
        target: 'http://127.0.0.1:' + ports.source,
        preserveHeaderKeyCase: true,
      }).listen(ports.proxy);

      const source = createServer(function (req, res) {
        expect(req.method).toEqual('GET');
        expect(req.headers.host.split(':')[1]).toEqual(String(ports.proxy));
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Hello from ' + source.address().port);
      });

      source.listen(ports.source);

      const serversClosed = new Promise((resolve) => {
        request(
          {
            hostname: '127.0.0.1',
            port: ports.proxy,
            method: 'GET',
          },
          function (res) {
            expect(res.statusCode).toEqual(200);
            expect(res.headers['content-type']).toEqual('text/plain');
            if (res.rawHeaders != undefined) {
              expect(res.rawHeaders.indexOf('Content-Type')).not.toEqual(-1);
              expect(res.rawHeaders.indexOf('text/plain')).not.toEqual(-1);
            }

            res.on('data', function (data) {
              expect(data.toString()).toEqual('Hello from ' + ports.source);
              source.close(() => {
                proxy.close(() => {
                  resolve();
                });
              });
            });
          },
        ).end();
      });

      await serversClosed;
    });
  });

  describe('#createProxy() method with error response', () => {
    it('should make the request and emit the error event', async () => {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = createProxy({
        target: 'http://127.0.0.1:' + ports.source,
      });

      const serversClosed = new Promise((resolve) => {
        proxy.on('error', function (err, req, res) {
          expect(err).toBeInstanceOf(Error);
          expect(err.code).toBe('ECONNREFUSED');
          res.end();
          proxy.close(() => {
            resolve();
          });
        });
      });

      proxy.listen(ports.proxy);

      request(
        {
          hostname: '127.0.0.1',
          port: ports.proxy,
          method: 'GET',
        },
        function () {},
      ).end();

      await serversClosed;
    });
  });

  describe('#createProxy setting the correct timeout value', () => {
    it('should hang up the socket at the timeout', async () => {
      // this.timeout(30);
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = createProxy({
        target: 'http://127.0.0.1:' + ports.source,
        timeout: 3,
      }).listen(ports.proxy);

      proxy.on('error', function (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e.code).toEqual('ECONNRESET');
      });

      const source = createServer(function (req, res) {
        setTimeout(function () {
          res.end('At this point the socket should be closed');
        }, 5);
      });

      source.listen(ports.source);

      const testReq = request(
        {
          hostname: '127.0.0.1',
          port: ports.proxy,
          method: 'GET',
        },
        function () {},
      );

      const serversClosed = new Promise((resolve) => {
        testReq.on('error', function (e) {
          expect(e).toBeInstanceOf(Error);
          expect(e.code).toEqual('ECONNRESET');
          source.close(() => {
            proxy.close(() => {
              resolve();
            });
          });
        });
      });

      testReq.end();

      await serversClosed;
    });
  });

  describe('#createProxy with xfwd option', () => {
    it('should not throw on empty http host header', async () => {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = createProxy({
        forward: 'http://127.0.0.1:' + ports.source,
        xfwd: true,
      }).listen(ports.proxy);

      const serversClosed = new Promise((resolve) => {
        const source = createServer(function (req, res) {
          expect(req.method).toEqual('GET');
          expect(req.headers.host.split(':')[1]).toEqual(String(ports.source));
          res.end();
          source.close(() => {
            proxy.close(() => {
              resolve();
            });
          });
        }).listen(ports.source);
      });

      const socket = connect({ port: ports.proxy }, function () {
        socket.write('GET / HTTP/1.0\r\n\r\n');
      });

      // handle errors
      socket.on('error', function () {
        expect.fail('Unexpected socket error');
      });

      socket.on('data', function (data) {
        socket.end();
      });

      socket.on('end', function () {
        expect('Socket to finish').toBeTruthy();
      });

      await serversClosed;
    });
  });

  // describe('#createProxy using the web-incoming passes', function () {
  //   it('should emit events correctly', function(done) {
  //     var proxy = httpProxy.createProxy({
  //       target: 'http://127.0.0.1:8080'
  //     }),

  //     proxyServer = proxy.listen('8081'),

  //     source = http.createServer(function(req, res) {
  //       expect(req.method).to.eql('GET');
  //       expect(req.headers.host.split(':')[1]).to.eql('8081');
  //       res.writeHead(200, {'Content-Type': 'text/plain'})
  //       res.end('Hello from ' + source.address().port);
  //     }),

  //     events = [];

  //     source.listen('8080');

  //     proxy.ee.on('http-proxy:**', function (uno, dos, tres) {
  //       events.push(this.event);
  //     })

  //     http.request({
  //       hostname: '127.0.0.1',
  //       port: '8081',
  //       method: 'GET',
  //     }, function(res) {
  //       expect(res.statusCode).to.eql(200);

  //       res.on('data', function (data) {
  //         expect(data.toString()).to.eql('Hello from 8080');
  //       });

  //       res.on('end', function () {
  //         expect(events).to.contain('http-proxy:outgoing:web:begin');
  //         expect(events).to.contain('http-proxy:outgoing:web:end');
  //         source.close();
  //         proxyServer.close();
  //         done();
  //       });
  //     }).end();
  //   });
  // });

  describe('#createProxy using the ws-incoming passes', () => {
    it('should proxy the websockets stream', async () => {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = createProxy({
          target: 'ws://127.0.0.1:' + ports.source,
          ws: true,
        }),
        proxyServer = proxy.listen(ports.proxy),
        destiny = new WebSocketServer({ port: ports.source }, function () {
          const client = new ws('ws://127.0.0.1:' + ports.proxy);

          client.on('open', function () {
            client.send('hello there');
          });

          client.on('message', function (msg) {
            expect(msg.toString()).toBe('Hello over websockets');
            client.close();
            proxyServer.close();
            destiny.close();
          });
        });

      destiny.on('connection', function (socket) {
        socket.on('message', function (msg) {
          expect(msg.toString()).toBe('hello there');
          socket.send('Hello over websockets');
        });
      });

      await waitForClosed(proxyServer);
    });

    it('should emit error on proxy error', async () => {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = createProxy({
          // note: we don't ever listen on this port
          target: 'ws://127.0.0.1:' + ports.source,
          ws: true,
        }),
        proxyServer = proxy.listen(ports.proxy),
        client = new ws('ws://127.0.0.1:' + ports.proxy);

      client.on('open', function () {
        client.send('hello there');
      });

      const clientPromise = new Promise((resolve) => {
        client.on('error', function (err) {
          expect(err).toBeInstanceOf(Error);
          expect(err.code).toBe('ECONNRESET');
          resolve();
        });
      });

      const proxyPromise = new Promise((resolve) => {
        proxy.on('error', function (err) {
          expect(err).toBeInstanceOf(Error);
          expect(err.code).toBe('ECONNREFUSED');
          proxyServer.close(() => {
            resolve();
          });
        });
      });

      await clientPromise;
      await proxyPromise;
    });

    it('should close client socket if upstream is closed before upgrade', async () => {
      const ports = { source: gen.port, proxy: gen.port };
      const server = createServer();
      server.on('upgrade', function (req, socket, head) {
        const response = [
          'HTTP/1.1 404 Not Found',
          'Content-type: text/html',
          '',
          '',
        ];
        socket.write(response.join('\r\n'));
        socket.end();
      });
      server.listen(ports.source);

      const proxy = createProxy({
          // note: we don't ever listen on this port
          target: 'ws://127.0.0.1:' + ports.source,
          ws: true,
        }),
        proxyServer = proxy.listen(ports.proxy),
        client = new ws('ws://127.0.0.1:' + ports.proxy);

      client.on('open', function () {
        client.send('hello there');
      });

      const serverClosed = new Promise((resolve) => {
        client.on('error', function (err) {
          expect(err).toBeInstanceOf(Error);
          proxyServer.close(() => {
            resolve();
          });
        });
      });
    });

    it('should proxy a socket.io stream', async () => {
      const ports = { source: gen.port, proxy: gen.port },
        proxy = createProxy({
          target: 'ws://127.0.0.1:' + ports.source,
          ws: true,
        }),
        proxyServer = proxy.listen(ports.proxy),
        server = createServer(),
        destiny = io.listen(server);

      let serversClosed;
      function startSocketIo() {
        const client = _connect('ws://127.0.0.1:' + ports.proxy);

        client.on('connect', function () {
          client.emit('incoming', 'hello there');
        });

        client.on('outgoing', function (data) {
          expect(data).toBe('Hello over websockets');
          serversClosed = new Promise((resolve) => {
            proxyServer.close(() => {
              server.close(() => {
                resolve();
              });
            });
          });
        });
      }

      server.listen(ports.source);
      server.on('listening', startSocketIo);

      destiny.sockets.on('connection', function (socket) {
        socket.on('incoming', function (msg) {
          expect(msg).toBe('hello there');
          socket.emit('outgoing', 'Hello over websockets');
        });
      });

      await serversClosed;
    });

    it('should emit open and close events when socket.io client connects and disconnects', async () => {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = createProxy({
        target: 'ws://127.0.0.1:' + ports.source,
        ws: true,
      });
      const proxyServer = proxy.listen(ports.proxy);
      const server = createServer();
      const destiny = io.listen(server);

      function startSocketIo() {
        const client = _connect('ws://127.0.0.1:' + ports.proxy, {
          rejectUnauthorized: null,
        });
        client.on('connect', function () {
          client.disconnect();
        });
      }

      const serversClosed = new Promise((resolve) => {
        proxyServer.on('close', function () {
          proxyServer.close(() => {
            server.close(() => {
              destiny.close(() => {
                resolve();
              });
            });
          });
        });
      });

      server.listen(ports.source);
      server.on('listening', startSocketIo);
      await serversClosed;
    });

    it('should pass all set-cookie headers to client', async () => {
      const serversClosed = new Promise((resolve) => {
        const ports = { source: gen.port, proxy: gen.port };
        const proxy = createProxy({
            target: 'ws://127.0.0.1:' + ports.source,
            ws: true,
          }),
          proxyServer = proxy.listen(ports.proxy),
          destiny = new WebSocketServer({ port: ports.source }, function () {
            const requestOptions = {
              port: ports.proxy,
              host: '127.0.0.1',
              headers: {
                Connection: 'Upgrade',
                Upgrade: 'websocket',
                Host: 'ws://127.0.0.1',
                'Sec-WebSocket-Version': 13,
                'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
              },
            };

            const req = request(requestOptions);

            req.on('upgrade', function (req, socket, upgradeHead) {
              expect(req.headers['set-cookie'].length).toBe(2);
              socket.end();
            });

            req.on('close', () => {
              proxyServer.close(() => {
                destiny.close(() => {
                  resolve();
                });
              });
            });

            req.end();
          });

        destiny.on('headers', function (headers) {
          headers.push('Set-Cookie: test1=test1');
          headers.push('Set-Cookie: test2=test2');
        });
      });

      await serversClosed;
    });

    it('should detect a proxyReq event and modify headers', async () => {
      const ports = { source: gen.port, proxy: gen.port };

      const proxy = createProxy({
        target: 'ws://127.0.0.1:' + ports.source,
        ws: true,
      });

      proxy.on('proxyReqWs', function (proxyReq, req, socket, options, head) {
        proxyReq.setHeader('X-Special-Proxy-Header', 'foobar');
      });

      const proxyServer = proxy.listen(ports.proxy);

      const destiny = new WebSocketServer({ port: ports.source }, function () {
        const client = new ws('ws://127.0.0.1:' + ports.proxy);

        client.on('open', function () {
          client.send('hello there');
        });

        client.on('message', function (msg) {
          expect(msg.toString()).toBe('Hello over websockets');
          client.close();
          proxyServer.close();
          destiny.close();
        });
      });

      destiny.on('connection', function (socket, upgradeReq) {
        expect(upgradeReq.headers['x-special-proxy-header']).toEqual('foobar');

        socket.on('message', function (msg) {
          expect(msg.toString()).toBe('hello there');
          socket.send('Hello over websockets');
        });
      });

      await waitForClosed(proxyServer);
    });

    it('should forward frames with single frame payload (including on node 4.x)', async () => {
      const payload = Array(65529).join('0');
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = createProxy({
          target: 'ws://127.0.0.1:' + ports.source,
          ws: true,
        }),
        proxyServer = proxy.listen(ports.proxy),
        destiny = new WebSocketServer({ port: ports.source }, function () {
          const client = new ws('ws://127.0.0.1:' + ports.proxy);

          client.on('open', function () {
            client.send(payload);
          });

          client.on('message', function (msg) {
            expect(msg.toString()).toBe('Hello over websockets');
            client.close();
            proxyServer.close();
            destiny.close();
          });
        });

      destiny.on('connection', function (socket) {
        socket.on('message', function (msg) {
          expect(msg.toString()).toBe(payload);
          socket.send('Hello over websockets');
        });
      });

      await waitForClosed(proxyServer);
    });

    it('should forward continuation frames with big payload (including on node 4.x)', async () => {
      const payload = Array(65530).join('0');
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = createProxy({
          target: 'ws://127.0.0.1:' + ports.source,
          ws: true,
        }),
        proxyServer = proxy.listen(ports.proxy),
        destiny = new WebSocketServer({ port: ports.source }, function () {
          const client = new ws('ws://127.0.0.1:' + ports.proxy);

          client.on('open', function () {
            client.send(payload);
          });

          client.on('message', function (msg) {
            expect(msg.toString()).toBe('Hello over websockets');
            client.close();
            proxyServer.close();
            destiny.close();
          });
        });

      destiny.on('connection', function (socket) {
        socket.on('message', function (msg) {
          expect(msg.toString()).toBe(payload);
          socket.send('Hello over websockets');
        });
      });

      await waitForClosed(proxyServer);
    });
  });
});
