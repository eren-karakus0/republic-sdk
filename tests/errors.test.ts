import { describe, it, expect } from 'vitest';
import {
  RepublicError,
  RpcError,
  RestError,
  BroadcastError,
  TimeoutError,
  ValidationError,
  AccountNotFoundError,
} from '../src/errors';

describe('Error classes', () => {
  describe('RepublicError', () => {
    it('should be an instance of Error', () => {
      const err = new RepublicError('test');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(RepublicError);
      expect(err.name).toBe('RepublicError');
      expect(err.message).toBe('test');
    });
  });

  describe('RpcError', () => {
    it('should contain code and endpoint', () => {
      const err = new RpcError('rpc failed', -32603, 'https://rpc.test.io');
      expect(err).toBeInstanceOf(RepublicError);
      expect(err).toBeInstanceOf(RpcError);
      expect(err.name).toBe('RpcError');
      expect(err.code).toBe(-32603);
      expect(err.endpoint).toBe('https://rpc.test.io');
    });
  });

  describe('RestError', () => {
    it('should contain statusCode and endpoint', () => {
      const err = new RestError('not found', 404, '/cosmos/auth/v1beta1/accounts/test');
      expect(err).toBeInstanceOf(RepublicError);
      expect(err.name).toBe('RestError');
      expect(err.statusCode).toBe(404);
      expect(err.endpoint).toBe('/cosmos/auth/v1beta1/accounts/test');
    });
  });

  describe('BroadcastError', () => {
    it('should contain code, log, and optional hash', () => {
      const err = new BroadcastError('broadcast failed', 4, 'sig verify fail', 'ABCDEF');
      expect(err).toBeInstanceOf(RepublicError);
      expect(err.name).toBe('BroadcastError');
      expect(err.code).toBe(4);
      expect(err.log).toBe('sig verify fail');
      expect(err.hash).toBe('ABCDEF');
    });

    it('should work without hash', () => {
      const err = new BroadcastError('broadcast failed', 5, 'out of gas');
      expect(err.hash).toBeUndefined();
    });
  });

  describe('TimeoutError', () => {
    it('should be a RepublicError', () => {
      const err = new TimeoutError('timeout waiting for tx');
      expect(err).toBeInstanceOf(RepublicError);
      expect(err.name).toBe('TimeoutError');
    });
  });

  describe('ValidationError', () => {
    it('should be a RepublicError', () => {
      const err = new ValidationError('invalid address');
      expect(err).toBeInstanceOf(RepublicError);
      expect(err.name).toBe('ValidationError');
    });
  });

  describe('AccountNotFoundError', () => {
    it('should contain address', () => {
      const err = new AccountNotFoundError('rai1test');
      expect(err).toBeInstanceOf(RepublicError);
      expect(err.name).toBe('AccountNotFoundError');
      expect(err.address).toBe('rai1test');
      expect(err.message).toContain('rai1test');
    });
  });
});
