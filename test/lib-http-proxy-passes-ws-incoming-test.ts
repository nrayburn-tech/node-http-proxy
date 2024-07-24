import { checkMethodAndHeader, XHeaders } from '../lib/passes/ws-incoming';
import { describe, expect, it } from 'vitest';
import http from 'node:http';
import { Duplex } from 'node:stream';

describe('lib/passes/ws-incoming.ts', () => {
  describe('#checkMethodAndHeader', () => {
    it('should drop non-GET connections', () => {
      let destroyCalled = false;
      const stubRequest = {
          method: 'DELETE',
          headers: {},
        },
        stubSocket = {
          destroy: function () {
            // Simulate Socket.destroy() method when call
            destroyCalled = true;
          },
        };
      const returnValue = checkMethodAndHeader(
        stubRequest as http.IncomingMessage,
        stubSocket as Duplex,
      );
      expect(returnValue).toBe(true);
      expect(destroyCalled).toBe(true);
    });

    it('should drop connections when no upgrade header', () => {
      let destroyCalled = false;
      const stubRequest = {
          method: 'GET',
          headers: {},
        },
        stubSocket = {
          destroy: function () {
            // Simulate Socket.destroy() method when call
            destroyCalled = true;
          },
        };
      const returnValue = checkMethodAndHeader(
        stubRequest as http.IncomingMessage,
        stubSocket as Duplex,
      );
      expect(returnValue).toBe(true);
      expect(destroyCalled).toBe(true);
    });

    it('should drop connections when upgrade header is different of `websocket`', () => {
      let destroyCalled = false;
      const stubRequest = {
          method: 'GET',
          headers: {
            upgrade: 'anotherprotocol',
          },
        },
        stubSocket = {
          destroy: function () {
            // Simulate Socket.destroy() method when call
            destroyCalled = true;
          },
        };
      const returnValue = checkMethodAndHeader(
        stubRequest as http.IncomingMessage,
        stubSocket as Duplex,
      );
      expect(returnValue).toBe(true);
      expect(destroyCalled).toBe(true);
    });

    it('should return nothing when all is ok', () => {
      let destroyCalled = false;
      const stubRequest = {
          method: 'GET',
          headers: {
            upgrade: 'websocket',
          },
        },
        stubSocket = {
          destroy: function () {
            // Simulate Socket.destroy() method when call
            destroyCalled = true;
          },
        };
      const returnValue = checkMethodAndHeader(
        stubRequest as http.IncomingMessage,
        stubSocket as Duplex,
      );
      expect(returnValue).toBe(undefined);
      expect(destroyCalled).toBe(false);
    });
  });

  describe('#XHeaders', () => {
    it('return if no forward request', () => {
      const returnValue = XHeaders(
        {} as http.IncomingMessage,
        {} as Duplex,
        {},
      );
      expect(returnValue).toBe(undefined);
    });

    it('set the correct x-forwarded-* headers from req.connection', () => {
      const stubRequest = {
        connection: {
          remoteAddress: '192.168.1.2',
          remotePort: '8080',
        },
        headers: {
          host: '192.168.1.2:8080',
        },
      } as unknown as http.IncomingMessage;
      XHeaders(stubRequest, {} as Duplex, { xfwd: true });
      expect(stubRequest.headers['x-forwarded-for']).toBe('192.168.1.2');
      expect(stubRequest.headers['x-forwarded-port']).toBe('8080');
      expect(stubRequest.headers['x-forwarded-proto']).toBe('ws');
    });

    it('set the correct x-forwarded-* headers from req.socket', () => {
      const stubRequest = {
        socket: {
          remoteAddress: '192.168.1.3',
          remotePort: '8181',
        },
        connection: {
          pair: true,
        },
        headers: {
          host: '192.168.1.3:8181',
        },
      } as unknown as http.IncomingMessage;
      XHeaders(stubRequest, {} as Duplex, { xfwd: true });
      expect(stubRequest.headers['x-forwarded-for']).toBe('192.168.1.3');
      expect(stubRequest.headers['x-forwarded-port']).toBe('8181');
      expect(stubRequest.headers['x-forwarded-proto']).toBe('wss');
    });
  });
});
