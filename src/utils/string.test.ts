import { describe, expect, it } from 'vitest';
import { normalizeAppTitle } from './string';

describe('normalizeAppTitle', () => {
	it('converts a title to a lowercase, hyphenated directory name', () => {
		expect(normalizeAppTitle('My Todo App')).toBe('my-todo-app');
		expect(normalizeAppTitle('  Hello,   World!  ')).toBe('hello-world');
		expect(normalizeAppTitle('--Weather - Dashboard--')).toBe('weather-dashboard');
	});

	it('keeps the ASCII part of a mixed-script title', () => {
		expect(normalizeAppTitle('Café menu')).toBe('caf-menu');
	});

	it('falls back to "app" when no ASCII letters or digits remain', () => {
		expect(normalizeAppTitle('待办事项应用')).toBe('app');
		expect(normalizeAppTitle('Список дел')).toBe('app');
		expect(normalizeAppTitle('🎮 !!')).toBe('app');
		expect(normalizeAppTitle('')).toBe('app');
	});
});
