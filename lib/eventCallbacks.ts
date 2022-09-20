import { ClientRequest, IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { Duplex } from 'node:stream';
import { ResolvedProxyServerOptions } from './proxyServer';

// Web events
export type WebEconnResetCallback = (
  err: Error,
  req: IncomingMessage,
  res: ServerResponse,
  target: ResolvedProxyServerOptions['target'],
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
  url: ResolvedProxyServerOptions['target'],
) => void;
export type WebReqCallback = (
  proxyReq: ClientRequest,
  req: IncomingMessage,
  res: ServerResponse,
  options: ResolvedProxyServerOptions,
) => void;
export type WebResCallback = (
  proxyRes: IncomingMessage,
  req: IncomingMessage,
  res: ServerResponse,
) => void;
export type WebStartCallback = (
  req: IncomingMessage,
  res: ServerResponse,
  target: ResolvedProxyServerOptions['target'],
) => void;
// Websocket events
export type WebSocketCloseCallback = (
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
  socket: Duplex,
  options: ResolvedProxyServerOptions,
  head: Buffer,
) => void;
export type WebSocketOpenCallback = (socket: Socket) => void;

export type UnknownErrorCallback = (err: Error) => void;
