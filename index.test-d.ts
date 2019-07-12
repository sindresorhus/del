import * as fs from 'fs';
import { expectType } from 'tsd';
import del = require('.');

const paths = [
	'temp/*.js',
	'!temp/unicorn.js'
];

const rimrafOptions: del.Options = {
	maxBusyTries: 1000,
	emfileWait: 3,
	unlink: fs.unlink,
	unlinkSync: fs.unlinkSync,
	chmod: fs.chmod,
	chmodSync: fs.chmodSync,
	stat: fs.stat,
	statSync: fs.statSync,
	lstat: fs.lstat,
	lstatSync: fs.lstatSync,
	rmdir: fs.rmdir,
	rmdirSync: fs.rmdirSync,
	readdir: fs.readdir,
	readdirSync: fs.readdirSync,
};

// Del
expectType<Promise<string[]>>(del('temp/*.js'));
expectType<Promise<string[]>>(del(paths));

expectType<Promise<string[]>>(del(paths, {force: true}));
expectType<Promise<string[]>>(del(paths, {dryRun: true}));
expectType<Promise<string[]>>(del(paths, {concurrency: 20}));
expectType<Promise<string[]>>(del(paths, {cwd: ''}));
expectType<Promise<string[]>>(del(paths, rimrafOptions));

// Del (sync)
expectType<string[]>(del.sync('tmp/*.js'));
expectType<string[]>(del.sync(paths));

expectType<string[]>(del.sync(paths, {force: true}));
expectType<string[]>(del.sync(paths, {dryRun: true}));
expectType<string[]>(del.sync(paths, {concurrency: 20}));
expectType<string[]>(del.sync(paths, {cwd: ''}));
expectType<string[]>(del.sync(paths, rimrafOptions));
