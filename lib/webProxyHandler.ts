import { IncomingMessage, ServerResponse } from 'http';
import { parse as parse_url } from 'url';
import { ProxyServerNew, ResolvedServerOptions, ServerOptions } from './index';
import { WebErrorCallback } from './eventCallbacks';

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
 * Creates a web request handler for the Proxy.
 *
 * @internal
 */
export function createWebProxyHandler(options: ServerOptions): WebProxyHandler {
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
