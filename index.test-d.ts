import {expectType} from 'tsd';
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
