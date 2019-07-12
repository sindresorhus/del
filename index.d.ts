import * as fs from 'fs';
import {GlobbyOptions} from 'globby';

interface ExternalOptions extends GlobbyOptions {
	/**
	 Windows: EBUSY and ENOTEMPTY - rimraf will back off a maximum of opts.maxBusyTries times before giving up, adding 100ms of wait between each attempt.

	 @default 3
	 */
	readonly maxBusyTries?: number;

	/**
	 Since readdir requires opening a file descriptor, it's possible to hit EMFILE if too many file descriptors are in use. In the sync case, there's nothing to be done for this. But in the async case, rimraf will gradually back off with timeouts up to opts.emfileWait ms, which defaults to 1000.

	 @default 1000
	 */
	readonly emfileWait?: number;

	readonly unlink?: typeof fs.unlink;
	readonly unlinkSync?: typeof fs.unlinkSync;
	readonly chmod?: typeof fs.chmod;
	readonly chmodSync?: typeof fs.chmodSync;
	readonly stat?: typeof fs.stat;
	readonly statSync?: typeof fs.statSync;
	readonly lstat?: typeof fs.lstat;
	readonly lstatSync?: typeof fs.lstatSync;
	readonly rmdir?: typeof fs.rmdir;
	readonly rmdirSync?: typeof fs.rmdirSync;
	readonly readdir?: typeof fs.readdir;
	readonly readdirSync?: typeof fs.readdirSync;
}

declare namespace del {
	interface Options extends ExternalOptions {
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
		import del = require('del');

		(async () => {
			const deletedPaths = await del(['temp/*.js'], {dryRun: true});

			console.log('Files and directories that would be deleted:\n', deletedPaths.join('\n'));
		})();
		```
		*/
		readonly dryRun?: boolean;

		/**
		Concurrency limit. Minimum: `1`.

		@default Infinity
		*/
		readonly concurrency?: number;
	}
}

declare const del: {
	/**
	Delete files and directories using glob patterns.

	Note that glob patterns can only contain forward-slashes, not backward-slashes, so if you want to construct a glob pattern from path components, you need to use `path.posix.join()` instead of `path.join()`.

	@param patterns - See the supported [glob patterns](https://github.com/sindresorhus/globby#globbing-patterns).
	- [Pattern examples with expected matches](https://github.com/sindresorhus/multimatch/blob/master/test/test.js)
	- [Quick globbing pattern overview](https://github.com/sindresorhus/multimatch#globbing-patterns)
	@param options - You can specify any of the [`globby` options](https://github.com/sindresorhus/globby#options) in addition to the `del` options. In constrast to the `globby` defaults, `expandDirectories`, `onlyFiles`, and `followSymbolicLinks` are `false` by default.
	@returns The deleted paths.

	@example
	```
	import del = require('del');

	(async () => {
		const deletedPaths = await del(['temp/*.js', '!temp/unicorn.js']);

		console.log('Deleted files and directories:\n', deletedPaths.join('\n'));
	})();
	```
	*/
	(
		patterns: string | readonly string[],
		options?: del.Options
	): Promise<string[]>;

	/**
	Synchronously delete files and directories using glob patterns.

	Note that glob patterns can only contain forward-slashes, not backward-slashes, so if you want to construct a glob pattern from path components, you need to use `path.posix.join()` instead of `path.join()`.

	@param patterns - See the supported [glob patterns](https://github.com/sindresorhus/globby#globbing-patterns).
	- [Pattern examples with expected matches](https://github.com/sindresorhus/multimatch/blob/master/test/test.js)
	- [Quick globbing pattern overview](https://github.com/sindresorhus/multimatch#globbing-patterns)
	@param options - You can specify any of the [`globby` options](https://github.com/sindresorhus/globby#options) in addition to the `del` options. In constrast to the `globby` defaults, `expandDirectories`, `onlyFiles`, and `followSymbolicLinks` are `false` by default.
	@returns The deleted paths.
	*/
	sync(
		patterns: string | readonly string[],
		options?: del.Options
	): string[];
};

export = del;
