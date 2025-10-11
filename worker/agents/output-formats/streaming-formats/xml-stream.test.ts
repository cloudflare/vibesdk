/**
 * Comprehensive tests for XmlStreamFormat
 * Tests streaming parsing, error handling, fallback logic, and edge cases
 */

import { XmlStreamFormat, XmlStreamingCallbacks } from './xml-stream';

describe('XmlStreamFormat', () => {
    let parser: XmlStreamFormat;
    let mockCallbacks: jest.Mocked<XmlStreamingCallbacks>;
    
    beforeEach(() => {
        parser = new XmlStreamFormat();
        mockCallbacks = {
            onElementStart: jest.fn(),
            onElementContent: jest.fn(),
            onElementComplete: jest.fn(),
            onParsingError: jest.fn(),
        };
    });

    describe('Basic XML Parsing', () => {
        test('should parse simple XML elements', () => {
            const xml = '<user_response>Hello world</user_response>';
            const config = { targetElements: ['user_response'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(xml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            const userResponse = elements.get('user_response');
            expect(userResponse).toBeDefined();
            expect(userResponse![0].content).toBe('Hello world');
            expect(userResponse![0].isComplete).toBe(true);
        });

        test('should parse multiple elements', () => {
            const xml = `
                <user_response>Response here</user_response>
                <enhanced_user_request>Enhanced request</enhanced_user_request>
            `;
            const config = { targetElements: ['user_response', 'enhanced_user_request'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(xml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            expect(elements.get('user_response')![0].content.trim()).toBe('Response here');
            expect(elements.get('enhanced_user_request')![0].content.trim()).toBe('Enhanced request');
        });

        test('should parse elements with attributes', () => {
            const xml = '<element id="123" class="test">Content</element>';
            const config = { targetElements: ['element'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(xml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            const element = elements.get('element')![0];
            expect(element.attributes.id).toBe('123');
            expect(element.attributes.class).toBe('test');
            expect(element.content).toBe('Content');
        });

        test('should handle self-closing tags', () => {
            const xml = '<empty_element id="test" />';
            const config = { targetElements: ['empty_element'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(xml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            const element = elements.get('empty_element')![0];
            expect(element.attributes.id).toBe('test');
            expect(element.content).toBe('');
            expect(element.isComplete).toBe(true);
        });
    });

    describe('Streaming Functionality', () => {
        test('should stream element content in real-time', () => {
            const config = { 
                targetElements: ['user_response'], 
                streamingElements: ['user_response'] 
            };
            let state = parser.initializeXmlState(config);
            
            // Stream opening tag and partial content
            state = parser.parseXmlStream('<user_response>Hello', state, mockCallbacks, config);
            expect(mockCallbacks.onElementContent).toHaveBeenCalledWith('user_response', 'Hello', false);
            
            // Stream more content
            state = parser.parseXmlStream(' world', state, mockCallbacks, config);
            expect(mockCallbacks.onElementContent).toHaveBeenCalledWith('user_response', ' world', false);
            
            // Stream closing tag
            state = parser.parseXmlStream('</user_response>', state, mockCallbacks, config);
            expect(mockCallbacks.onElementComplete).toHaveBeenCalled();
        });

        test('should handle chunked XML tags', () => {
            const config = { targetElements: ['test'] };
            let state = parser.initializeXmlState(config);
            
            // Tag split across chunks
            state = parser.parseXmlStream('<te', state, mockCallbacks, config);
            state = parser.parseXmlStream('st>Content</te', state, mockCallbacks, config);
            state = parser.parseXmlStream('st>', state, mockCallbacks, config);
            
            const elements = parser.finalizeXmlParsing(state);
            expect(elements.get('test')![0].content).toBe('Content');
        });

        test('should handle large content chunks', () => {
            const largeContent = 'x'.repeat(5000);
            const xml = `<large_element>${largeContent}</large_element>`;
            const config = { targetElements: ['large_element'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(xml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            expect(elements.get('large_element')![0].content).toBe(largeContent);
        });
    });

    describe('Error Handling and Fallback', () => {
        test('should handle malformed XML gracefully', () => {
            const malformedXml = '<user_response>Content without closing tag';
            const config = { targetElements: ['user_response'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(malformedXml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            // Should still extract content via fallback
            expect(elements.get('user_response')).toBeDefined();
            expect(state.hasParsingErrors).toBe(false); // Fallback handles this gracefully
        });

        test('should handle mismatched tags', () => {
            const mismatchedXml = '<user_response>Content</wrong_tag>';
            const config = { targetElements: ['user_response'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(mismatchedXml, state, mockCallbacks, config);
            
            expect(mockCallbacks.onParsingError).toHaveBeenCalled();
            expect(state.hasParsingErrors).toBe(true);
        });

        test('should handle empty input', () => {
            const config = { targetElements: ['test'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream('', state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            expect(elements.size).toBe(0);
            expect(state.hasParsingErrors).toBe(false);
        });

        test('should handle XML with no target elements', () => {
            const xml = '<other_element>Content</other_element>';
            const config = { targetElements: ['user_response'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(xml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            expect(elements.get('user_response')).toBeUndefined();
            expect(elements.get('other_element')).toBeUndefined();
        });

        test('should use fallback extraction for malformed content', () => {
            const malformedXml = '<user_response>Good content</user_response><enhanced_user_request>Also good';
            const config = { targetElements: ['user_response', 'enhanced_user_request'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(malformedXml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            expect(elements.get('user_response')![0].content).toBe('Good content');
            expect(elements.get('enhanced_user_request')![0].content).toBe('Also good');
        });
    });

    describe('Buffer Management', () => {
        test('should limit buffer size to prevent memory issues', () => {
            const hugeContent = 'x'.repeat(20000);
            const config = { 
                targetElements: ['test'], 
                maxBufferSize: 5000 
            };
            let state = parser.initializeXmlState(config);
            
            // This should not cause memory issues
            state = parser.parseXmlStream(hugeContent, state, mockCallbacks, config);
            
            // Buffer should be limited
            expect(state.contentBuffer.length).toBeLessThan(15000);
        });

        test('should handle partial XML tags at buffer boundaries', () => {
            const config = { targetElements: ['test'] };
            let state = parser.initializeXmlState(config);
            
            // Add content that ends with partial tag
            const contentWithPartialTag = 'some content <tes';
            state = parser.parseXmlStream(contentWithPartialTag, state, mockCallbacks, config);
            
            // Complete the tag
            state = parser.parseXmlStream('t>Final content</test>', state, mockCallbacks, config);
            
            const elements = parser.finalizeXmlParsing(state);
            expect(elements.get('test')![0].content).toBe('Final content');
        });
    });

    describe('Configuration Options', () => {
        test('should respect case sensitivity setting', () => {
            const xml = '<USER_RESPONSE>Content</USER_RESPONSE>';
            
            // Case insensitive (default)
            const insensitiveConfig = { 
                targetElements: ['user_response'],
                caseSensitive: false 
            };
            let state1 = parser.initializeXmlState(insensitiveConfig);
            state1 = parser.parseXmlStream(xml, state1, mockCallbacks, insensitiveConfig);
            const elements1 = parser.finalizeXmlParsing(state1);
            
            expect(elements1.get('user_response')).toBeDefined();
            
            // Case sensitive
            const sensitiveConfig = { 
                targetElements: ['user_response'],
                caseSensitive: true 
            };
            let state2 = parser.initializeXmlState(sensitiveConfig);
            state2 = parser.parseXmlStream(xml, state2, mockCallbacks, sensitiveConfig);
            const elements2 = parser.finalizeXmlParsing(state2);
            
            expect(elements2.get('user_response')).toBeUndefined();
        });

        test('should only extract target elements when specified', () => {
            const xml = `
                <user_response>Response</user_response>
                <enhanced_user_request>Request</enhanced_user_request>
                <other_element>Other</other_element>
            `;
            
            const config = { targetElements: ['user_response'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(xml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            expect(elements.get('user_response')).toBeDefined();
            expect(elements.get('enhanced_user_request')).toBeUndefined();
            expect(elements.get('other_element')).toBeUndefined();
        });

        test('should extract all elements when no targets specified', () => {
            const xml = `
                <element1>Content1</element1>
                <element2>Content2</element2>
            `;
            
            const config = {}; // No target elements = extract all
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(xml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            expect(elements.get('element1')).toBeDefined();
            expect(elements.get('element2')).toBeDefined();
        });
    });

    describe('Nested Elements', () => {
        test('should handle simple nested elements', () => {
            const xml = '<parent><child>Child content</child>Parent content</parent>';
            const config = { targetElements: ['parent'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(xml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            const parent = elements.get('parent')![0];
            expect(parent.children).toHaveLength(1);
            expect(parent.children[0].tagName).toBe('child');
            expect(parent.children[0].content).toBe('Child content');
        });

        test('should handle deeply nested elements', () => {
            const xml = `
                <level1>
                    <level2>
                        <level3>Deep content</level3>
                    </level2>
                </level1>
            `;
            const config = { targetElements: ['level1'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(xml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            const level1 = elements.get('level1')![0];
            expect(level1.children).toHaveLength(1);
            expect(level1.children[0].children).toHaveLength(1);
            expect(level1.children[0].children[0].content.trim()).toBe('Deep content');
        });
    });

    describe('Real-world LLM Response Scenarios', () => {
        test('should handle typical conversation response format', () => {
            const conversationXml = `
                <user_response>
                I understand your request. I'll help you implement this feature in the next development phase.
                </user_response>
                
                <enhanced_user_request>
                Add a dark mode toggle to the application header with persistent user preference storage
                </enhanced_user_request>
            `;
            
            const config = { 
                targetElements: ['user_response', 'enhanced_user_request'],
                streamingElements: ['user_response']
            };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(conversationXml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            const userResponse = elements.get('user_response')![0];
            const enhancedRequest = elements.get('enhanced_user_request')![0];
            
            expect(userResponse.content.trim()).toContain('I understand your request');
            expect(enhancedRequest.content.trim()).toContain('dark mode toggle');
            expect(mockCallbacks.onElementContent).toHaveBeenCalled();
        });

        test('should handle streaming chunks that break mid-word', () => {
            const config = { 
                targetElements: ['user_response'], 
                streamingElements: ['user_response'] 
            };
            let state = parser.initializeXmlState(config);
            
            // Simulate real streaming where words can be broken
            state = parser.parseXmlStream('<user_response>The quick bro', state, mockCallbacks, config);
            state = parser.parseXmlStream('wn fox jumps over the', state, mockCallbacks, config);
            state = parser.parseXmlStream(' lazy dog</user_response>', state, mockCallbacks, config);
            
            const elements = parser.finalizeXmlParsing(state);
            expect(elements.get('user_response')![0].content).toBe('The quick brown fox jumps over the lazy dog');
        });

        test('should handle LLM responses with extra whitespace and formatting', () => {
            const messyXml = `
                
                    <user_response>
                        
                        This is a response with lots of
                        whitespace and line breaks.
                        
                    </user_response>
                    
                    <enhanced_user_request>
                        
                        Clean up the formatting
                        
                    </enhanced_user_request>
                
            `;
            
            const config = { targetElements: ['user_response', 'enhanced_user_request'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(messyXml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            expect(elements.get('user_response')).toBeDefined();
            expect(elements.get('enhanced_user_request')).toBeDefined();
            expect(elements.get('user_response')![0].content).toContain('This is a response');
        });

        test('should handle incomplete LLM responses gracefully', () => {
            const incompleteXml = '<user_response>This response was cut off mid-sente';
            const config = { targetElements: ['user_response'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(incompleteXml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            // Should still extract what content is available
            expect(elements.get('user_response')![0].content).toContain('This response was cut off');
        });
    });

    describe('Edge Cases and Stress Tests', () => {
        test('should handle empty elements', () => {
            const xml = '<empty></empty><self_empty/>';
            const config = { targetElements: ['empty', 'self_empty'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(xml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            expect(elements.get('empty')![0].content).toBe('');
            expect(elements.get('self_empty')![0].content).toBe('');
        });

        test('should handle elements with special characters', () => {
            const xml = '<test>Content with &lt;special&gt; chars &amp; symbols</test>';
            const config = { targetElements: ['test'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(xml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            expect(elements.get('test')![0].content).toContain('&lt;special&gt;');
        });

        test('should handle very long element names', () => {
            const longElementName = 'very_long_element_name_that_goes_on_and_on_and_on';
            const xml = `<${longElementName}>Content</${longElementName}>`;
            const config = { targetElements: [longElementName] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(xml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            expect(elements.get(longElementName.toLowerCase())).toBeDefined();
        });

        test('should handle multiple instances of the same element', () => {
            const xml = '<item>First</item><item>Second</item><item>Third</item>';
            const config = { targetElements: ['item'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(xml, state, mockCallbacks, config);
            const elements = parser.finalizeXmlParsing(state);
            
            const items = elements.get('item');
            expect(items).toHaveLength(3);
            expect(items![0].content).toBe('First');
            expect(items![1].content).toBe('Second');
            expect(items![2].content).toBe('Third');
        });
    });

    describe('Utility Functions', () => {
        test('should provide helper methods for element access', () => {
            const xml = '<test>Content</test><other>Other content</other>';
            const config = { targetElements: ['test', 'other'] };
            let state = parser.initializeXmlState(config);
            
            state = parser.parseXmlStream(xml, state, mockCallbacks, config);
            parser.finalizeXmlParsing(state);
            
            const testElement = parser.getElement(state, 'test');
            const allOtherElements = parser.getElements(state, 'other');
            
            expect(testElement?.content).toBe('Content');
            expect(allOtherElements).toHaveLength(1);
            expect(allOtherElements[0].content).toBe('Other content');
        });

        test('should return null for non-existent elements', () => {
            let state = parser.initializeXmlState({});
            
            const nonExistent = parser.getElement(state, 'nonexistent');
            const nonExistentArray = parser.getElements(state, 'nonexistent');
            
            expect(nonExistent).toBeNull();
            expect(nonExistentArray).toHaveLength(0);
        });
    });
});