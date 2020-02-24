# del [![Build Status](https://travis-ci.org/sindresorhus/del.svg?branch=master)](https://travis-ci.org/sindresorhus/del) [![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/xojs/xo)

> Delete files and directories using [globs](https://github.com/sindresorhus/globby#globbing-patterns)

Similar to [rimraf](https://github.com/isaacs/rimraf), but with a Promise API and support for multiple files and globbing. It also protects you against deleting the current working directory and above.

<br>

---

<div align="center">
	<p>
		<p>
			<sup>
				<a href="https://github.com/sponsors/sindresorhus">My open source work is supported by the community</a>
			</sup>
		</p>
		<sup>Special thanks to:</sup>
		<br>
		<br>
		<a href="https://github.com/botpress/botpress">
			<img src="https://sindresorhus.com/assets/thanks/botpress-logo.svg" width="260" alt="Botpress">
		</a>
		<br>
		<sub><b>Botpress is an open-source conversational assistant creation platform.</b></sub>
		<br>
		<sub>They <a href="https://github.com/botpress/botpress/blob/master/.github/CONTRIBUTING.md">welcome contributions</a> from anyone, whether you're into machine learning,<br>want to get started in open-source, or just have an improvement idea.</sub>
		<br>
	</p>
</div>

---

<br>

## Install

```
$ npm install del
```


## Usage

```js
const del = require('del');

(async () => {
	const deletedFilePaths = await del(['temp/*.js', '!temp/unicorn.js']);
	const deletedDirectoryPaths = await del(['temp', 'public']);

	console.log('Deleted files:\n', deletedFilePaths.join('\n'));
	console.log('\n\n');
	console.log('Deleted directories:\n', deletedDirectoryPaths.join('\n));
})();
```


## Beware

The glob pattern `**` matches all children and *the parent*.

So this won't work:

```js
del.sync(['public/assets/**', '!public/assets/goat.png']);
```

You have to explicitly ignore the parent directories too:

```js
del.sync(['public/assets/**', '!public/assets', '!public/assets/goat.png']);
```

To delete all subdirectories inside `public/`, you can do:

```js
del.sync(['public/*/']);
```

Suggestions on how to improve this welcome!


## API

Note that glob patterns can only contain forward-slashes, not backward-slashes. Windows file paths can use backward-slashes as long as the path does not contain any glob-like characters, otherwise use `path.posix.join()` instead of `path.join()`.

### del(patterns, options?)

Returns `Promise<string[]>` with the deleted paths.

### del.sync(patterns, options?)

Returns `string[]` with the deleted paths.

#### patterns

Type: `string | string[]`

See the supported [glob patterns](https://github.com/sindresorhus/globby#globbing-patterns).

- [Pattern examples with expected matches](https://github.com/sindresorhus/multimatch/blob/master/test/test.js)
- [Quick globbing pattern overview](https://github.com/sindresorhus/multimatch#globbing-patterns)

#### options

Type: `object`

You can specify any of the [`globby` options](https://github.com/sindresorhus/globby#options) in addition to the below options. In contrast to the `globby` defaults, `expandDirectories`, `onlyFiles`, and `followSymbolicLinks` are `false` by default.

##### force

Type: `boolean`<br>
Default: `false`

Allow deleting the current working directory and outside.

##### dryRun

Type: `boolean`<br>
Default: `false`

See what would be deleted.

```js
const del = require('del');

(async () => {
	const deletedPaths = await del(['temp/*.js'], {dryRun: true});

	console.log('Files and directories that would be deleted:\n', deletedPaths.join('\n'));
})();
```

##### concurrency

Type: `number`<br>
Default: `Infinity`<br>
Minimum: `1`

Concurrency limit.


## CLI

See [del-cli](https://github.com/sindresorhus/del-cli) for a CLI for this module and [trash-cli](https://github.com/sindresorhus/trash-cli) for a safe version that is suitable for running by hand.


## del for enterprise

Available as part of the Tidelift Subscription.

The maintainers of del and thousands of other packages are working with Tidelift to deliver commercial support and maintenance for the open source dependencies you use to build your applications. Save time, reduce risk, and improve code health, while paying the maintainers of the exact dependencies you use. [Learn more.](https://tidelift.com/subscription/pkg/npm-del?utm_source=npm-del&utm_medium=referral&utm_campaign=enterprise&utm_term=repo)


## Related

- [make-dir](https://github.com/sindresorhus/make-dir) - Make a directory and its parents if needed
- [globby](https://github.com/sindresorhus/globby) - User-friendly glob matching
