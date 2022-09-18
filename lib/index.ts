import http, {
  ClientRequest,
  IncomingMessage,
  Server as HttpServer,
  ServerResponse,
} from 'http';
import https from 'https';
import stream, { Duplex } from 'stream';
import url from 'url';
import EE3 from 'eventemitter3';
import { WebIncomingPass, webIncomingPasses } from './passes/web-incoming';
import {
  WebSocketIncomingPass,
  websocketIncomingPasses,
} from './passes/ws-incoming';
import { Socket } from 'net';
import { createWebProxyHandler, WebProxyHandler } from './webProxyHandler';
import {
  WebEconnResetCallback,
  WebEndCallback,
  WebErrorCallback,
  WebReqCallback,
  WebResCallback,
  WebSocketCloseCallback,
  WebSocketErrorCallback,
  WebSocketOpenCallback,
  WebSocketReqCallback,
  WebStartCallback,
} from './eventCallbacks';
import {
  createWebSocketProxyHandler,
  WebSocketProxyHandler,
} from './websocketProxyHandler';

export interface ResolvedServerOptions
  extends Omit<ServerOptions, 'forward' | 'target'> {
  forward?: ProxyTargetDetailed | Partial<url.Url>;
  target?: ProxyTargetDetailed | Partial<url.Url>;
}

export interface ProxyTargetDetailed {
  host: string;
  port: number;
  protocol?: string | undefined;
  hostname?: string | undefined;
  socketPath?: string | undefined;
  key?: string | undefined;
  passphrase?: string | undefined;
  pfx?: Buffer | string | undefined;
  cert?: string | undefined;
  ca?: string | undefined;
  ciphers?: string | undefined;
  secureProtocol?: string | undefined;
}

export type ProxyTarget = ProxyTargetUrl | ProxyTargetDetailed;
export type ProxyTargetUrl = string | Partial<url.Url>;

export interface ServerOptions {
  /** URL string to be parsed with the url module. */
  target?: ProxyTarget | undefined;
  /** URL string to be parsed with the url module. */
  forward?: ProxyTargetUrl | undefined;
  /** Object to be passed to http(s).request. */
  agent?: any;
  /** Object to be passed to https.createServer(). */
  ssl?: any;
  /** If you want to proxy websockets. */
  ws?: boolean | undefined;
  /** Adds x- forward headers. */
  xfwd?: boolean | undefined;
  /** Verify SSL certificate. */
  secure?: boolean | undefined;
  /** Explicitly specify if we are proxying to another proxy. */
  toProxy?: boolean | undefined;
  /** Specify whether you want to prepend the target's path to the proxy path. */
  prependPath?: boolean | undefined;
  /** Specify whether you want to ignore the proxy path of the incoming request. */
  ignorePath?: boolean | undefined;
  /** Local interface string to bind for outgoing connections. */
  localAddress?: string | undefined;
  /** Changes the origin of the host header to the target URL. */
  changeOrigin?: boolean | undefined;
  /** specify whether you want to keep letter case of response header key */
  preserveHeaderKeyCase?: boolean | undefined;
  /** Basic authentication i.e. 'user:password' to compute an Authorization header. */
  auth?: string | undefined;
  /** Rewrites the location hostname on (301 / 302 / 307 / 308) redirects, Default: null. */
  hostRewrite?: string | undefined;
  /** Rewrites the location host/ port on (301 / 302 / 307 / 308) redirects based on requested host/ port. Default: false. */
  autoRewrite?: boolean | undefined;
  /** Rewrites the location protocol on (301 / 302 / 307 / 308) redirects to 'http' or 'https'.Default: null. */
  protocolRewrite?: string | undefined;
  /** rewrites domain of set-cookie headers. */
  cookieDomainRewrite?:
    | false
    | string
    | { [oldDomain: string]: string }
    | undefined;
  /** rewrites path of set-cookie headers. Default: false */
  cookiePathRewrite?:
    | false
    | string
    | { [oldPath: string]: string }
    | undefined;
  /** object with extra headers to be added to target requests. */
  headers?: { [header: string]: string } | undefined;
  /** http method to use when forwarding request */
  method?: string;
  /** Timeout (in milliseconds) when proxy receives no response from target. Default: 120000 (2 minutes) */
  proxyTimeout?: number | undefined;
  /** Timeout (in milliseconds) for incoming requests */
  timeout?: number | undefined;
  /** Specify whether you want to follow redirects. Default: false */
  followRedirects?: boolean | undefined;
  /** If set to true, none of the webOutgoing passes are called and it's your responsibility to appropriately return the response by listening and acting on the proxyRes event */
  selfHandleResponse?: boolean | undefined;
  /** Buffer */
  buffer?: stream.Stream | undefined;
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

    this.web = createWebProxyHandler(options);
    this.ws = createWebSocketProxyHandler(options);
    this.options = options;

    // Create copies, so that modifications to the array for this instance doesn't
    // leak into all instances.
    this.webPasses = [...webIncomingPasses];
    this.wsPasses = [...websocketIncomingPasses];

    this.on('error', this.onError);
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
    // Remark: Replicate node core behavior using EE3,
    // so we force people to handle their own errors
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
 * @deprecated - Use {@link createProxy} instead.
 * @see {createProxy}
 */
export const createProxyServer = createProxy;

/**
 * @deprecated - Use {@link createProxy} instead.
 * @see {createProxy}
 */
export const createServer = createProxy;
