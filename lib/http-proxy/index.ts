import http, {
  IncomingMessage,
  Server as HttpServer,
  ServerResponse,
} from 'http';
import https from 'https';
import { Duplex } from 'stream';
import { parse as parse_url } from 'url';
import EE3 from 'eventemitter3';
import * as web from './passes/web-incoming';
import * as ws from './passes/ws-incoming';
import { ServerOptions } from '../types';

export type WebErrorCallback = (
  err: Error,
  req: IncomingMessage,
  res: ServerResponse,
  url: ServerOptions['target'],
) => void;
export type WebSocketErrorCallback = (
  err: Error,
  req: IncomingMessage,
  socket: Duplex,
) => void;

export type WebProxyHandler = (
  this: ProxyServerNew,
  req: IncomingMessage,
  res: ServerResponse,
  optionsOrCallback?: ServerOptions | WebErrorCallback,
  callback?: WebErrorCallback,
) => void;
export type WebSocketProxyHandler = (
  this: ProxyServerNew,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  optionsOrCallback?: ServerOptions | WebSocketErrorCallback,
  callback?: WebSocketErrorCallback,
) => void;

export type WebIncomingPass = (
  this: ProxyServerNew,
  req: IncomingMessage,
  res: ServerResponse,
  options: ServerOptions,
  server: ProxyServerNew,
  errorCallback?: WebErrorCallback,
) => boolean | unknown;
export type WebSocketIncomingPass = (
  this: ProxyServerNew,
  req: IncomingMessage,
  socket: Duplex,
  options: ServerOptions,
  head: Buffer,
  server: ProxyServerNew,
  errorCallback?: WebSocketErrorCallback,
) => boolean | unknown;
export type WebOutgoingPass = (
  this: ProxyServerNew,
  req: IncomingMessage,
  res: ServerResponse,
  proxyRes: IncomingMessage,
  options: ServerOptions,
  server: ProxyServerNew,
) => boolean | unknown;

/**
 * Creates a web request handler for the Proxy.
 *
 * @internal
 */
function createWebProxy(options: ServerOptions): WebProxyHandler {
  return function (
    this: ProxyServerNew,
    req: IncomingMessage,
    res: ServerResponse,
    optionsOrCallback?: ServerOptions | WebErrorCallback,
    callback?: WebErrorCallback,
  ) {
    const requestOptions =
      typeof optionsOrCallback === 'function' ? {} : optionsOrCallback ?? {};
    const errorCallback =
      typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;

    const finalOptions = Object.assign({}, options, requestOptions);

    const passes = this.webPasses;
    (['target', 'forward'] as const).forEach(function (e) {
      if (typeof finalOptions[e] === 'string')
        finalOptions[e] = parse_url(finalOptions[e] as string);
    });

    if (!finalOptions.target && !finalOptions.forward) {
      this.emit('error', new Error('Must provide a proper URL as target'));
      return;
    }

    for (let i = 0; i < passes.length; i++) {
      if (
        (passes[i] as WebIncomingPass).call(
          this,
          req,
          res,
          finalOptions,
          this,
          errorCallback,
        )
      ) {
        // passes can return a truthy value to halt the loop
        break;
      }
    }
  };
}

/**
 * Creates a websocket request handler for the Proxy.
 *
 * @internal
 */
function createWebSocketProxy(options: ServerOptions): WebSocketProxyHandler {
  return function (
    this: ProxyServerNew,
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    optionsOrCallback?: ServerOptions | WebSocketErrorCallback,
    callback?: WebSocketErrorCallback,
  ) {
    const requestOptions =
      typeof optionsOrCallback === 'function' ? {} : optionsOrCallback ?? {};
    const errorCallback =
      typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;

    const finalOptions = Object.assign({}, options, requestOptions);

    const passes = this.wsPasses;
    (['target', 'forward'] as const).forEach(function (e) {
      if (typeof finalOptions[e] === 'string')
        finalOptions[e] = parse_url(finalOptions[e] as string);
    });

    if (!finalOptions.target && !finalOptions.forward) {
      this.emit('error', new Error('Must provide a proper URL as target'));
      return;
    }

    for (let i = 0; i < passes.length; i++) {
      if (
        passes[i].call(
          this,
          req,
          socket,
          finalOptions,
          head,
          this,
          errorCallback,
        )
      ) {
        // passes can return a truthy value to halt the loop
        break;
      }
    }
  };
}

export class ProxyServerNew extends EE3 {
  options: ServerOptions;
  web: WebProxyHandler;
  ws: WebSocketProxyHandler;
  webPasses: WebIncomingPass[];
  wsPasses: WebSocketIncomingPass[];

  _server: HttpServer | undefined;

  constructor(options: ServerOptions) {
    super();
    options = options || {};
    options.prependPath = options.prependPath !== false;

    this.web = createWebProxy(options);
    this.ws = createWebSocketProxy(options);
    this.options = options;

    this.webPasses = [web.deleteLength, web.timeout, web.XHeaders, web.stream];
    this.wsPasses = [ws.checkMethodAndHeader, ws.XHeaders, ws.stream];

    this.on('error', this.onError, this);
  }

  // TODO: Tests for `after` and `before`.
  after<T extends WebIncomingPass | WebSocketIncomingPass>(
    type: 'web' | 'ws',
    passName: string,
    callback: T,
  ) {
    const passes = (type === 'ws' ? this.wsPasses : this.webPasses) as T[];
    let i = -1;

    passes.forEach((v, idx) => {
      if (v.name === passName) i = idx;
    });

    if (i === -1) throw new Error('No such pass');

    passes.splice(i++, 0, callback);
  }

  before<T extends WebIncomingPass | WebSocketIncomingPass>(
    type: 'web' | 'ws',
    passName: string,
    callback: T,
  ) {
    const passes = (type === 'ws' ? this.wsPasses : this.webPasses) as T[];
    let i = -1;

    passes.forEach((v, idx) => {
      if (v.name === passName) i = idx;
    });

    if (i === -1) throw new Error('No such pass');

    passes.splice(i, 0, callback);
  }

  close(callback?: () => void) {
    if (this._server) {
      this._server.close(() => {
        this._server = undefined;
        callback?.();
      });
    }
  }

  listen(port: number, hostname: string) {
    const closure = (req: IncomingMessage, res: ServerResponse) => {
      this.web(req, res);
    };

    const server = this.options.ssl
      ? https.createServer(this.options.ssl, closure)
      : http.createServer(closure);

    if (this.options.ws) {
      server.on(
        'upgrade',
        (req: IncomingMessage, socket: Duplex, head: Buffer) => {
          this.ws(req, socket, head);
        },
      );
    }

    server.listen(port, hostname);

    this._server = server;

    return this;
  }

  onError(err: Error) {
    //
    // Remark: Replicate node core behavior using EE3
    // so we force people to handle their own errors
    //
    if (super.listeners('error').length === 1) {
      throw err;
    }
  }
}

/**
 * Creates the proxy server.
 *
 * Examples:
 *
 *    httpProxy.createServer({ .. }, 8000)
 *    // => '{ web: [Function], ws: [Function] ... }'
 *
 * @param options Config object passed to the proxy
 *
 * @return Proxy object with handlers for `ws` and `web` requests
 *
 * @api public
 */
export function createProxyServer(options: ServerOptions) {
  return new ProxyServerNew(options);
}

export const createProxy = createProxyServer;

export const createServer = createProxyServer;
