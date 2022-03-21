// v13.1.1 export type GlobbyOptions = import('globby').Options;
export type GlobbyOptions = import('globby').GlobbyOptions;
export interface delOptionPropertys {
	/**
	 * default false
	 */
	force?: boolean;
	/**
	 * default false
	 */
	dryRun?: boolean;
	/**
	 * default false
	 */
	cwd?: string;
}
export type delOptions = delOptionPropertys & GlobbyOptions;
export type patterns = string | readonly string[];

/**
 * Synchronously delete files and directories using glob patterns.
 * Note that glob patterns can only contain forward-slashes, not
 * backward-slashes. Windows file paths can use backward-slashes
 * as long as the path does not contain any glob-like characters,
 * otherwise use `path.posix.join()` instead of `path.join()`.
 * @param {patterns} patterns - See the supported [glob patterns](https://github.com/sindresorhus/globby#globbing-patterns).
 *	- [Pattern examples with expected matches](https://github.com/sindresorhus/multimatch/blob/main/test/test.js)
 *	- [Quick globbing pattern overview](https://github.com/sindresorhus/multimatch#globbing-patterns)
 * @param {delOptions} delOptions - You can specify any of the
 * [`globby` options](https://github.com/sindresorhus/globby#options) in addition to the `delOptions`. In contrast to the `globby` defaults, `expandDirectories`, `onlyFiles`, and `followSymbolicLinks` are `false` by default.
 * @returns {string[]} The deleted paths.
 * @example
 * ```
 * import { delSync } from 'del';
 * console.log('Deleted files and directories:\n', delSync(['temp/*.js', '!temp/unicorn.js']).join('\n'));
 * ```
 */
export function delSync(patterns: patterns, delOptions: delOptions): string[];
/**
 * delete files and directories using glob patterns.
 * Note that glob patterns can only contain forward-slashes, not
 * backward-slashes. Windows file paths can use backward-slashes
 * as long as the path does not contain any glob-like characters,
 * otherwise use `path.posix.join()` instead of `path.join()`.
 * @param {patterns} patterns - See the supported [glob patterns](https://github.com/sindresorhus/globby#globbing-patterns).
 *	- [Pattern examples with expected matches](https://github.com/sindresorhus/multimatch/blob/main/test/test.js)
 *	- [Quick globbing pattern overview](https://github.com/sindresorhus/multimatch#globbing-patterns)
 * @param {delOptions} delOptions - You can specify any of the
 * [`globby` options](https://github.com/sindresorhus/globby#options) in addition to the `delOptions`. In contrast to the `globby` defaults, `expandDirectories`, `onlyFiles`, and `followSymbolicLinks` are `false` by default.
 * @returns {Promise<string[]>} The deleted paths.
 * @example
 * ```
 * import { delAsync } from 'del';
 * const deleteAndLogPathes = async (pathesToDelete) => {
 *	const deletedPaths = await del(pathesToDelete);
 *	console.log('Deleted files and directories:\n', deletedPaths.join('\n'));
 * };
 * deleteAndLogPathes(['temp/*.js', '!temp/unicorn.js']);
 * ```
 */
export function delAsync(patterns: patterns, delOptions: delOptions): Promise<string[]>;
