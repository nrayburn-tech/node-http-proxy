import * as httpNative from 'node:http';
import * as httpsNative from 'node:https';
import * as followRedirects from 'follow-redirects';
import { webOutgoingPasses } from './web-outgoing';
import { getPort, hasEncryptedConnection, setupOutgoing } from '../common';
import { WebErrorCallback } from '../eventCallbacks';
import { ProxyServer, ResolvedProxyServerOptions } from '../proxyServer';

const nativeAgents = { http: httpNative, https: httpsNative };

/*
 * Array of passes.
 *
 * A `pass` is just a function that is executed on `req, res, options`
 * so that you can easily add new checks while still keeping the base
 * flexible.
 */

export type WebIncomingPass = (
  this: ProxyServer,
  req: httpNative.IncomingMessage,
  res: httpNative.ServerResponse,
  options: ResolvedProxyServerOptions,
  server: ProxyServer,
  errorCallback?: WebErrorCallback,
) => boolean | unknown;
/**
 * Sets `content-length` to '0' if request is of DELETE type.
 *
 * @internal
 */
export const deleteLength: WebIncomingPass = (req) => {
  if (
    (req.method === 'DELETE' || req.method === 'OPTIONS') &&
    !req.headers['content-length']
  ) {
    req.headers['content-length'] = '0';
    delete req.headers['transfer-encoding'];
  }
};

/**
 * Sets timeout in request socket if it was specified in options.
 *
 * @internal
 */
export const timeout: WebIncomingPass = (req, res, options) => {
  if (options.timeout) {
    req.socket.setTimeout(options.timeout);
  }
};

/**
 * Sets `x-forwarded-*` headers if specified in config.
 *
 * @internal
 */
export const XHeaders: WebIncomingPass = (req, res, options) => {
  if (!options.xfwd) return;

  const encrypted =
    (req as httpNative.IncomingMessage & { isSpdy?: boolean }).isSpdy ||
    hasEncryptedConnection(req);
  const values = {
    for: req.connection.remoteAddress || req.socket.remoteAddress,
    port: getPort(req),
    proto: encrypted ? 'https' : 'http',
  };

  (['for', 'port', 'proto'] as const).forEach(function (header) {
    req.headers['x-forwarded-' + header] =
      (req.headers['x-forwarded-' + header] || '') +
      (req.headers['x-forwarded-' + header] ? ',' : '') +
      values[header];
  });

  req.headers['x-forwarded-host'] =
    req.headers['x-forwarded-host'] || req.headers['host'] || '';
};

/**
 * Does the actual proxying. If `forward` is enabled fires up
 * a ForwardStream, same happens for ProxyStream. The request
 * just dies otherwise.
 *
 * @internal
 */
export const stream: WebIncomingPass = (req, res, options, server, clb) => {
  // And we begin!
  server.emit('start', req, res, options.target || options.forward);

  const agents = (options.followRedirects ? followRedirects : nativeAgents) as {
    http: typeof httpNative;
    https: typeof httpsNative;
  };
  const http = agents.http;
  const https = agents.https;

  if (options.forward) {
    // If forward enable, so just pipe the request
    const forwardReq: httpNative.ClientRequest = (
      options.forward.protocol === 'https:' ? https : http
    ).request(setupOutgoing(options.ssl || {}, options, req, 'forward'));

    // error handler (e.g. ECONNRESET, ECONNREFUSED)
    // Handle errors on incoming request as well as it makes sense to
    const forwardError = createErrorHandler(forwardReq, options.forward);
    req.on('error', forwardError);
    forwardReq.on('error', forwardError);

    (options.buffer || req).pipe(forwardReq);
    // Early return if requests are only being forwarded.
    // Otherwise, process the request to the target as well.
    if (!options.target) {
      return res.end();
    }
  }

  // Request initialization
  const proxyReq: httpNative.ClientRequest = (
    options.target?.protocol === 'https:' ? https : http
  ).request(setupOutgoing(options.ssl || {}, options, req));

  // Enable developers to modify the proxyReq before headers are sent
  proxyReq.on('socket', function () {
    if (server && !proxyReq.getHeader('expect')) {
      server.emit('proxyReq', proxyReq, req, res, options);
    }
  });

  // allow outgoing socket to timeout so that we could
  // show an error page at the initial request
  if (options.proxyTimeout) {
    proxyReq.setTimeout(options.proxyTimeout, function () {
      proxyReq.destroy();
    });
  }

  // Ensure we abort proxy if request is aborted
  // Need to use different methods due to node changes in 15.0.0.

  // In node < 15.0.0, listen for request abort and destroy the proxy request.
  req.on('aborted', function () {
    proxyReq.destroy();
  });
  // In node > 15.0.0, listen for the close event on the response.  If it was
  // destroyed then destroy the proxy request.
  res.on('close', function () {
    if (res.destroyed) {
      proxyReq.destroy();
    }
  });

  // handle errors in proxy and incoming request, just like for forward proxy
  const proxyError = createErrorHandler(proxyReq, options.target);
  req.on('error', proxyError);
  proxyReq.on('error', proxyError);

  function createErrorHandler(
    proxyReq: httpNative.ClientRequest,
    url: ResolvedProxyServerOptions['target'],
  ) {
    return function proxyError(err: Error) {
      if (
        req.socket.destroyed &&
        'code' in err &&
        (err as Error & { code: string }).code === 'ECONNRESET'
      ) {
        server.emit('econnreset', err, req, res, url);
        proxyReq.destroy();
        return;
      }

      if (clb) {
        clb(err, req, res, url);
      } else {
        server.emit('error', err, req, res, url);
      }
    };
  }

  (options.buffer || req).pipe(proxyReq);

  proxyReq.on('response', function (proxyRes) {
    if (server) {
      server.emit('proxyRes', proxyRes, req, res);
    }

    if (!res.headersSent && !options.selfHandleResponse) {
      for (let i = 0; i < webOutgoingPasses.length; i++) {
        if (
          webOutgoingPasses[i].call(server, req, res, proxyRes, options, server)
        ) {
          break;
        }
      }
    }

    if (!res.finished) {
      // Allow us to listen when the proxy has completed
      proxyRes.on('end', function () {
        if (server) server.emit('end', req, res, proxyRes);
      });
      // We pipe to the response unless its expected to be handled by the user
      if (!options.selfHandleResponse) proxyRes.pipe(res);
    } else {
      if (server) server.emit('end', req, res, proxyRes);
    }
  });
};

export const webIncomingPasses = [deleteLength, timeout, XHeaders, stream];
