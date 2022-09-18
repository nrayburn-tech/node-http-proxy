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
export function createProxy(options: ProxyServerOptions) {
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
