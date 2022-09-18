import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { WebSocketErrorCallback } from './eventCallbacks';
import { parse as parse_url } from 'url';
import {
  ProxyServer,
  ProxyServerOptions,
  ResolvedProxyServerOptions,
} from './proxyServer';

/**
 * Used for proxying regular HTTP(S) requests
 * @param req - Client request.
 * @param socket - Client socket.
 * @param head - Client head.
 * @param optionsOrCallback - Additional options or error callback.
 * @param callback - Error callback.
 */
export type WebSocketProxyHandler = (
  this: ProxyServer,
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  optionsOrCallback?: ProxyServerOptions | WebSocketErrorCallback,
  callback?: WebSocketErrorCallback,
) => void;

/**
 * Creates a websocket request handler for the Proxy.
 *
 * @internal
 */
export function createWebSocketProxyHandler(
  options: ProxyServerOptions,
): WebSocketProxyHandler {
  return function (
    this: ProxyServer,
    req: IncomingMessage,
    socket: Socket,
    head: Buffer,
    optionsOrCallback?: ProxyServerOptions | WebSocketErrorCallback,
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
          finalOptions as unknown as ResolvedProxyServerOptions,
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
