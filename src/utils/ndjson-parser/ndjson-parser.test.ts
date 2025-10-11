import { describe, it, expect, beforeEach } from 'vitest';
import { NDJSONStreamParser } from './ndjson-parser';

describe('NDJSONStreamParser', () => {
  let parser: NDJSONStreamParser;
  let receivedMessages: any[];

  beforeEach(() => {
    receivedMessages = [];
    parser = new NDJSONStreamParser((message) => {
      receivedMessages.push(message);
    });
  });

  describe('processChunk', () => {
    it('should parse a single complete JSON message', () => {
      const chunk = '{"type":"test","data":"hello"}\n';
      
      parser.processChunk(chunk);
      
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual({
        type: 'test',
        data: 'hello'
      });
    });

    it('should parse multiple JSON messages in one chunk', () => {
      const chunk = '{"id":1,"name":"first"}\n{"id":2,"name":"second"}\n{"id":3,"name":"third"}\n';
      
      parser.processChunk(chunk);
      
      expect(receivedMessages).toHaveLength(3);
      expect(receivedMessages[0]).toEqual({ id: 1, name: 'first' });
      expect(receivedMessages[1]).toEqual({ id: 2, name: 'second' });
      expect(receivedMessages[2]).toEqual({ id: 3, name: 'third' });
    });

    it('should handle partial messages across chunks', () => {
      const chunk1 = '{"type":"partial","data":';
      const chunk2 = '"incomplete message"';
      const chunk3 = ',"status":"ok"}\n';
      
      parser.processChunk(chunk1);
      expect(receivedMessages).toHaveLength(0);
      
      parser.processChunk(chunk2);
      expect(receivedMessages).toHaveLength(0);
      
      parser.processChunk(chunk3);
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual({
        type: 'partial',
        data: 'incomplete message',
        status: 'ok'
      });
    });

    it('should handle empty lines', () => {
      const chunk = '{"id":1}\n\n\n{"id":2}\n\n';
      
      parser.processChunk(chunk);
      
      expect(receivedMessages).toHaveLength(2);
      expect(receivedMessages[0]).toEqual({ id: 1 });
      expect(receivedMessages[1]).toEqual({ id: 2 });
    });

    it('should handle invalid JSON gracefully', () => {
      const chunk = '{"valid":true}\n{invalid json}\n{"alsoValid":true}\n';
      
      parser.processChunk(chunk);
      
      expect(receivedMessages).toHaveLength(2);
      expect(receivedMessages[0]).toEqual({ valid: true });
      expect(receivedMessages[1]).toEqual({ alsoValid: true });
    });

    it('should handle mixed line endings', () => {
      const chunk = '{"unix":true}\n{"windows":true}\r\n{"mixed":true}\r\n';
      
      parser.processChunk(chunk);
      
      expect(receivedMessages).toHaveLength(3);
      expect(receivedMessages[0]).toEqual({ unix: true });
      expect(receivedMessages[1]).toEqual({ windows: true });
      expect(receivedMessages[2]).toEqual({ mixed: true });
    });

    it('should handle special characters in JSON', () => {
      const chunk = '{"text":"Hello\\nWorld","emoji":"😊","unicode":"\\u0048\\u0065\\u006c\\u006c\\u006f"}\n';
      
      parser.processChunk(chunk);
      
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual({
        text: 'Hello\nWorld',
        emoji: '😊',
        unicode: 'Hello'
      });
    });

    it('should handle nested objects', () => {
      const chunk = '{"user":{"id":1,"name":"John","address":{"city":"NYC","zip":"10001"}},"active":true}\n';
      
      parser.processChunk(chunk);
      
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual({
        user: {
          id: 1,
          name: 'John',
          address: {
            city: 'NYC',
            zip: '10001'
          }
        },
        active: true
      });
    });

    it('should handle arrays in JSON', () => {
      const chunk = '{"items":[1,2,3],"tags":["a","b","c"],"matrix":[[1,2],[3,4]]}\n';
      
      parser.processChunk(chunk);
      
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual({
        items: [1, 2, 3],
        tags: ['a', 'b', 'c'],
        matrix: [[1, 2], [3, 4]]
      });
    });

    it('should handle large messages split across many chunks', () => {
      const largeObject = {
        id: 'test-123',
        data: 'x'.repeat(1000),
        nested: {
          level1: {
            level2: {
              level3: {
                value: 'deep'
              }
            }
          }
        }
      };
      
      const fullMessage = JSON.stringify(largeObject) + '\n';
      const chunkSize = 100;
      
      // Split into small chunks
      for (let i = 0; i < fullMessage.length; i += chunkSize) {
        parser.processChunk(fullMessage.slice(i, i + chunkSize));
      }
      
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual(largeObject);
    });

    it('should maintain buffer state correctly', () => {
      // Send incomplete message
      parser.processChunk('{"incomplete":');
      
      // Complete the first message with newline
      parser.processChunk('false}\n');
      
      // Send another complete message
      parser.processChunk('{"complete":true}\n');
      
      expect(receivedMessages).toHaveLength(2);
      expect(receivedMessages[0]).toEqual({ incomplete: false });
      expect(receivedMessages[1]).toEqual({ complete: true });
    });

    it('should handle numeric values correctly', () => {
      const chunk = '{"int":42,"float":3.14,"negative":-100,"scientific":1.23e-4,"zero":0}\n';
      
      parser.processChunk(chunk);
      
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual({
        int: 42,
        float: 3.14,
        negative: -100,
        scientific: 0.000123,
        zero: 0
      });
    });

    it('should handle boolean and null values', () => {
      const chunk = '{"true":true,"false":false,"null":null,"undefined":null}\n';
      
      parser.processChunk(chunk);
      
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual({
        true: true,
        false: false,
        null: null,
        undefined: null
      });
    });

    it('should process streaming data from simulated WebSocket', () => {
      // Simulate WebSocket-like streaming
      const messages = [
        { type: 'start', id: 1 },
        { type: 'progress', percent: 50 },
        { type: 'complete', id: 1, result: 'success' }
      ];
      
      // Simulate streaming with partial chunks
      parser.processChunk(JSON.stringify(messages[0]).slice(0, 10));
      parser.processChunk(JSON.stringify(messages[0]).slice(10) + '\n');
      parser.processChunk(JSON.stringify(messages[1]) + '\n' + JSON.stringify(messages[2]));
      parser.processChunk('\n');
      
      expect(receivedMessages).toHaveLength(3);
      expect(receivedMessages).toEqual(messages);
    });
  });
});