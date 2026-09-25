# del

> Delete files and directories using [globs](https://github.com/sindresorhus/globby#globbing-patterns)

Similar to [rimraf](https://github.com/isaacs/rimraf), but with a Promise API and support for multiple files and globbing. It also protects you against deleting the current working directory and above.

## Install

```sh
npm install del
```

## Usage

```js
import {deleteAsync} from 'del';

const deletedFilePaths = await deleteAsync(['temp/*.js', '!temp/unicorn.js']);
const deletedDirectoryPaths = await deleteAsync(['temp', 'public']);

console.log('Deleted files:\n', deletedFilePaths.join('\n'));
console.log('\n\n');
console.log('Deleted directories:\n', deletedDirectoryPaths.join('\n'));
```

## Beware

A trailing `**` matches everything inside a directory, but not the directory itself.

So this keeps `goat.png` and deletes everything else in `public/assets`, but leaves the now empty `public/assets` directory behind:

```js
deleteSync(['public/assets/**', '!public/assets/goat.png']);
```

Naming the directory directly removes it too, and a negated pattern cannot save a file in that case, as the directory and its contents go in one go:

```js
deleteSync(['public/assets']);
//=> `public/assets/goat.png` is gone as well
```

To delete all subdirectories inside `public/`, you can do:

```js
deleteSync(['public/*/']);
```

A pattern made up of nothing but negations matches everything, so this deletes the whole tree apart from `keep.js` and any dot files:

```js
deleteSync(['!keep.js']);
```

Pass `expandNegationOnlyPatterns: false` to have such a pattern match nothing instead.

Suggestions on how to improve this welcome!

## API

Note that glob patterns can only contain forward-slashes, not backward-slashes. Windows file paths can use backward-slashes as long as the path does not contain any glob-like characters, otherwise use `path.posix.join()` instead of `path.join()`.

### deleteAsync(patterns, options?)

Returns `Promise<string[]>` with the deleted paths.

### deleteSync(patterns, options?)

Returns `string[]` with the deleted paths.

#### patterns

Type: `string | string[]`

See the supported [glob patterns](https://github.com/sindresorhus/globby#globbing-patterns).

- [Pattern examples with expected matches](https://github.com/sindresorhus/multimatch/blob/main/test/test.js)
- [Quick globbing pattern overview](https://github.com/sindresorhus/multimatch#globbing-patterns)

A pattern is a glob, so a filename that contains a glob metacharacter has to escape it. These are the two that fail silently, matching nothing at all rather than the name you meant:

```js
deleteSync(['report (1).pdf']);
//=> []

deleteSync(['report [(]1[)].pdf']);
//=> ['/…/report (1).pdf']

deleteSync(['[test-abc]']);
//=> []

deleteSync(['[[]test-abc[]]']);
//=> ['/…/[test-abc]']
```

A character class is used rather than a backslash because `del` rewrites backslashes to forward-slashes on Windows, which would eat the escape.

The other metacharacters are less surprising: `report [1].pdf` and `report {1}.pdf` do match their own names, but `report *1*.pdf` also matches `report 11.pdf`.

#### options

Type: `object`

You can specify any of the [`globby` options](https://github.com/sindresorhus/globby#options) in addition to the below options, except `objectMode` and `stats`, which return entries instead of paths. In contrast to the `globby` defaults, `expandDirectories`, `onlyFiles`, and `followSymbolicLinks` are `false` by default.

##### force

Type: `boolean`\
Default: `false`

Allow deleting the current working directory and outside.

##### dryRun

Type: `boolean`\
Default: `false`

See what would be deleted.

```js
import {deleteAsync} from 'del';

const deletedPaths = await deleteAsync(['temp/*.js'], {dryRun: true});

console.log('Files and directories that would be deleted:\n', deletedPaths.join('\n'));
```

##### dot

Type: `boolean`\
Default: `false`

Allow patterns to match files/folders that start with a period (`.`).

This option is passed through to [`fast-glob`](https://github.com/mrmlnc/fast-glob#dot).

Note that an explicit dot in a portion of the pattern will always match dot files.

**Example**

```text
directory/
├── .editorconfig
└── package.json
```

```js
import {deleteSync} from 'del';

deleteSync('*', {dot: false, dryRun: true});
//=> ['/…/package.json']
deleteSync('*', {dot: true, dryRun: true});
//=> ['/…/.editorconfig', '/…/package.json']
```

Without `dryRun` the first call would delete `package.json`, so the second would only return `.editorconfig`.

##### gitignore

Type: `boolean`\
Default: `false`

Respect the ignore patterns in `.gitignore` files. This option is passed through to [globby](https://github.com/sindresorhus/globby#options).

Note that it does not protect `.git` itself, only the files that `.gitignore` rules out. A broad pattern with `dot: true` will still match the repository metadata:

```js
deleteSync('**/*', {gitignore: true, dot: true});
//=> '.git', '.git/objects', … are deleted
```

Add `'**/.git'` to `ignore` if that is not what you want.

##### concurrency

Type: `number`\
Default: `Infinity`\
Minimum: `1`

Concurrency limit. `deleteAsync` applies it to the deletions and, through [globby](https://github.com/sindresorhus/globby#options), to how many directories are read at once, so a low value also slows down finding the files. `deleteSync` deletes one path at a time and globby reads synchronously, so the option has no effect there.

The paths are ordered so that a directory is always removed after the paths inside it, but that order only holds as far as `concurrency` reaches. A symlink that is the only route to its target can be unlinked before the paths below it are removed, which leaves them on disk while still reporting them as deleted. It leaves files behind rather than removing too much, and `concurrency: 1` avoids it.

##### cwd

Type: `string`\
Default: `process.cwd()`

The directory the patterns are relative to, and the boundary that `del` refuses to delete outside of without `force`.

```js
import {deleteSync} from 'del';

// Deletes `dist` and everything in it, without touching anything above it.
deleteSync('dist', {cwd: '/var/www/app'});
```

##### onProgress

Type: `(progress: ProgressData) => void`

Called after each file or directory is deleted.

```js
import {deleteAsync} from 'del';

await deleteAsync(patterns, {
	onProgress: progress => {
	// …
}});
```

###### ProgressData

```js
{
	totalCount: number,
	deletedCount: number,
	percent: number,
	path?: string
}
```

- `percent` is a value between `0` and `1`
- `path` is the absolute path of the deleted file or directory. It will not be present if nothing was deleted.
- with the `dryRun` option, `deletedCount` and `path` describe what would have been deleted, since nothing is

## CLI

See [del-cli](https://github.com/sindresorhus/del-cli) for a CLI for this module and [trash-cli](https://github.com/sindresorhus/trash-cli) for a safe version that is suitable for running by hand.

## Related

- [make-dir](https://github.com/sindresorhus/make-dir) - Make a directory and its parents if needed
- [globby](https://github.com/sindresorhus/globby) - User-friendly glob matching
