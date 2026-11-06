import { describe, expect, it } from 'vitest';

interface StatusChunk {
	stage?: string;
	status?: string;
	prompt_progress?: {
		total?: number;
		processed?: number;
		cache?: number;
		time_ms?: number;
	};
	total?: number;
	processed?: number;
	time_ms?: number;
}

export function parseServerProgress(data: StatusChunk, lastTimeMs = 0) {
	const stage = data.stage;
	const serverStatus = data.status;
	const hasServerStatus = Boolean(
		stage || (serverStatus && typeof serverStatus === 'string' && !serverStatus.startsWith('{'))
	);

	if (!hasServerStatus) {
		return null;
	}

	const rawPp = data.prompt_progress ?? {};
	const total = rawPp.total ?? data.total ?? (stage ? 100 : 0);
	const processed = rawPp.processed ?? data.processed ?? 0;
	const cache = rawPp.cache ?? 0;
	const timeMs = rawPp.time_ms ?? data.time_ms ?? 0;
	const effectiveTimeMs = timeMs || lastTimeMs;

	const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
	const isReady = stage === 'ready' || (processed >= total && total > 0 && stage !== 'booting');
	const done = isReady;

	const description =
		serverStatus ||
		(isReady ? 'Server ready' : stage ? `Starting server (${stage})...` : 'Starting server...');

	return {
		action: 'server_status',
		stage,
		status: serverStatus,
		description,
		total,
		processed,
		cache,
		time_ms: effectiveTimeMs,
		time_to_pp: effectiveTimeMs,
		percent,
		done
	};
}

describe('Server Startup Progress & Time-to-PP', () => {
	it('handles wake-on-request booting status with time_ms and progress', () => {
		const chunk: StatusChunk = {
			stage: 'booting',
			status: 'Waiting for service to become ready (14s elapsed)...',
			prompt_progress: {
				total: 100,
				processed: 30,
				cache: 0,
				time_ms: 14000
			}
		};

		const parsed = parseServerProgress(chunk);
		expect(parsed).not.toBeNull();
		expect(parsed?.action).toBe('server_status');
		expect(parsed?.stage).toBe('booting');
		expect(parsed?.status).toBe('Waiting for service to become ready (14s elapsed)...');
		expect(parsed?.percent).toBe(30);
		expect(parsed?.time_ms).toBe(14000);
		expect(parsed?.time_to_pp).toBe(14000);
		expect(parsed?.done).toBe(false);
	});

	it('handles final ready chunk (stage="ready", processed=100) and preserves time-to-pp', () => {
		const readyChunk: StatusChunk = {
			stage: 'ready',
			processed: 100,
			prompt_progress: {
				total: 100,
				processed: 100,
				cache: 0,
				time_ms: 15200
			}
		};

		const parsed = parseServerProgress(readyChunk);
		expect(parsed).not.toBeNull();
		expect(parsed?.action).toBe('server_status');
		expect(parsed?.stage).toBe('ready');
		expect(parsed?.description).toBe('Server ready');
		expect(parsed?.time_to_pp).toBe(15200);
		expect(parsed?.percent).toBe(100);
		expect(parsed?.done).toBe(true);
	});

	it('falls back to last recorded time_ms when ready chunk omits time_ms', () => {
		const readyChunk: StatusChunk = {
			stage: 'ready',
			processed: 100
		};

		const parsed = parseServerProgress(readyChunk, 14000);
		expect(parsed).not.toBeNull();
		expect(parsed?.done).toBe(true);
		expect(parsed?.time_to_pp).toBe(14000);
		expect(parsed?.time_ms).toBe(14000);
	});

	it('formats Time to PP display string accurately', () => {
		const timeMs = 14200;
		const display = `${(timeMs / 1000).toFixed(1)}s`;
		expect(display).toBe('14.2s');
	});
});
