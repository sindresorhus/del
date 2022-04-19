import path from 'path';
import fs from 'fs';
import {serial as test} from 'ava';
import tempy from 'tempy';
import makeDir from 'make-dir';
import del from '.';

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
		path.join(t.context.tmp, '2.tmp'),
		path.join(t.context.tmp, '3.tmp'),
		path.join(t.context.tmp, '4.tmp')
	]);
});

test('don\'t delete files, but return them - sync', t => {
	const deletedFiles = del.sync(['*.tmp', '!1*'], {
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

// Currently this is only testable locally on macOS.
// https://github.com/sindresorhus/del/issues/68
test('does not throw EINVAL - async', async t => {
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
			path.resolve(t.context.tmp, 'a'),
			path.resolve(t.context.tmp, 'a/b'),
			path.resolve(t.context.tmp, 'a/b/c'),
			path.resolve(t.context.tmp, 'a/b/c/nested.js')
		];

		t.deepEqual(removed, expected);

		count += 1;
	}

	notExists(t, [...fixtures, 'a']);
	t.is(count, totalAttempts);
});

test('does not throw EINVAL - sync', t => {
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
			path.resolve(t.context.tmp, 'a'),
			path.resolve(t.context.tmp, 'a/b'),
			path.resolve(t.context.tmp, 'a/b/c'),
			path.resolve(t.context.tmp, 'a/b/c/nested.js')
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

test('cannot delete actual working directory without force: true - async', async t => {
	process.chdir(t.context.tmp);

	await t.throwsAsync(del([t.context.tmp]), {
		instanceOf: Error,
		message: 'Cannot delete the current working directory. Can be overridden with the `force` option.'
	});

	exists(t, ['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	process.chdir(processCwd);
});

test('cannot delete actual working directory without force: true - sync', t => {
	process.chdir(t.context.tmp);

	t.throws(() => {
		del.sync([t.context.tmp]);
	}, {
		instanceOf: Error,
		message: 'Cannot delete the current working directory. Can be overridden with the `force` option.'
	});

	exists(t, ['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	process.chdir(processCwd);
});

test('cannot delete actual working directory with cwd option without force: true - async', async t => {
	process.chdir(t.context.tmp);

	await t.throwsAsync(del([t.context.tmp], {cwd: __dirname}), {
		instanceOf: Error,
		message: 'Cannot delete the current working directory. Can be overridden with the `force` option.'
	});

	exists(t, ['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	process.chdir(processCwd);
});

test('cannot delete actual working directory with cwd option without force: true - sync', t => {
	process.chdir(t.context.tmp);

	t.throws(() => {
		del.sync([t.context.tmp], {cwd: __dirname});
	}, {
		instanceOf: Error,
		message: 'Cannot delete the current working directory. Can be overridden with the `force` option.'
	});

	exists(t, ['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	process.chdir(processCwd);
});

test('cannot delete files outside cwd without force: true - async', async t => {
	const absolutePath = path.resolve(t.context.tmp, '1.tmp');

	await t.throwsAsync(del([absolutePath]), {
		instanceOf: Error,
		message: 'Cannot delete files/directories outside the current working directory. Can be overridden with the `force` option.'
	});

	exists(t, ['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('cannot delete files outside cwd without force: true - sync', t => {
	const absolutePath = path.resolve(t.context.tmp, '1.tmp');

	t.throws(() => {
		del.sync([absolutePath]);
	}, {
		instanceOf: Error,
		message: 'Cannot delete files/directories outside the current working directory. Can be overridden with the `force` option.'
	});

	exists(t, ['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('cannot delete files inside process.cwd when outside cwd without force: true - async', async t => {
	process.chdir(t.context.tmp);
	const removeFile = path.resolve(t.context.tmp, '2.tmp');
	const cwd = path.resolve(t.context.tmp, '1.tmp');

	await t.throwsAsync(del([removeFile], {cwd}), {
		instanceOf: Error,
		message: 'Cannot delete files/directories outside the current working directory. Can be overridden with the `force` option.'
	});

	exists(t, ['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	process.chdir(processCwd);
});

test('cannot delete files inside process.cwd when outside cwd without force: true - sync', t => {
	process.chdir(t.context.tmp);
	const removeFile = path.resolve(t.context.tmp, '2.tmp');
	const cwd = path.resolve(t.context.tmp, '1.tmp');

	t.throws(() => {
		del.sync([removeFile], {cwd});
	}, {
		instanceOf: Error,
		message: 'Cannot delete files/directories outside the current working directory. Can be overridden with the `force` option.'
	});

	exists(t, ['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	process.chdir(processCwd);
});

test('windows can pass absolute paths with "\\" - async', async t => {
	const filePath = path.resolve(t.context.tmp, '1.tmp');

	const removeFiles = await del([filePath], {cwd: t.context.tmp, dryRun: true});

	t.deepEqual(removeFiles, [filePath]);
});

test('windows can pass absolute paths with "\\" - sync', t => {
	const filePath = path.resolve(t.context.tmp, '1.tmp');

	const removeFiles = del.sync([filePath], {cwd: t.context.tmp, dryRun: true});

	t.deepEqual(removeFiles, [filePath]);
});

test('windows can pass relative paths with "\\" - async', async t => {
	const nestedFile = path.resolve(t.context.tmp, 'a/b/c/nested.js');
	makeDir.sync(nestedFile);

	const removeFiles = await del([nestedFile], {cwd: t.context.tmp, dryRun: true});

	t.deepEqual(removeFiles, [nestedFile]);
});

test('windows can pass relative paths with "\\" - sync', t => {
	const nestedFile = path.resolve(t.context.tmp, 'a/b/c/nested.js');
	makeDir.sync(nestedFile);

	const removeFiles = del.sync([nestedFile], {cwd: t.context.tmp, dryRun: true});

	t.deepEqual(removeFiles, [nestedFile]);
});

test('onProgress option - progress of non-existent file', async t => {
	let report;

	await del('non-existent-directory', {onProgress: event => {
		report = event;
	}});

	t.deepEqual(report, {
		totalFiles: 0,
		deletedFiles: 0,
		percent: 1
	});
});

test('onProgress option - progress of single file', async t => {
	let report;

	await del(t.context.tmp, {cwd: __dirname, force: true, onProgress: event => {
		report = event;
	}});

	t.deepEqual(report, {
		totalFiles: 1,
		deletedFiles: 1,
		percent: 1
	});
});

test('onProgress option - progress of multiple files', async t => {
	let report;

	const sourcePath = process.platform === 'win32' ? path.resolve(`${t.context.tmp}/*`).replace(/\\/g, '/') : `${t.context.tmp}/*`;

	await del(sourcePath, {
		cwd: __dirname,
		force: true,
		onProgress: event => {
			report = event;
		}
	});

	t.deepEqual(report, {
		totalFiles: 4,
		deletedFiles: 4,
		percent: 1
	});
});
