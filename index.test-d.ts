import {expectType} from 'tsd-check';
import del, {sync as delSync} from '.';

let paths = ['tmp/*.js', '!tmp/unicorn.js'];

// Del
expectType<Promise<string[]>>(del('tmp/*.js'));
expectType<Promise<string[]>>(del(paths));

expectType<Promise<string[]>>(del(paths, {force: true}));
expectType<Promise<string[]>>(del(paths, {dryRun: true}));
expectType<Promise<string[]>>(del(paths, {concurrency: 20}));
expectType<Promise<string[]>>(del(paths, {cwd: ''}));

// Del (sync)
expectType<string[]>(delSync('tmp/*.js'));
expectType<string[]>(delSync(paths));

expectType<string[]>(delSync(paths, {force: true}));
expectType<string[]>(delSync(paths, {dryRun: true}));
expectType<string[]>(delSync(paths, {concurrency: 20}));
expectType<string[]>(delSync(paths, {cwd: ''}));
