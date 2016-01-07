import fs from 'fs-extra';
import path from 'path';
import pathExists from 'path-exists';
import test from 'ava';
import fn from './';

const fixtures = [
	'1.tmp',
	'2.tmp',
	'3.tmp',
	'4.tmp',
	'.dot.tmp'
];

test.beforeEach(() => fixtures.forEach(fs.ensureFileSync));
test.afterEach(() => fixtures.forEach(fs.removeSync));

test.serial('delete files - async', async t => {
	await fn(['*.tmp', '!1*']);
	t.true(pathExists.sync('1.tmp'));
	t.false(pathExists.sync('2.tmp'));
	t.false(pathExists.sync('3.tmp'));
	t.false(pathExists.sync('4.tmp'));
	t.true(pathExists.sync('.dot.tmp'));
});

test.serial('delete files - sync', t => {
	fn.sync(['*.tmp', '!1*']);
	t.true(pathExists.sync('1.tmp'));
	t.false(pathExists.sync('2.tmp'));
	t.false(pathExists.sync('3.tmp'));
	t.false(pathExists.sync('4.tmp'));
	t.true(pathExists.sync('.dot.tmp'));
});

test.serial('take options into account - async', async t => {
	await fn(['*.tmp', '!1*'], {dot: true});
	t.true(pathExists.sync('1.tmp'));
	t.false(pathExists.sync('2.tmp'));
	t.false(pathExists.sync('3.tmp'));
	t.false(pathExists.sync('4.tmp'));
	t.false(pathExists.sync('.dot.tmp'));
});

test.serial('take options into account - sync', t => {
	fn.sync(['*.tmp', '!1*'], {dot: true});
	t.true(pathExists.sync('1.tmp'));
	t.false(pathExists.sync('2.tmp'));
	t.false(pathExists.sync('3.tmp'));
	t.false(pathExists.sync('4.tmp'));
	t.false(pathExists.sync('.dot.tmp'));
});

test.serial('cwd option - sync', t => {
	const f = 'tmp/tmp.txt';
	fs.ensureFileSync(f);
	fn.sync('tmp.txt', {cwd: 'tmp'});
	t.false(pathExists.sync(f));
	fs.removeSync(f);
});

test.serial('cwd option - async', async t => {
	const f = 'tmp/tmp.txt';
	fs.ensureFileSync(f);
	await fn('tmp.txt', {cwd: 'tmp'});
	t.false(pathExists.sync(f));
	fs.removeSync(f);
});

test.serial('return deleted files - sync', t => {
	fs.ensureFileSync('tmp/tmp.txt');
	t.same(fn.sync('tmp.txt', {cwd: 'tmp'}), [path.resolve('tmp/tmp.txt')]);
});

test.serial('return deleted files - async', async t => {
	fs.ensureFileSync('tmp/tmp.txt');
	t.same(await fn('tmp.txt', {cwd: 'tmp'}), [path.resolve('tmp/tmp.txt')]);
});

test.serial(`don't delete files, but return them - async`, async t => {
	const deletedFiles = await fn(['*.tmp', '!1*'], {dryRun: true});
	t.true(pathExists.sync('1.tmp'));
	t.true(pathExists.sync('2.tmp'));
	t.true(pathExists.sync('3.tmp'));
	t.true(pathExists.sync('4.tmp'));
	t.true(pathExists.sync('.dot.tmp'));
	t.same(deletedFiles, [path.resolve('2.tmp'), path.resolve('3.tmp'), path.resolve('4.tmp')]);
});

test.serial(`don't delete files, but return them - sync`, t => {
	const deletedFiles = fn.sync(['*.tmp', '!1*'], {dryRun: true});
	t.true(pathExists.sync('1.tmp'));
	t.true(pathExists.sync('2.tmp'));
	t.true(pathExists.sync('3.tmp'));
	t.true(pathExists.sync('4.tmp'));
	t.true(pathExists.sync('.dot.tmp'));
	t.same(deletedFiles, [path.resolve('2.tmp'), path.resolve('3.tmp'), path.resolve('4.tmp')]);
});

test.serial('options are optional', async () => {
	fn.sync('1.tmp');
	await fn('1.tmp');
});
