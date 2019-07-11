import path from 'path';
import fs from 'fs';
import {serial as test} from 'ava';
import tempy from 'tempy';
import makeDir from 'make-dir';
import del from '.';

function exists(t, files) {
	for (const file of files) {
		t.true(fs.existsSync(path.join(t.context.tmp, file)));
	}
}

function notExists(t, files) {
	for (const file of files) {
		t.false(fs.existsSync(path.join(t.context.tmp, file)));
	}
}

const fixtures = [
	'1.tmp',
	'2.tmp',
	'3.tmp',
	'4.tmp',
	'.dot.tmp'
];

test.beforeEach(t => {
	t.context.tmp = tempy.directory();

	for (const fixture of fixtures) {
		makeDir.sync(path.join(t.context.tmp, fixture));
	}
});

test('delete files - async', async t => {
	await del(['*.tmp', '!1*'], {cwd: t.context.tmp});

	exists(t, ['1.tmp', '.dot.tmp']);
	notExists(t, ['2.tmp', '3.tmp', '4.tmp']);
});

test('delete files - sync', t => {
	del.sync(['*.tmp', '!1*'], {cwd: t.context.tmp});

	exists(t, ['1.tmp', '.dot.tmp']);
	notExists(t, ['2.tmp', '3.tmp', '4.tmp']);
});

test('take options into account - async', async t => {
	await del(['*.tmp', '!1*'], {
		cwd: t.context.tmp,
		dot: true
	});

	exists(t, ['1.tmp']);
	notExists(t, ['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('take options into account - sync', t => {
	del.sync(['*.tmp', '!1*'], {
		cwd: t.context.tmp,
		dot: true
	});

	exists(t, ['1.tmp']);
	notExists(t, ['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('return deleted files - async', async t => {
	t.deepEqual(
		await del('1.tmp', {cwd: t.context.tmp}),
		[path.join(t.context.tmp, '1.tmp')]
	);
});

test('return deleted files - sync', t => {
	t.deepEqual(
		del.sync('1.tmp', {cwd: t.context.tmp}),
		[path.join(t.context.tmp, '1.tmp')]
	);
});

test('don\'t delete files, but return them - async', async t => {
	const deletedFiles = await del(['*.tmp', '!1*'], {
		cwd: t.context.tmp,
		dryRun: true
	});
	exists(t, ['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	t.deepEqual(deletedFiles, [
		path.join(t.context.tmp, '4.tmp'),
		path.join(t.context.tmp, '3.tmp'),
		path.join(t.context.tmp, '2.tmp')
	]);
});

test('don\'t delete files, but return them - sync', t => {
	const deletedFiles = del.sync(['*.tmp', '!1*'], {
		cwd: t.context.tmp,
		dryRun: true
	});
	exists(t, ['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	t.deepEqual(deletedFiles, [
		path.join(t.context.tmp, '4.tmp'),
		path.join(t.context.tmp, '3.tmp'),
		path.join(t.context.tmp, '2.tmp')
	]);
});

// Currently this only testable locally on an osx machine.
// https://github.com/sindresorhus/del/issues/68
test.serial('does not throw EINVAL - async', async t => {
	await del('**/*', {
		cwd: t.context.tmp,
		dot: true
	});

	const nestedFile = path.resolve(t.context.tmp, 'a/b/c/nested.js');
	const totalAttempts = 200;

	let count = 0;
	while (count !== totalAttempts) {
		makeDir.sync(nestedFile);

		// eslint-disable-next-line no-await-in-loop
		const removed = await del('**/*', {
			cwd: t.context.tmp,
			dot: true
		});

		const expected = [
			path.resolve(t.context.tmp, 'a/b/c/nested.js'),
			path.resolve(t.context.tmp, 'a/b/c'),
			path.resolve(t.context.tmp, 'a/b'),
			path.resolve(t.context.tmp, 'a')
		];

		t.deepEqual(removed, expected);

		count += 1;
	}

	notExists(t, [...fixtures, 'a']);
	t.is(count, totalAttempts);
});

test.serial('does not throw EINVAL - sync', t => {
	del.sync('**/*', {
		cwd: t.context.tmp,
		dot: true
	});

	const nestedFile = path.resolve(t.context.tmp, 'a/b/c/nested.js');
	const totalAttempts = 200;

	let count = 0;
	while (count !== totalAttempts) {
		makeDir.sync(nestedFile);

		const removed = del.sync('**/*', {
			cwd: t.context.tmp,
			dot: true
		});

		const expected = [
			path.resolve(t.context.tmp, 'a/b/c/nested.js'),
			path.resolve(t.context.tmp, 'a/b/c'),
			path.resolve(t.context.tmp, 'a/b'),
			path.resolve(t.context.tmp, 'a')
		];

		t.deepEqual(removed, expected);

		count += 1;
	}

	notExists(t, [...fixtures, 'a']);
	t.is(count, totalAttempts);
});

test('delete relative files outside of process.cwd using cwd - async', async t => {
	await del(['1.tmp'], {cwd: t.context.tmp});

	exists(t, ['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	notExists(t, ['1.tmp']);
});

test('delete relative files outside of process.cwd using cwd - sync', t => {
	del.sync(['1.tmp'], {cwd: t.context.tmp});

	exists(t, ['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	notExists(t, ['1.tmp']);
});

test('delete absolute files outside of process.cwd using cwd - async', async t => {
	const absolutePath = path.resolve(t.context.tmp, '1.tmp');
	await del([absolutePath], {cwd: t.context.tmp});

	exists(t, ['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	notExists(t, ['1.tmp']);
});

test('delete absolute files outside of process.cwd using cwd - sync', t => {
	const absolutePath = path.resolve(t.context.tmp, '1.tmp');
	del.sync([absolutePath], {cwd: t.context.tmp});

	exists(t, ['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	notExists(t, ['1.tmp']);
});
