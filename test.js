import path from 'path';
import fs from 'fs-extra';
import pathExists from 'path-exists';
import test from 'ava';
import tempfile from 'tempfile';
import fn from './';

function exists(t, files) {
	[].concat(files).forEach(file => t.true(pathExists.sync(path.join(t.context.tmp, file))));
}

function notExists(t, files) {
	[].concat(files).forEach(file => t.false(pathExists.sync(path.join(t.context.tmp, file))));
}

const fixtures = [
	'1.tmp',
	'2.tmp',
	'3.tmp',
	'4.tmp',
	'.dot.tmp'
];

test.beforeEach(t => {
	t.context.tmp = tempfile();
	fixtures.forEach(fixture => fs.ensureFileSync(path.join(t.context.tmp, fixture)));
});

test('delete files - async', async t => {
	await fn(['*.tmp', '!1*'], {cwd: t.context.tmp});

	exists(t, ['1.tmp', '.dot.tmp']);
	notExists(t, ['2.tmp', '3.tmp', '4.tmp']);
});

test('delete files - sync', t => {
	fn.sync(['*.tmp', '!1*'], {cwd: t.context.tmp});

	exists(t, ['1.tmp', '.dot.tmp']);
	notExists(t, ['2.tmp', '3.tmp', '4.tmp']);
});

test('take options into account - async', async t => {
	await fn(['*.tmp', '!1*'], {
		cwd: t.context.tmp,
		dot: true
	});

	exists(t, ['1.tmp']);
	notExists(t, ['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('take options into account - sync', t => {
	fn.sync(['*.tmp', '!1*'], {
		cwd: t.context.tmp,
		dot: true
	});

	exists(t, ['1.tmp']);
	notExists(t, ['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test.serial('return deleted files - async', async t => {
	t.deepEqual(
		await fn('1.tmp', {cwd: t.context.tmp}),
		[path.join(t.context.tmp, '1.tmp')]
	);
});

test('return deleted files - sync', t => {
	t.deepEqual(
		fn.sync('1.tmp', {cwd: t.context.tmp}),
		[path.join(t.context.tmp, '1.tmp')]
	);
});

test(`don't delete files, but return them - async`, async t => {
	const deletedFiles = await fn(['*.tmp', '!1*'], {
		cwd: t.context.tmp,
		dryRun: true
	});
	exists(t, ['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	t.deepEqual(deletedFiles, [
		path.join(t.context.tmp, '2.tmp'),
		path.join(t.context.tmp, '3.tmp'),
		path.join(t.context.tmp, '4.tmp')
	]);
});

test(`don't delete files, but return them - sync`, t => {
	const deletedFiles = fn.sync(['*.tmp', '!1*'], {
		cwd: t.context.tmp,
		dryRun: true
	});
	exists(t, ['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	t.deepEqual(deletedFiles, [
		path.join(t.context.tmp, '2.tmp'),
		path.join(t.context.tmp, '3.tmp'),
		path.join(t.context.tmp, '4.tmp')
	]);
});
