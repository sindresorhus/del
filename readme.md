# del [![Build Status](https://travis-ci.org/sindresorhus/del.svg?branch=master)](https://travis-ci.org/sindresorhus/del) [![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/xojs/xo)

> Delete files and directories using [globs](https://github.com/isaacs/minimatch#usage)

Similar to [rimraf](https://github.com/isaacs/rimraf), but with a Promise API and support for multiple files and globbing. It also protects you against deleting the current working directory and above.


## Install

```
$ npm install del
```


## Usage

```js
const del = require('del');

(async () => {
	const deletedPaths = await del(['temp/*.js', '!temp/unicorn.js']);

	console.log('Deleted files and directories:\n', deletedPaths.join('\n'));
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

Suggestions on how to improve this welcome!


## API

### del(patterns, options?)

Returns `Promise<string[]>` with the deleted paths.

### del.sync(patterns, [options])

Returns `string[]` with the deleted paths.

#### patterns

Type: `string | string[]`

See the supported [`minimatch` patterns](https://github.com/isaacs/minimatch#usage).

- [Pattern examples with expected matches](https://github.com/sindresorhus/multimatch/blob/master/test/test.js)
- [Quick globbing pattern overview](https://github.com/sindresorhus/multimatch#globbing-patterns)

#### options

Type: `object`

See the [`glob` options](https://github.com/isaacs/node-glob#options).

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


## Related

- [make-dir](https://github.com/sindresorhus/make-dir) - Make a directory and its parents if needed
- [globby](https://github.com/sindresorhus/globby) - User-friendly glob matching
