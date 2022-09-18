import * as url from 'url';
import { default as required } from 'requires-port';
import { Socket } from 'net';
import { IncomingMessage } from 'http';
import { RequestOptions } from 'https';
import { ResolvedServerOptions } from './index';

const upgradeHeader = /(^|,)\s*upgrade\s*($|,)/i;

/**
 * Simple Regex for testing if protocol is https
 */
export const isSSL = /^https|wss/;

/**
 * Copies the right headers from `options` and `req` to
 * `outgoing` which is then used to fire the proxied
 * request.
 *
 * Examples:
 *
 *    common.setupOutgoing(outgoing, options, req)
 *    // => { host: ..., hostname: ...}
 *
 * @param outgoing Base object to be filled with required properties
 * @param options Config object passed to the proxy
 * @param req Request Object
 * @param forward String to select forward or target
 *
 * @return {Object} Outgoing Object with all required properties set
 *
 * @internal
 */

export function setupOutgoing(
  outgoing: RequestOptions,
  options: ResolvedServerOptions,
  req: IncomingMessage,
  forward?: 'forward' | 'target',
) {
  outgoing.port =
    options[forward || 'target'].port ||
    (isSSL.test(options[forward || 'target'].protocol) ? 443 : 80);

  (
    [
      'host',
      'hostname',
      'socketPath',
      'pfx',
      'key',
      'passphrase',
      'cert',
      'ca',
      'ciphers',
      'secureProtocol',
    ] as const
  ).forEach(function (e) {
    outgoing[e] = options[forward || 'target'][e];
  });

  outgoing.method = options.method || req.method;
  outgoing.headers = { ...req.headers };

  if (options.headers) {
    outgoing.headers = { ...outgoing.headers, ...options.headers };
  }

  if (options.auth) {
    outgoing.auth = options.auth;
  }

  if (options.ssl?.ca) {
    outgoing.ca = options.ssl.ca;
  }

  if (isSSL.test(options[forward || 'target'].protocol)) {
    outgoing.rejectUnauthorized =
      typeof options.secure === 'undefined' ? true : options.secure;
  }

  outgoing.agent = options.agent || false;
  outgoing.localAddress = options.localAddress;

  //
  // Remark: If we are false and not upgrading, set the connection: close. This is the right thing to do
  // as node core doesn't handle this COMPLETELY properly yet.
  //
  if (!outgoing.agent) {
    outgoing.headers = outgoing.headers || {};
    if (
      typeof outgoing.headers.connection !== 'string' ||
      !upgradeHeader.test(outgoing.headers.connection)
    ) {
      outgoing.headers.connection = 'close';
    }
  }

  // the final path is target path + relative path requested by user:
  const target = options[forward || 'target'];
  const targetPath =
    target && options.prependPath !== false ? target.path || '' : '';

  //
  // Remark: Can we somehow not use url.parse as a perf optimization?
  //
  let outgoingPath = !options.toProxy ? url.parse(req.url).path || '' : req.url;

  //
  // Remark: ignorePath will just straight up ignore whatever the request's
  // path is. This can be labeled as FOOT-GUN material if you do not know what
  // you are doing and are using conflicting options.
  //
  outgoingPath = !options.ignorePath ? outgoingPath : '';

  outgoing.path = urlJoin(targetPath, outgoingPath);

  if (options.changeOrigin) {
    if (!outgoing.headers) {
      outgoing.headers = {};
    }
    outgoing.headers.host =
      required(outgoing.port, options[forward || 'target'].protocol) &&
      !hasPort(outgoing.host)
        ? outgoing.host + ':' + outgoing.port
        : outgoing.host || undefined;
  }
  return outgoing;
}

/**
 * Set the proper configuration for sockets,
 * set no delay and set keep alive, also set
 * the timeout to 0.
 *
 * Examples:
 *
 *    common.setupSocket(socket)
 *    // => Socket
 *
 * @return Return the configured socket.
 *
 * @internal
 */

export function setupSocket(socket: Socket) {
  socket.setTimeout(0);
  socket.setNoDelay(true);

  socket.setKeepAlive(true, 0);

  return socket;
}

/**
 * Get the port number from the host. Or guess it based on the connection type.
 *
 * @param req Incoming HTTP request.
 *
 * @return The port number.
 *
 * @internal
 */
export function getPort(req: IncomingMessage) {
  const res = req.headers.host ? req.headers.host.match(/:(\d+)/) : '';

  return res ? res[1] : hasEncryptedConnection(req) ? '443' : '80';
}

/**
 * Check if the request has an encrypted connection.
 *
 * @param req Incoming HTTP request.
 *
 * @return Whether the connection is encrypted or not.
 *
 * @internal
 */
export function hasEncryptedConnection(req: IncomingMessage) {
  // @ts-expect-error
  return Boolean(req.connection.encrypted || req.connection.pair);
}

/**
 * OS-agnostic join (doesn't break on URLs like path.join does on Windows)>
 *
 * @return {String} The generated path.
 *
 * @internal
 */

export function urlJoin() {
  //
  // We do not want to mess with the query string. All we want to touch is the path.
  //
  const args = Array.prototype.slice.call(arguments),
    lastIndex = args.length - 1,
    last = args[lastIndex],
    lastSegs = last.split('?');

  args[lastIndex] = lastSegs.shift();

  //
  // Join all strings, but remove empty strings so we don't get extra slashes from
  // joining e.g. ['', 'am']
  //
  const retSegs = [
    args
      .filter(Boolean)
      .join('/')
      .replace(/\/+/g, '/')
      .replace('http:/', 'http://')
      .replace('https:/', 'https://'),
  ];

  // Only join the query string if it exists so we don't have trailing a '?'
  // on every request

  // Handle case where there could be multiple ? in the URL.
  retSegs.push.apply(retSegs, lastSegs);

  return retSegs.join('?');
}

/**
 * Rewrites or removes the domain of a cookie header
 *
 * @param header
 * @param config, mapping of domain to rewritten domain.
 *                 '*' key to match any domain, null value to remove the domain.
 * @param property
 *
 * @internal
 */
export function rewriteCookieProperty(
  header: string | string[],
  config: Record<string, string>,
  property: string,
): string | string[] {
  if (Array.isArray(header)) {
    return header.map(function (headerElement) {
      return rewriteCookieProperty(headerElement, config, property);
    }) as string[];
  }
  return header.replace(
    new RegExp('(;\\s*' + property + '=)([^;]+)', 'i'),
    function (match, prefix, previousValue) {
      let newValue;
      if (previousValue in config) {
        newValue = config[previousValue];
      } else if ('*' in config) {
        newValue = config['*'];
      } else {
        //no match, return previous value
        return match;
      }
      if (newValue) {
        //replace value
        return prefix + newValue;
      } else {
        //remove value
        return '';
      }
    },
  );
}

/**
 * Check the host and see if it potentially has a port in it (keep it simple)
 *
 * @internal
 */
export function hasPort(host: string) {
  return !!~host.indexOf(':');
}
