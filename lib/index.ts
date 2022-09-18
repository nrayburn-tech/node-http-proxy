import http, {
  ClientRequest,
  IncomingMessage,
  Server as HttpServer,
  ServerResponse,
} from 'http';
import https from 'https';
import { Duplex } from 'stream';
import url, { parse as parse_url } from 'url';
import EE3 from 'eventemitter3';
import { WebIncomingPass, webIncomingPasses } from './passes/web-incoming';
import {
  WebSocketIncomingPass,
  websocketIncomingPasses,
} from './passes/ws-incoming';
import { ProxyTargetDetailed, ProxyTargetUrl, ServerOptions } from './types';
import { Socket } from 'net';

// Web events
export type WebEconnResetCallback = (
  err: Error,
  req: IncomingMessage,
  res: ServerResponse,
  target: ProxyTargetUrl,
) => void;
export type WebEndCallback = (
  req: IncomingMessage,
  res: ServerResponse,
  proxyRes: IncomingMessage,
) => void;
export type WebErrorCallback = (
  err: Error,
  req: IncomingMessage,
  res: ServerResponse,
  url: ResolvedServerOptions['target'],
) => void;
export type WebReqCallback = (
  proxyReq: ClientRequest,
  req: IncomingMessage,
  res: ServerResponse,
  options: ResolvedServerOptions,
) => void;
export type WebResCallback = (
  proxyRes: IncomingMessage,
  req: IncomingMessage,
  res: ServerResponse,
) => void;
export type WebStartCallback = (
  req: IncomingMessage,
  res: ServerResponse,
  target: ResolvedServerOptions['target'],
) => void;

// Websocket events
export type WebSocketCloseCallback = (
  err: Error,
  req: IncomingMessage,
  res: Socket,
  head: Buffer,
) => void;
export type WebSocketErrorCallback = (
  err: Error,
  req: IncomingMessage,
  socket: Duplex,
) => void;
export type WebSocketReqCallback = (
  proxyReq: ClientRequest,
  req: IncomingMessage,
  socket: Socket,
  options: ResolvedServerOptions,
  head: Buffer,
) => void;
export type WebSocketOpenCallback = (socket: Socket) => void;

/**
 * Used for proxying regular HTTP(S) requests
 * @param req - Client request.
 * @param res - Client response.
 * @param optionsOrCallback - Additional options or error callback.
 * @param callback - Error callback.
 */
export type WebProxyHandler = (
  this: ProxyServerNew,
  req: IncomingMessage,
  res: ServerResponse,
  optionsOrCallback?: ServerOptions | WebErrorCallback,
  callback?: WebErrorCallback,
) => void;

/**
 * Used for proxying regular HTTP(S) requests
 * @param req - Client request.
 * @param socket - Client socket.
 * @param head - Client head.
 * @param optionsOrCallback - Additional options or error callback.
 * @param callback - Error callback.
 */
export type WebSocketProxyHandler = (
  this: ProxyServerNew,
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  optionsOrCallback?: ServerOptions | WebSocketErrorCallback,
  callback?: WebSocketErrorCallback,
) => void;

