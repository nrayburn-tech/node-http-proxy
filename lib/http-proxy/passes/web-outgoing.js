const url = require('url'),
  common = require('../common');

const redirectRegex = /^201|30(1|2|7|8)$/;

/*
 * Array of passes.
 *
 * A `pass` is just a function that is executed on `req, res, options`
 * so that you can easily add new checks while still keeping the base
 * flexible.
 */

/**
 * If is an HTTP 1.0 request, remove chunk headers
 *
 * @type {WebOutgoingPass}
 * @internal
 */
const removeChunked = (req, res, proxyRes) => {
  if (req.httpVersion === '1.0') {
    delete proxyRes.headers['transfer-encoding'];
  }
};

/**
 * If is a HTTP 1.0 request, set the correct connection header
 * or if connection header not present, then use `keep-alive`
 *
 * @type {WebOutgoingPass}
 * @internal
 */
const setConnection = (req, res, proxyRes) => {
  if (req.httpVersion === '1.0') {
    proxyRes.headers.connection = req.headers.connection || 'close';
  } else if (req.httpVersion !== '2.0' && !proxyRes.headers.connection) {
    proxyRes.headers.connection = req.headers.connection || 'keep-alive';
  }
};

/**
 * @type {WebOutgoingPass}
 * @internal
 */
const setRedirectHostRewrite = (req, res, proxyRes, options) => {
  if (
    (options.hostRewrite || options.autoRewrite || options.protocolRewrite) &&
    proxyRes.headers['location'] &&
    redirectRegex.test(proxyRes.statusCode)
  ) {
    const target = url.parse(options.target);
    const u = url.parse(proxyRes.headers['location']);

    // make sure the redirected host matches the target host before rewriting
    if (target.host != u.host) {
      return;
    }

    if (options.hostRewrite) {
      u.host = options.hostRewrite;
    } else if (options.autoRewrite) {
      u.host = req.headers['host'];
    }
    if (options.protocolRewrite) {
      u.protocol = options.protocolRewrite;
    }

    proxyRes.headers['location'] = u.format();
  }
};

/**
 * Copy headers from proxyResponse to response
 * set each header in response object.
 *
 * @type {WebOutgoingPass}
 * @internal
 */
const writeHeaders = (req, res, proxyRes, options) => {
  let rewriteCookieDomainConfig = options.cookieDomainRewrite,
    rewriteCookiePathConfig = options.cookiePathRewrite,
    rawHeaderKeyMap;
  const preserveHeaderKeyCase = options.preserveHeaderKeyCase,
    setHeader = function (key, header) {
      if (header == undefined) return;
      if (rewriteCookieDomainConfig && key.toLowerCase() === 'set-cookie') {
        header = common.rewriteCookieProperty(
          header,
          rewriteCookieDomainConfig,
          'domain',
        );
      }
      if (rewriteCookiePathConfig && key.toLowerCase() === 'set-cookie') {
        header = common.rewriteCookieProperty(
          header,
          rewriteCookiePathConfig,
          'path',
        );
      }
      res.setHeader(String(key).trim(), header);
    };

  if (typeof rewriteCookieDomainConfig === 'string') {
    //also test for ''
    rewriteCookieDomainConfig = { '*': rewriteCookieDomainConfig };
  }

  if (typeof rewriteCookiePathConfig === 'string') {
    //also test for ''
    rewriteCookiePathConfig = { '*': rewriteCookiePathConfig };
  }

  // message.rawHeaders is added in: v0.11.6
  // https://nodejs.org/api/http.html#http_message_rawheaders
  if (preserveHeaderKeyCase && proxyRes.rawHeaders != undefined) {
    rawHeaderKeyMap = {};
    for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
      const key = proxyRes.rawHeaders[i];
      rawHeaderKeyMap[key.toLowerCase()] = key;
    }
  }

  Object.keys(proxyRes.headers).forEach(function (key) {
    const header = proxyRes.headers[key];
    if (preserveHeaderKeyCase && rawHeaderKeyMap) {
      key = rawHeaderKeyMap[key] || key;
    }
    setHeader(key, header);
  });
};

/**
 * Set the statusCode from the proxyResponse
 *
 * @type {WebOutgoingPass}
 * @internal
 */
const writeStatusCode = (req, res, proxyRes) => {
  // From Node.js docs: response.writeHead(statusCode[, statusMessage][, headers])
  if (proxyRes.statusMessage) {
    res.statusCode = proxyRes.statusCode;
    res.statusMessage = proxyRes.statusMessage;
  } else {
    res.statusCode = proxyRes.statusCode;
  }
};

module.exports = {
  removeChunked,
  setConnection,
  setRedirectHostRewrite,
  writeHeaders,
  writeStatusCode,
};
