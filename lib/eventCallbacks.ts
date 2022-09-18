// Web events
import { ClientRequest, IncomingMessage, ServerResponse } from 'http';
import { Duplex } from 'stream';
import { Socket } from 'net';
import { ProxyTargetUrl, ResolvedServerOptions } from './index';

export type WebEconnResetCallback = (
  err: Error,
  req: IncomingMessage,
  res: ServerResponse,
  target: ProxyTargetUrl,
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
  url: ResolvedServerOptions['target'],
) => void;
export type WebReqCallback = (
  proxyReq: ClientRequest,
  req: IncomingMessage,
  res: ServerResponse,
  options: ResolvedServerOptions,
) => void;
export type WebResCallback = (
  proxyRes: IncomingMessage,
  req: IncomingMessage,
  res: ServerResponse,
) => void;
export type WebStartCallback = (
  req: IncomingMessage,
  res: ServerResponse,
  target: ResolvedServerOptions['target'],
) => void;
// Websocket events
export type WebSocketCloseCallback = (
  err: Error,
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
  socket: Socket,
  options: ResolvedServerOptions,
  head: Buffer,
) => void;
export type WebSocketOpenCallback = (socket: Socket) => void;
