import { setupOutgoing, setupSocket } from '../lib/common';
import { parse } from 'url';
import { describe, expect, it } from 'vitest';
import https from 'https';
import { Socket } from 'node:net';
import http from 'node:http';
import { ResolvedProxyServerOptions } from '../lib/proxyServer';

describe('lib/common.ts', () => {
  describe('#setupOutgoing', () => {
    it('should setup the correct headers', () => {
      const outgoing: https.RequestOptions = {};
      setupOutgoing(
        outgoing,
        {
          agent: '?',
          target: {
            host: 'hey',
            hostname: 'how',
            socketPath: 'are',
            port: 'you',
          },
          headers: { fizz: 'bang', overwritten: true },
          localAddress: 'local.address',
          auth: 'username:pass',
        } as unknown as ResolvedProxyServerOptions,
        {
          method: 'i',
          url: 'am',
          headers: { pro: 'xy', overwritten: false },
        } as unknown as http.IncomingMessage,
      );

      expect(outgoing.host).toEqual('hey');
      expect(outgoing.hostname).toEqual('how');
      expect(outgoing.socketPath).toEqual('are');
      expect(outgoing.port).toEqual('you');
      expect(outgoing.agent).toEqual('?');

      expect(outgoing.method).toEqual('i');
      expect(outgoing.path).toEqual('am');

      expect(outgoing.headers?.pro).toEqual('xy');
      expect(outgoing.headers?.fizz).toEqual('bang');
      expect(outgoing.headers?.overwritten).toEqual(true);
      expect(outgoing.localAddress).toEqual('local.address');
      expect(outgoing.auth).toEqual('username:pass');
    });

    it('should not override agentless upgrade header', () => {
      const outgoing: https.RequestOptions = {};
      setupOutgoing(
        outgoing,
        {
          agent: undefined,
          target: {
            host: 'hey',
            hostname: 'how',
            socketPath: 'are',
            port: 'you',
          },
          headers: { connection: 'upgrade' },
        },
        {
          method: 'i',
          url: 'am',
          headers: { pro: 'xy', overwritten: false },
        } as unknown as http.IncomingMessage,
      );
      expect(outgoing.headers?.connection).toEqual('upgrade');
    });

    it('should not override agentless connection: contains upgrade', () => {
      const outgoing: https.RequestOptions = {};
      setupOutgoing(
        outgoing,
        {
          agent: undefined,
          target: {
            host: 'hey',
            hostname: 'how',
            socketPath: 'are',
            port: 'you',
          },
          headers: { connection: 'keep-alive, upgrade' }, // this is what Firefox sets
        },
        {
          method: 'i',
          url: 'am',
          headers: { pro: 'xy', overwritten: false },
        } as unknown as http.IncomingMessage,
      );
      expect(outgoing.headers?.connection).toEqual('keep-alive, upgrade');
    });

    it('should override agentless connection: contains improper upgrade', () => {
      // sanity check on upgrade regex
      const outgoing: https.RequestOptions = {};
      setupOutgoing(
        outgoing,
        {
          agent: undefined,
          target: {
            host: 'hey',
            hostname: 'how',
            socketPath: 'are',
            port: 'you',
          },
          headers: { connection: 'keep-alive, not upgrade' },
        },
        {
          method: 'i',
          url: 'am',
          headers: { pro: 'xy', overwritten: false },
        } as unknown as http.IncomingMessage,
      );
      expect(outgoing.headers?.connection).toEqual('close');
    });

    it('should override agentless non-upgrade header to close', () => {
      const outgoing: https.RequestOptions = {};
      setupOutgoing(
        outgoing,
        {
          agent: undefined,
          target: {
            host: 'hey',
            hostname: 'how',
            socketPath: 'are',
            port: 'you',
          },
          headers: { connection: 'xyz' },
        },
        {
          method: 'i',
          url: 'am',
          headers: { pro: 'xy', overwritten: false },
        } as unknown as http.IncomingMessage,
      );
      expect(outgoing.headers?.connection).toEqual('close');
    });

    it('should set the agent to false if none is given', () => {
      const outgoing: https.RequestOptions = {};
      setupOutgoing(
        outgoing,
        { target: 'http://localhost' } as unknown as ResolvedProxyServerOptions,
        { url: '/' } as http.IncomingMessage,
      );
      expect(outgoing.agent).toEqual(false);
    });

    it('set the port according to the protocol', () => {
      const outgoing: https.RequestOptions = {};
      setupOutgoing(
        outgoing,
        {
          agent: '?',
          target: {
            host: 'how',
            hostname: 'are',
            socketPath: 'you',
            protocol: 'https:',
          },
        },
        {
          method: 'i',
          url: 'am',
          headers: { pro: 'xy' },
        } as unknown as http.IncomingMessage,
      );

      expect(outgoing.host).toEqual('how');
      expect(outgoing.hostname).toEqual('are');
      expect(outgoing.socketPath).toEqual('you');
      expect(outgoing.agent).toEqual('?');

      expect(outgoing.method).toEqual('i');
      expect(outgoing.path).toEqual('am');
      expect(outgoing.headers?.pro).toEqual('xy');

      expect(outgoing.port).toEqual(443);
    });

    it('should keep the original target path in the outgoing path', () => {
      const outgoing: https.RequestOptions = {};
      setupOutgoing(outgoing, { target: { path: 'some-path' } }, {
        url: 'am',
      } as http.IncomingMessage);

      expect(outgoing.path).toEqual('some-path/am');
    });

    it('should keep the original forward path in the outgoing path', () => {
      const outgoing: https.RequestOptions = {};
      setupOutgoing(
        outgoing,
        {
          target: {},
          forward: {
            path: 'some-path',
          },
        },
        {
          url: 'am',
        } as http.IncomingMessage,
        'forward',
      );

      expect(outgoing.path).toEqual('some-path/am');
    });

    it('should properly detect https/wss protocol without the colon', () => {
      const outgoing: https.RequestOptions = {};
      setupOutgoing(
        outgoing,
        {
          target: {
            protocol: 'https',
            host: 'whatever.com',
          },
        },
        { url: '/' } as http.IncomingMessage,
      );

      expect(outgoing.port).toEqual(443);
    });

    it('should not prepend the target path to the outgoing path with prependPath = false', () => {
      const outgoing: https.RequestOptions = {};
      setupOutgoing(
        outgoing,
        {
          target: { path: 'hellothere' },
          prependPath: false,
        },
        { url: 'hi' } as http.IncomingMessage,
      );

      expect(outgoing.path).toEqual('hi');
    });

    it('should properly join paths', () => {
      const outgoing: https.RequestOptions = {};
      setupOutgoing(
        outgoing,
        {
          target: { path: '/forward' },
        },
        { url: '/static/path' } as http.IncomingMessage,
      );

      expect(outgoing.path).toEqual('/forward/static/path');
    });

    it('should not modify the query string', () => {
      const outgoing: https.RequestOptions = {};
      setupOutgoing(
        outgoing,
        {
          target: { path: '/forward' },
        },
        {
          url: '/?foo=bar//&target=http://foobar.com/?a=1%26b=2&other=2',
        } as http.IncomingMessage,
      );

      expect(outgoing.path).toEqual(
        '/forward/?foo=bar//&target=http://foobar.com/?a=1%26b=2&other=2',
      );
    });

    //
    // This is the proper failing test case for the common.join problem
    //
    it('should correctly format the toProxy URL', () => {
      const outgoing: https.RequestOptions = {};
      const google = 'https://google.com';
      setupOutgoing(
        outgoing,
        {
          target: parse('http://sometarget.com:80'),
          toProxy: true,
        },
        { url: google } as http.IncomingMessage,
      );

      expect(outgoing.path).toEqual('/' + google);
    });

    it('should not replace : to :\\ when no https word before', () => {
      const outgoing: https.RequestOptions = {};
      const google = 'https://google.com:/join/join.js';
      setupOutgoing(
        outgoing,
        {
          target: parse('http://sometarget.com:80'),
          toProxy: true,
        },
        { url: google } as http.IncomingMessage,
      );

      expect(outgoing.path).toEqual('/' + google);
    });

    it('should not replace : to :\\ when no http word before', () => {
      const outgoing: https.RequestOptions = {};
      const google = 'http://google.com:/join/join.js';
      setupOutgoing(
        outgoing,
        {
          target: parse('http://sometarget.com:80'),
          toProxy: true,
        },
        { url: google } as http.IncomingMessage,
      );

      expect(outgoing.path).toEqual('/' + google);
    });

    describe('when using ignorePath', () => {
      it('should ignore the path of the `req.url` passed in but use the target path', () => {
        const outgoing: https.RequestOptions = {};
        const myEndpoint = 'https://whatever.com/some/crazy/path/whoooo';
        setupOutgoing(
          outgoing,
          {
            target: parse(myEndpoint),
            ignorePath: true,
          },
          { url: '/more/crazy/pathness' } as http.IncomingMessage,
        );

        expect(outgoing.path).toEqual('/some/crazy/path/whoooo');
      });

      it('and prependPath: false, it should ignore path of target and incoming request', () => {
        const outgoing: https.RequestOptions = {};
        const myEndpoint = 'https://whatever.com/some/crazy/path/whoooo';
        setupOutgoing(
          outgoing,
          {
            target: parse(myEndpoint),
            ignorePath: true,
            prependPath: false,
          },
          { url: '/more/crazy/pathness' } as http.IncomingMessage,
        );

        expect(outgoing.path).toEqual('');
      });
    });

    describe('when using changeOrigin', () => {
      it('should correctly set the port to the host when it is a non-standard port using url.parse', () => {
        const outgoing: https.RequestOptions = {};
        const myEndpoint = 'https://myCouch.com:6984';
        setupOutgoing(
          outgoing,
          {
            target: parse(myEndpoint),
            changeOrigin: true,
          },
          { url: '/' } as http.IncomingMessage,
        );

        expect(outgoing.headers?.host).toEqual('mycouch.com:6984');
      });

      it('should correctly set the port to the host when it is a non-standard port when setting host and port manually (which ignores port)', () => {
        const outgoing: https.RequestOptions = {};
        setupOutgoing(
          outgoing,
          {
            target: {
              protocol: 'https:',
              host: 'mycouch.com',
              port: 6984,
            },
            changeOrigin: true,
          },
          { url: '/' } as http.IncomingMessage,
        );
        expect(outgoing.headers?.host).toEqual('mycouch.com:6984');
      });
    });

    it('should pass through https client parameters', () => {
      const outgoing: https.RequestOptions = {};
      setupOutgoing(
        outgoing,
        {
          agent: '?',
          target: {
            host: 'how',
            hostname: 'are',
            socketPath: 'you',
            protocol: 'https:',
            pfx: 'my-pfx',
            key: 'my-key',
            passphrase: 'my-passphrase',
            cert: 'my-cert',
            ca: 'my-ca',
            ciphers: 'my-ciphers',
            secureProtocol: 'my-secure-protocol',
          },
        },
        {
          method: 'i',
          url: 'am',
        } as http.IncomingMessage,
      );

      expect(outgoing.pfx).toEqual('my-pfx');
      expect(outgoing.key).toEqual('my-key');
      expect(outgoing.passphrase).toEqual('my-passphrase');
      expect(outgoing.cert).toEqual('my-cert');
      expect(outgoing.ca).toEqual('my-ca');
      expect(outgoing.ciphers).toEqual('my-ciphers');
      expect(outgoing.secureProtocol).toEqual('my-secure-protocol');
    });

    it('should handle overriding the `method` of the http request', () => {
      const outgoing: https.RequestOptions = {};
      setupOutgoing(
        outgoing,
        {
          target: parse('https://whooooo.com'),
          method: 'POST',
        },
        { method: 'GET', url: '' } as http.IncomingMessage,
      );

      expect(outgoing.method).toEqual('POST');
    });

    // url.parse('').path => null
    it('should not pass null as last arg to #urlJoin', () => {
      const outgoing: https.RequestOptions = {};
      setupOutgoing(outgoing, { target: { path: '' } }, {
        url: '',
      } as http.IncomingMessage);

      expect(outgoing.path).toBe('');
    });
  });

  describe('#setupSocket', () => {
    it('should setup a socket', () => {
      const socketConfig: {
          timeout: number | null;
          nodelay: boolean | undefined;
          keepalive: boolean | undefined;
        } = {
          timeout: null,
          nodelay: false,
          keepalive: false,
        },
        stubSocket = {
          setTimeout: function (num) {
            socketConfig.timeout = num;
          },
          setNoDelay: function (bol) {
            socketConfig.nodelay = bol;
          },
          setKeepAlive: function (bol) {
            socketConfig.keepalive = bol;
          },
        } as Socket;
      setupSocket(stubSocket);

      expect(socketConfig.timeout).toEqual(0);
      expect(socketConfig.nodelay).toEqual(true);
      expect(socketConfig.keepalive).toEqual(true);
    });
  });
});
