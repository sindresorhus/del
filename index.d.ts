import {IOptions as GlobOptions} from 'glob';

declare namespace del {
	interface Options extends Readonly<GlobOptions> {
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

	@param patterns - See the supported [`minimatch` patterns](https://github.com/isaacs/minimatch#usage).
	- [Pattern examples with expected matches](https://github.com/sindresorhus/multimatch/blob/master/test/test.js)
	- [Quick globbing pattern overview](https://github.com/sindresorhus/multimatch#globbing-patterns)
	@param options - See the [`glob` options](https://github.com/isaacs/node-glob#options).
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

	@param patterns - See supported minimatch [patterns](https://github.com/isaacs/minimatch#usage).
	- [Pattern examples with expected matches](https://github.com/sindresorhus/multimatch/blob/master/test/test.js)
	- [Quick globbing pattern overview](https://github.com/sindresorhus/multimatch#globbing-patterns)
	@param options - See the [`glob` options](https://github.com/isaacs/node-glob#options).
	@returns The deleted paths.
	*/
	sync(
		patterns: string | readonly string[],
		options?: del.Options
	): string[];
};

export = del;
