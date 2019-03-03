import {IOptions as GlobOptions} from 'glob';

interface Options extends Readonly<GlobOptions> {
	/**
	 * Allow deleting the current working directory and outside.
	 *
	 * @default false
	 */
	readonly force?: boolean;

	/**
	 * See what would be deleted.
	 *
	 * @default false
	 *
	 * @example
	 *
	 * import del from 'del';
	 *
	 * (async () => {
	 * 	const deletedPaths = await del(['tmp/*.js'], {dryRun: true});
	 *
	 * 	console.log('Files and folders that would be deleted:\n', deletedPaths.join('\n'));
	 * })();
	 */
	readonly dryRun?: boolean;

	/**
	 * Concurrency limit. Minimum: `1`.
	 *
	 * @default Infinity
	 */
	readonly concurrency?: number;
}

/**
 * Delete files and folders using glob patterns.
 *
 * @param patterns - See supported minimatch [patterns](https://github.com/isaacs/minimatch#usage).
 * - [Pattern examples with expected matches](https://github.com/sindresorhus/multimatch/blob/master/test/test.js)
 * - [Quick globbing pattern overview](https://github.com/sindresorhus/multimatch#globbing-patterns)
 * @param options - See the [`glob` options](https://github.com/isaacs/node-glob#options).
 * @returns A promise for an array of deleted paths.
 */
export default function del(
	patterns: string | ReadonlyArray<string>,
	options?: Options
): Promise<string[]>;

/**
 * Synchronously delete files and folders using glob patterns.
 *
 * @param patterns - See supported minimatch [patterns](https://github.com/isaacs/minimatch#usage).
 * - [Pattern examples with expected matches](https://github.com/sindresorhus/multimatch/blob/master/test/test.js)
 * - [Quick globbing pattern overview](https://github.com/sindresorhus/multimatch#globbing-patterns)
 * @param options - See the [`glob` options](https://github.com/isaacs/node-glob#options).
 * @returns An array of deleted paths.
 */
export function sync(
	patterns: string | ReadonlyArray<string>,
	options?: Options
): string[];
