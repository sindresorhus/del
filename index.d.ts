import {type GlobbyOptions} from 'globby';

export type ProgressData = {
	/**
	Deleted files and directories count, or the count of what the `dryRun` option would have deleted.
	*/
	readonly deletedCount: number;

	/**
	Total files and directories count.
	*/
	readonly totalCount: number;

	/**
	Completed percentage. A value between `0` and `1`.
	*/
	readonly percent: number;

	/**
	The absolute path of the deleted file or directory, or the one the `dryRun` option would have deleted.

	It will not be present if nothing was deleted.
	*/
	readonly path?: string;
};

export type Options = {
	/**
	Allow deleting the current working directory and outside.

	@default false
	*/
	readonly force?: boolean;

	/**
	See what would be deleted.

	@default false

	@example
	```
	import {deleteAsync} from 'del';

	const deletedPaths = await deleteAsync(['temp/*.js'], {dryRun: true});

	console.log('Files and directories that would be deleted:\n', deletedPaths.join('\n'));
	```
	*/
	readonly dryRun?: boolean;

	/**
	Concurrency limit. `deleteAsync` applies it to the deletions, where `deleteSync` deletes one path at a time. Both pass it on to globby, where it limits how many directories are read at once. Minimum: `1`.

	The paths are ordered so that a directory is removed after the paths inside it, but that order only holds as far as `concurrency` reaches, so a symlink that is the only route to its target can leave files behind. Use `1` if that matters.

	@default Infinity
	*/
	readonly concurrency?: number;

	/**
	The directory the patterns are relative to, and the boundary that `del` refuses to delete outside of without `force`.

	@default process.cwd()

	@example
	```
	import {deleteSync} from 'del';

	// Deletes `dist` and everything in it, without touching anything above it.
	deleteSync('dist', {cwd: '/var/www/app'});
	```
	*/
	readonly cwd?: string;

	/**
	Called after each file or directory is deleted.

	@example
	```
	import {deleteAsync} from 'del';

	await deleteAsync(patterns, {
		onProgress: progress => {
		// …
	}});
	```
	*/
	readonly onProgress?: (progress: ProgressData) => void;
} & Omit<GlobbyOptions, 'cwd' | 'objectMode' | 'stats'>;

/**
Delete files and directories using glob patterns.

Note that glob patterns can only contain forward-slashes, not backward-slashes. Windows file paths can use backward-slashes as long as the path does not contain any glob-like characters, otherwise use `path.posix.join()` instead of `path.join()`.

@param patterns - See the supported [glob patterns](https://github.com/sindresorhus/globby#globbing-patterns).
- [Pattern examples with expected matches](https://github.com/sindresorhus/multimatch/blob/main/test/test.js)
- [Quick globbing pattern overview](https://github.com/sindresorhus/multimatch#globbing-patterns)
@param options - You can specify any of the [`globby` options](https://github.com/sindresorhus/globby#options) in addition to the `del` options, except `objectMode` and `stats`, which return entries instead of paths. In contrast to the `globby` defaults, `expandDirectories`, `onlyFiles`, and `followSymbolicLinks` are `false` by default.
@returns The deleted paths.

@example
```
import {deleteAsync} from 'del';

const deletedPaths = await deleteAsync(['temp/*.js', '!temp/unicorn.js']);

console.log('Deleted files and directories:\n', deletedPaths.join('\n'));
```
*/
export function deleteAsync(
	patterns: string | readonly string[],
	options?: Options,
): Promise<string[]>;

/**
Synchronously delete files and directories using glob patterns.

Note that glob patterns can only contain forward-slashes, not backward-slashes. Windows file paths can use backward-slashes as long as the path does not contain any glob-like characters, otherwise use `path.posix.join()` instead of `path.join()`.

@param patterns - See the supported [glob patterns](https://github.com/sindresorhus/globby#globbing-patterns).
- [Pattern examples with expected matches](https://github.com/sindresorhus/multimatch/blob/main/test/test.js)
- [Quick globbing pattern overview](https://github.com/sindresorhus/multimatch#globbing-patterns)
@param options - You can specify any of the [`globby` options](https://github.com/sindresorhus/globby#options) in addition to the `del` options, except `objectMode` and `stats`, which return entries instead of paths. In contrast to the `globby` defaults, `expandDirectories`, `onlyFiles`, and `followSymbolicLinks` are `false` by default.
@returns The deleted paths.
*/
export function deleteSync(
	patterns: string | readonly string[],
	options?: Options,
): string[];
