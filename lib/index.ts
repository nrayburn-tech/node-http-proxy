import {
  ProxyServer,
  ProxyServerOptions,
  ProxyTargetDetailed,
} from './proxyServer';

export { ProxyServer };

export type { ProxyServerOptions, ProxyTargetDetailed };

/**
 * Creates the proxy server with specified options.
 * @param options Config object passed to the proxy
 * @returns Proxy object with handlers for `ws` and `web` requests
 */
export function createProxy(options?: ProxyServerOptions) {
  return new ProxyServer(options);
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

// TODO: PRs/Bugs to review and possibly migrate from original repo.
//  crash when 'options.target' is an object instead a string - https://github.com/http-party/node-http-proxy/pull/1600
//  [fix] do not append XHeader values - https://github.com/http-party/node-http-proxy/pull/1581
//  Add lookup option to override dns lookups - https://github.com/http-party/node-http-proxy/pull/1574
//  Fix 'aborted' detection on Node v15.5.0+ - https://github.com/http-party/node-http-proxy/pull/1559
//  Fix websocket socket close before response - https://github.com/http-party/node-http-proxy/pull/1552
//  Add follow-redirects options support - https://github.com/http-party/node-http-proxy/pull/1533
//  Fix handling of client disconnect so that econnreset event is emitted instead of error - https://github.com/http-party/node-http-proxy/pull/1542
