import {expectError, expectType} from 'tsd';
import {deleteAsync, deleteSync} from './index.js';

const paths = [
	'temp/*.js',
	'!temp/unicorn.js',
];

// Del
expectType<Promise<string[]>>(deleteAsync('temp/*.js'));
expectType<Promise<string[]>>(deleteAsync(paths));

expectType<Promise<string[]>>(deleteAsync(paths, {force: true}));
expectType<Promise<string[]>>(deleteAsync(paths, {dryRun: true}));
expectType<Promise<string[]>>(deleteAsync(paths, {concurrency: 20}));
expectType<Promise<string[]>>(deleteAsync(paths, {cwd: ''}));

// Del (sync)
expectType<string[]>(deleteSync('tmp/*.js'));
expectType<string[]>(deleteSync(paths));

expectType<string[]>(deleteSync(paths, {force: true}));
expectType<string[]>(deleteSync(paths, {dryRun: true}));
expectType<string[]>(deleteSync(paths, {concurrency: 20}));
expectType<string[]>(deleteSync(paths, {cwd: ''}));

// Globby options that work at runtime stay in the type.
expectType<Promise<string[]>>(deleteAsync(paths, {globalGitignore: true}));
expectType<Promise<string[]>>(deleteAsync(paths, {gitignore: true}));
expectType<Promise<string[]>>(deleteAsync(paths, {expandNegationOnlyPatterns: false}));

// `del` resolves every matched path and hands it to `path.resolve`, so globby
// options that return entries instead of path strings cannot work.
expectError(deleteAsync(paths, {objectMode: true}));
expectError(deleteAsync(paths, {stats: true}));
expectError(deleteSync(paths, {objectMode: true}));
expectError(deleteSync(paths, {stats: true}));

// `cwd` ends up in `path.resolve`, which does not take a URL.
expectError(deleteAsync(paths, {cwd: new URL('file:///temp/')}));
expectError(deleteSync(paths, {cwd: new URL('file:///temp/')}));
