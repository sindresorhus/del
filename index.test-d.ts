import {expectType} from 'tsd';
import {ProgressEmitter} from './index.d';
import del = require('.');

const paths = [
	'temp/*.js',
	'!temp/unicorn.js'
];

// Del
expectType<Promise<string[]> & ProgressEmitter>(del('temp/*.js'));
expectType<Promise<string[]> & ProgressEmitter>(del(paths));

expectType<Promise<string[]> & ProgressEmitter>(del(paths, {force: true}));
expectType<Promise<string[]> & ProgressEmitter>(del(paths, {dryRun: true}));
expectType<Promise<string[]> & ProgressEmitter>(del(paths, {concurrency: 20}));
expectType<Promise<string[]> & ProgressEmitter>(del(paths, {cwd: ''}));

// Del (sync)
expectType<string[]>(del.sync('tmp/*.js'));
expectType<string[]>(del.sync(paths));

expectType<string[]>(del.sync(paths, {force: true}));
expectType<string[]>(del.sync(paths, {dryRun: true}));
expectType<string[]>(del.sync(paths, {concurrency: 20}));
expectType<string[]>(del.sync(paths, {cwd: ''}));
