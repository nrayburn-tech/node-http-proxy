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

export type WebIncomingPass = (
  this: ProxyServerNew,
  req: IncomingMessage,
  res: ServerResponse,
  options: ServerOptions,
  server: ProxyServerNew,
  errorCallback?: (
    err: Error,
    req: IncomingMessage,
    res: ServerResponse,
    url: ServerOptions['target'],
  ) => void,
) => boolean | unknown;
export type WebSocketIncomingPass = (
  this: ProxyServerNew,
  req: IncomingMessage,
  socket: Duplex,
  options: ServerOptions,
  head: Buffer,
  server: ProxyServerNew,
  errorCallback?: (err: Error, req: IncomingMessage, socket: Duplex) => void,
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
 * Returns a function that creates the loader for
 * either `ws` or `web`'s  passes.
 *
 * Examples:
 *
 *    createRightProxy('ws')
 *    // => [Function]
 *
 * @param type
 *
 * @return Loader function that when called returns an iterator for the right passes
 *
 * @api private
 */
function createRightProxy(type: 'web' | 'ws') {
  return function (options: ServerOptions) {
    return function (
      this: ProxyServerNew,
      req: IncomingMessage,
      resOrSocket: ServerResponse | Duplex,
    ): void {
      const passes = type === 'ws' ? this.wsPasses : this.webPasses,
        // TODO: Migrate away from arguments.
        // eslint-disable-next-line prefer-rest-params
        args = [].slice.call(arguments) as any[];
      let cntr = args.length - 1,
        head,
        cbl;

      /* optional args parse begin */
      if (typeof args[cntr] === 'function') {
        cbl = args[cntr];

        cntr--;
      }

      let requestOptions = options;
      if (!(args[cntr] instanceof Buffer) && args[cntr] !== resOrSocket) {
        //Copy global options
        requestOptions = Object.assign({}, options);
        //Overwrite with request options
        Object.assign(requestOptions, args[cntr]);

        cntr--;
      }

      if (args[cntr] instanceof Buffer) {
        head = args[cntr];
      }

      /* optional args parse end */

      (['target', 'forward'] as const).forEach(function (e) {
        if (typeof requestOptions[e] === 'string')
          requestOptions[e] = parse_url(requestOptions[e] as string);
      });

      if (!requestOptions.target && !requestOptions.forward) {
        this.emit('error', new Error('Must provide a proper URL as target'));
        return;
      }

      for (let i = 0; i < passes.length; i++) {
        /**
         * Call of passes functions
         * pass(req, res, options, head)
         *
         * In WebSockets case the `res` variable
         * refer to the connection socket
         * pass(req, socket, options, head)
         */
        if (type === 'web') {
          if (
            (passes[i] as WebIncomingPass).call(
              this,
              req,
              resOrSocket as ServerResponse,
              requestOptions,
              this,
              cbl,
            )
          ) {
            // passes can return a truthy value to halt the loop
            break;
          }
        } else if (type === 'ws') {
          if (
            (passes[i] as WebSocketIncomingPass).call(
              this,
              req,
              resOrSocket as Duplex,
              requestOptions,
              head,
              this,
              cbl,
            )
          ) {
            // passes can return a truthy value to halt the loop
            break;
          }
        } else {
          throw new Error(
            'Unsupported proxy type supplied.  Expected "web" or "ws", received ' +
              type +
              '.',
          );
        }
      }
    };
  };
}

export class ProxyServerNew extends EE3 {
  options: ServerOptions;
  web: (req: IncomingMessage, res: ServerResponse) => void;
  ws: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
  webPasses: WebIncomingPass[];
  wsPasses: WebSocketIncomingPass[];

  _server: HttpServer | undefined;

  constructor(options: ServerOptions) {
    super();
    options = options || {};
    options.prependPath = options.prependPath !== false;

    this.web = createRightProxy('web')(options);
    this.ws = createRightProxy('ws')(options);
    this.options = options;

    this.webPasses = [web.deleteLength, web.timeout, web.XHeaders, web.stream];
    this.wsPasses = [ws.checkMethodAndHeader, ws.XHeaders, ws.stream];

    this.on('error', this.onError, this);
  }

  after(
    type: 'web' | 'ws',
    passName: string,
    callback: WebIncomingPass | WebSocketIncomingPass,
  ) {
    const passes = type === 'ws' ? this.wsPasses : this.webPasses;
    let i = -1;

    passes.forEach((v, idx) => {
      if (v.name === passName) i = idx;
    });

    if (i === -1) throw new Error('No such pass');

    passes.splice(i++, 0, callback);
  }

  before(
    type: 'web' | 'ws',
    passName: string,
    callback: WebIncomingPass | WebSocketIncomingPass,
  ) {
    const passes = type === 'ws' ? this.wsPasses : this.webPasses;
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
