import { describe, expect, it } from 'vitest';
import { getRegistrableDomain } from './utils';

// Note: `isCrossSitePreview` and `isAppleWebKitBrowser` depend on `window`/
// `navigator` and are exercised in the browser, not this workers-pool harness.
// The registrable-domain heuristic they build on is pure and covered here.
describe('getRegistrableDomain', () => {
	it('returns the eTLD+1 for simple hosts', () => {
		expect(getRegistrableDomain('app.example.com')).toBe('example.com');
		expect(getRegistrableDomain('preview.example.com')).toBe('example.com');
		expect(getRegistrableDomain('example.com')).toBe('example.com');
	});

	it('treats different registrable domains as distinct', () => {
		expect(getRegistrableDomain('myapp.com')).not.toBe(
			getRegistrableDomain('mypreview.dev'),
		);
	});

	it('handles common multi-part public suffixes', () => {
		expect(getRegistrableDomain('app.example.co.uk')).toBe('example.co.uk');
		expect(getRegistrableDomain('preview.example.com.au')).toBe('example.com.au');
	});

	it('strips the port and trailing dot, and lowercases', () => {
		expect(getRegistrableDomain('App.Example.com:8080')).toBe('example.com');
		expect(getRegistrableDomain('example.com.')).toBe('example.com');
	});

	it('handles single-label and empty hosts', () => {
		expect(getRegistrableDomain('localhost')).toBe('localhost');
		expect(getRegistrableDomain('')).toBe('');
	});
});