export interface ResolvedServerOptions
  extends Omit<ServerOptions, 'forward' | 'target'> {
  forward?: ProxyTargetDetailed | Partial<url.Url>;
  target?: ProxyTargetDetailed | Partial<url.Url>;
}

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
      if (typeof finalOptions[e] === 'string') {
        finalOptions[e] = parse_url(finalOptions[e] as string);
      }
    });

    if (!finalOptions.target && !finalOptions.forward) {
      throw new Error('Must provide a proper URL as target');
    }

    for (let i = 0; i < passes.length; i++) {
      if (
        passes[i].call(
          this,
          req,
          res,
          finalOptions as unknown as ResolvedServerOptions,
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
    socket: Socket,
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
      throw new Error('Must provide a proper URL as target');
    }

    for (let i = 0; i < passes.length; i++) {
      if (
        passes[i].call(
          this,
          req,
          socket,
          finalOptions as unknown as ResolvedServerOptions,
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

    // Create copies, so that modifications to the array for this proxy doesn't
    // leak into all instances of a proxy.
    this.webPasses = [...webIncomingPasses];
    this.wsPasses = [...websocketIncomingPasses];

    super.on('error', this.onError, this);
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

  /**
   * A function that closes the inner webserver and stops listening on given port.
   * If a webserver was not created with {@link ProxyServerNew#listen}, then this does nothing.
   * See {@link HttpServer#close} for details on how this works.
   */
  close(callback?: (err?: Error) => void) {
    if (this._server) {
      this._server.close((err) => {
        this._server = undefined;
        callback?.(err);
      });
    }
  }

  /**
   * A function that wraps the object in a webserver, for your convenience
   * @param port - Port to listen on
   * @param hostname - Hostname to listen on.
   */
  listen(port: number, hostname?: string) {
    const closure = (req: IncomingMessage, res: ServerResponse) => {
      this.web(req, res);
    };

    const server = this.options.ssl
      ? https.createServer(this.options.ssl, closure)
      : http.createServer(closure);

    if (this.options.ws) {
      server.on(
        'upgrade',
        (req: IncomingMessage, socket: Socket, head: Buffer) => {
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

  emit(
    event: 'close',
    err: Error,
    req: IncomingMessage,
    res: Socket,
    head: Buffer,
  ): boolean;
  emit(event: 'econnreset', listener: WebEconnResetCallback): boolean;
  emit(
    event: 'end',
    err: Error,
    req: IncomingMessage,
    res: ServerResponse,
    target: ProxyTargetUrl,
  ): boolean;
  emit(
    event: 'error',
    err: Error,
    req: IncomingMessage,
    res: ServerResponse,
    url: ResolvedServerOptions['target'],
  ): boolean;
  emit(
    event: 'error',
    err: Error,
    req: IncomingMessage,
    socket: Duplex,
  ): boolean;
  emit(
    event: 'proxyReq',
    proxyReq: ClientRequest,
    req: IncomingMessage,
    res: ServerResponse,
    options: ResolvedServerOptions,
  ): boolean;
  emit(
    event: 'proxyReqWs',
    proxyReq: ClientRequest,
    req: IncomingMessage,
    socket: Socket,
    options: ResolvedServerOptions,
    head: Buffer,
  ): boolean;
  emit(
    event: 'proxyRes',
    proxyRes: IncomingMessage,
    req: IncomingMessage,
    res: ServerResponse,
  ): boolean;
  emit(event: 'open', socket: Socket): boolean;
  emit(
    event: 'start',
    req: IncomingMessage,
    res: ServerResponse,
    target: ResolvedServerOptions['target'],
  ): boolean;
  emit(event: any, ...args: any[]): boolean;
  emit(event: any, ...args: any[]) {
    return super.emit(event, ...args);
  }

  on(event: 'close', listener: WebSocketCloseCallback): this;
  on(event: 'econnreset', listener: WebEconnResetCallback): this;
  on(event: 'end', listener: WebEndCallback): this;
  on(event: 'error', listener: WebErrorCallback): this;
  on(event: 'error', listener: WebSocketErrorCallback): this;
  on(event: 'proxyReq', listener: WebReqCallback): this;
  on(event: 'proxyReqWs', listener: WebSocketReqCallback): this;
  on(event: 'proxyRes', listener: WebResCallback): this;
  on(event: 'open', listener: WebSocketOpenCallback): this;
  on(event: 'start', listener: WebStartCallback): this;
  on(event: any, listener: (...args: any[]) => void): this;
  on(event: any, listener: (...args: any[]) => void) {
    super.on(event, listener);
    return this;
  }

  once(event: 'close', listener: WebSocketCloseCallback): this;
  once(event: 'econnreset', listener: WebEconnResetCallback): this;
  once(event: 'end', listener: WebEndCallback): this;
  once(event: 'error', listener: WebErrorCallback): this;
  once(event: 'error', listener: WebSocketErrorCallback): this;
  once(event: 'proxyReq', listener: WebReqCallback): this;
  once(event: 'proxyReqWs', listener: WebSocketReqCallback): this;
  once(event: 'proxyRes', listener: WebResCallback): this;
  once(event: 'open', listener: WebSocketOpenCallback): this;
  once(event: 'start', listener: WebStartCallback): this;
  once(event: any, listener: (...args: any[]) => void): this;
  once(event: any, listener: (...args: any[]) => void) {
    super.once(event, listener);
    return this;
  }
}

/**
 * Creates the proxy server with specified options.
 * @param options Config object passed to the proxy
 * @returns Proxy object with handlers for `ws` and `web` requests
 */
export function createProxy(options: ServerOptions) {
  return new ProxyServerNew(options);
}

/**
 * @deprecated - Use {@link createProxyServer} instead.
 * @see {createProxyServer}
 */
export const createProxyServer = createProxy;

/**
 * @deprecated - Use {@link createProxyServer} instead.
 * @see {createProxyServer}
 */
export const createServer = createProxy;
