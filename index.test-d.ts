import {expectType} from 'tsd';
import del = require('.');

const paths = [
	'temp/*.js',
	'!temp/unicorn.js'
];

// Del
expectType<Promise<string[]>>(del('temp/*.js'));
expectType<Promise<string[]>>(del(paths));

expectType<Promise<string[]>>(del(paths, {force: true}));
expectType<Promise<string[]>>(del(paths, {dryRun: true}));
expectType<Promise<string[]>>(del(paths, {concurrency: 20}));
expectType<Promise<string[]>>(del(paths, {cwd: ''}));

// Del (sync)
expectType<string[]>(del.sync('tmp/*.js'));
expectType<string[]>(del.sync(paths));

expectType<string[]>(del.sync(paths, {force: true}));
expectType<string[]>(del.sync(paths, {dryRun: true}));
expectType<string[]>(del.sync(paths, {concurrency: 20}));
expectType<string[]>(del.sync(paths, {cwd: ''}));
