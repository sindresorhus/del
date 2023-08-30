import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'ava';
import {temporaryDirectory} from 'tempy';
import makeDir from 'make-dir';
import {deleteAsync, deleteSync} from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const processCwd = process.cwd();

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
	'.dot.tmp',
];

test.beforeEach(t => {
	t.context.tmp = temporaryDirectory();

	for (const fixture of fixtures) {
		makeDir.sync(path.join(t.context.tmp, fixture));
	}
});

test('delete files - async', async t => {
	await deleteAsync(['*.tmp', '!1*'], {cwd: t.context.tmp});

	exists(t, ['1.tmp', '.dot.tmp']);
	notExists(t, ['2.tmp', '3.tmp', '4.tmp']);
});

test('delete files - sync', t => {
	deleteSync(['*.tmp', '!1*'], {cwd: t.context.tmp});

	exists(t, ['1.tmp', '.dot.tmp']);
	notExists(t, ['2.tmp', '3.tmp', '4.tmp']);
});

test('take options into account - async', async t => {
	await deleteAsync(['*.tmp', '!1*'], {
		cwd: t.context.tmp,
		dot: true,
	});

	exists(t, ['1.tmp']);
	notExists(t, ['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('take options into account - sync', t => {
	deleteSync(['*.tmp', '!1*'], {
		cwd: t.context.tmp,
		dot: true,
	});

	exists(t, ['1.tmp']);
	notExists(t, ['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('return deleted files - async', async t => {
	t.deepEqual(
		await deleteAsync('1.tmp', {cwd: t.context.tmp}),
		[path.join(t.context.tmp, '1.tmp')],
	);
});

test('return deleted files - sync', t => {
	t.deepEqual(
		deleteSync('1.tmp', {cwd: t.context.tmp}),
		[path.join(t.context.tmp, '1.tmp')],
	);
});

test('don\'t delete files, but return them - async', async t => {
	const deletedFiles = await deleteAsync(['*.tmp', '!1*'], {
		cwd: t.context.tmp,
		dryRun: true,
	});
	exists(t, ['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	t.deepEqual(deletedFiles, [
		path.join(t.context.tmp, '2.tmp'),
		path.join(t.context.tmp, '3.tmp'),
		path.join(t.context.tmp, '4.tmp'),
	]);
});

test('don\'t delete files, but return them - sync', t => {
	const deletedFiles = deleteSync(['*.tmp', '!1*'], {
		cwd: t.context.tmp,
		dryRun: true,
	});
	exists(t, ['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	t.deepEqual(deletedFiles, [
		path.join(t.context.tmp, '2.tmp'),
		path.join(t.context.tmp, '3.tmp'),
		path.join(t.context.tmp, '4.tmp'),
	]);
});

// Currently this is only testable locally on macOS.
// https://github.com/sindresorhus/del/issues/68
test('does not throw EINVAL - async', async t => {
	await deleteAsync('**/*', {
		cwd: t.context.tmp,
		dot: true,
	});

	const nestedFile = path.resolve(t.context.tmp, 'a/b/c/nested.js');
	const totalAttempts = 200;

	let count = 0;
	while (count !== totalAttempts) {
		makeDir.sync(nestedFile);

		// eslint-disable-next-line no-await-in-loop
		const removed = await deleteAsync('**/*', {
			cwd: t.context.tmp,
			dot: true,
		});

		const expected = [
			path.resolve(t.context.tmp, 'a'),
			path.resolve(t.context.tmp, 'a/b'),
			path.resolve(t.context.tmp, 'a/b/c'),
			path.resolve(t.context.tmp, 'a/b/c/nested.js'),
		];

		t.deepEqual(removed, expected);

		count += 1;
	}

	notExists(t, [...fixtures, 'a']);
	t.is(count, totalAttempts);
});

test('does not throw EINVAL - sync', t => {
	deleteSync('**/*', {
		cwd: t.context.tmp,
		dot: true,
	});

	const nestedFile = path.resolve(t.context.tmp, 'a/b/c/nested.js');
	const totalAttempts = 200;

	let count = 0;
	while (count !== totalAttempts) {
		makeDir.sync(nestedFile);

		const removed = deleteSync('**/*', {
			cwd: t.context.tmp,
			dot: true,
		});

		const expected = [
			path.resolve(t.context.tmp, 'a'),
			path.resolve(t.context.tmp, 'a/b'),
			path.resolve(t.context.tmp, 'a/b/c'),
			path.resolve(t.context.tmp, 'a/b/c/nested.js'),
		];

		t.deepEqual(removed, expected);

		count += 1;
	}

	notExists(t, [...fixtures, 'a']);
	t.is(count, totalAttempts);
});

test('delete relative files outside of process.cwd using cwd - async', async t => {
	await deleteAsync(['1.tmp'], {cwd: t.context.tmp});

	exists(t, ['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	notExists(t, ['1.tmp']);
});

test('delete relative files outside of process.cwd using cwd - sync', t => {
	deleteSync(['1.tmp'], {cwd: t.context.tmp});

	exists(t, ['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	notExists(t, ['1.tmp']);
});

test('delete absolute files outside of process.cwd using cwd - async', async t => {
	const absolutePath = path.resolve(t.context.tmp, '1.tmp');
	await deleteAsync([absolutePath], {cwd: t.context.tmp});

	exists(t, ['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	notExists(t, ['1.tmp']);
});

test('delete absolute files outside of process.cwd using cwd - sync', t => {
	const absolutePath = path.resolve(t.context.tmp, '1.tmp');
	deleteSync([absolutePath], {cwd: t.context.tmp});

	exists(t, ['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	notExists(t, ['1.tmp']);
});

test('cannot delete actual working directory without force: true - async', async t => {
	process.chdir(t.context.tmp);

	await t.throwsAsync(deleteAsync([t.context.tmp]), {
		instanceOf: Error,
		message: 'Cannot delete the current working directory. Can be overridden with the `force` option.',
	});

	exists(t, ['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	process.chdir(processCwd);
});

test('cannot delete actual working directory without force: true - sync', t => {
	process.chdir(t.context.tmp);

	t.throws(() => {
		deleteSync([t.context.tmp]);
	}, {
		instanceOf: Error,
		message: 'Cannot delete the current working directory. Can be overridden with the `force` option.',
	});

	exists(t, ['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	process.chdir(processCwd);
});

test('cannot delete actual working directory with cwd option without force: true - async', async t => {
	process.chdir(t.context.tmp);

	await t.throwsAsync(deleteAsync([t.context.tmp], {cwd: __dirname}), {
		instanceOf: Error,
		message: 'Cannot delete the current working directory. Can be overridden with the `force` option.',
	});

	exists(t, ['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	process.chdir(processCwd);
});

test('cannot delete actual working directory with cwd option without force: true - sync', t => {
	process.chdir(t.context.tmp);

	t.throws(() => {
		deleteSync([t.context.tmp], {cwd: __dirname});
	}, {
		instanceOf: Error,
		message: 'Cannot delete the current working directory. Can be overridden with the `force` option.',
	});

	exists(t, ['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	process.chdir(processCwd);
});

test('cannot delete files outside cwd without force: true - async', async t => {
	const absolutePath = path.resolve(t.context.tmp, '1.tmp');

	await t.throwsAsync(deleteAsync([absolutePath]), {
		instanceOf: Error,
		message: 'Cannot delete files/directories outside the current working directory. Can be overridden with the `force` option.',
	});

	exists(t, ['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('cannot delete files outside cwd without force: true - sync', t => {
	const absolutePath = path.resolve(t.context.tmp, '1.tmp');

	t.throws(() => {
		deleteSync([absolutePath]);
	}, {
		instanceOf: Error,
		message: 'Cannot delete files/directories outside the current working directory. Can be overridden with the `force` option.',
	});

	exists(t, ['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('cannot delete files inside process.cwd when outside cwd without force: true - async', async t => {
	process.chdir(t.context.tmp);
	const removeFile = path.resolve(t.context.tmp, '2.tmp');
	const cwd = path.resolve(t.context.tmp, '1.tmp');

	await t.throwsAsync(deleteAsync([removeFile], {cwd}), {
		instanceOf: Error,
		message: 'Cannot delete files/directories outside the current working directory. Can be overridden with the `force` option.',
	});

	exists(t, ['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	process.chdir(processCwd);
});

test('cannot delete files inside process.cwd when outside cwd without force: true - sync', t => {
	process.chdir(t.context.tmp);
	const removeFile = path.resolve(t.context.tmp, '2.tmp');
	const cwd = path.resolve(t.context.tmp, '1.tmp');

	t.throws(() => {
		deleteSync([removeFile], {cwd});
	}, {
		instanceOf: Error,
		message: 'Cannot delete files/directories outside the current working directory. Can be overridden with the `force` option.',
	});

	exists(t, ['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	process.chdir(processCwd);
});

test('windows can pass absolute paths with "\\" - async', async t => {
	const filePath = path.resolve(t.context.tmp, '1.tmp');

	const removeFiles = await deleteAsync([filePath], {cwd: t.context.tmp, dryRun: true});

	t.deepEqual(removeFiles, [filePath]);
});

test('windows can pass absolute paths with "\\" - sync', t => {
	const filePath = path.resolve(t.context.tmp, '1.tmp');

	const removeFiles = deleteSync([filePath], {cwd: t.context.tmp, dryRun: true});

	t.deepEqual(removeFiles, [filePath]);
});

test('windows can pass relative paths with "\\" - async', async t => {
	const nestedFile = path.resolve(t.context.tmp, 'a/b/c/nested.js');
	makeDir.sync(nestedFile);

	const removeFiles = await deleteAsync([nestedFile], {cwd: t.context.tmp, dryRun: true});

	t.deepEqual(removeFiles, [nestedFile]);
});

test('windows can pass relative paths with "\\" - sync', t => {
	const nestedFile = path.resolve(t.context.tmp, 'a/b/c/nested.js');
	makeDir.sync(nestedFile);

	const removeFiles = deleteSync([nestedFile], {cwd: t.context.tmp, dryRun: true});

	t.deepEqual(removeFiles, [nestedFile]);
});

test('onProgress option - progress of non-existent file', async t => {
	let report;

	await deleteAsync('non-existent-directory', {onProgress(event) {
		report = event;
	}});

	t.deepEqual(report, {
		totalCount: 0,
		deletedCount: 0,
		percent: 1,
	});
});

test('onProgress option - progress of single file', async t => {
	let report;

	await deleteAsync(t.context.tmp, {cwd: __dirname, force: true, onProgress(event) {
		report = event;
	}});

	t.deepEqual(report, {
		totalCount: 1,
		deletedCount: 1,
		percent: 1,
		path: t.context.tmp
	});
});

test('onProgress option - progress of multiple files', async t => {
	let reports = [];

	const sourcePath = process.platform === 'win32' ? path.resolve(`${t.context.tmp}/*`).replace(/\\/g, '/') : `${t.context.tmp}/*`;

	await deleteAsync(sourcePath, {
		cwd: __dirname,
		force: true,
		onProgress(event) {
			reports.push(event);
		},
	});

	t.is(reports.length, 4);
	t.deepEqual(reports.map(r => r.totalCount), [4, 4, 4, 4]);
	t.deepEqual(reports.map(r => r.deletedCount).sort(), [1, 2, 3, 4]);

	const expectedPaths = ['1', '2', '3', '4'].map(x => path.join(t.context.tmp, `${x}.tmp`));
	t.deepEqual(reports.map(r => r.path).sort(), expectedPaths.sort());
});
