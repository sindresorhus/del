import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {deleteAsync, deleteSync} from './index.js';

/*
The disabled rules below are false positives for this file:
- `node-test/require-assertion` and `node-test/no-conditional-assertion`: the
  assertions live in the `exists`/`notExists` helpers and in a loop that runs a
  fixed number of times, so the linter cannot see them at the call site.
- `node-test/no-process-chdir-in-test`: `del` refuses to delete the current
  working directory, so that guard can only be tested by changing it.
*/
/* eslint-disable node-test/require-assertion, node-test/no-conditional-assertion, node-test/no-process-chdir-in-test -- False positives here: assertions live in the `exists`/`notExists` helpers and in a fixed-count loop, and the working-directory guard can only be tested by changing the working directory. */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const processCwd = process.cwd();

const cannotDeleteCwdMessage = 'Cannot delete the current working directory. Can be overridden with the `force` option.';
const cannotDeleteOutsideCwdMessage = 'Cannot delete files/directories outside the current working directory. Can be overridden with the `force` option.';

const fixtures = [
	'1.tmp',
	'2.tmp',
	'3.tmp',
	'4.tmp',
	'.dot.tmp',
];

// Every test works inside a fresh temporary directory, so no glob can ever reach
// the real filesystem, and the fixtures below are its only contents.
let temporaryPath;

beforeEach(() => {
	const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'del-'));
	temporaryPath = fs.realpathSync(temporaryRoot);

	for (const fixture of fixtures) {
		fs.mkdirSync(path.join(temporaryPath, fixture), {recursive: true});
	}
});

// Tests that guard against deleting the working directory move into it.
afterEach(() => {
	process.chdir(processCwd);
});

function exists(files) {
	for (const file of files) {
		assert.ok(fs.existsSync(path.join(temporaryPath, file)));
	}
}

function notExists(files) {
	for (const file of files) {
		assert.ok(!fs.existsSync(path.join(temporaryPath, file)));
	}
}

test('delete files - async', async () => {
	await deleteAsync(['*.tmp', '!1*'], {cwd: temporaryPath});

	exists(['1.tmp', '.dot.tmp']);
	notExists(['2.tmp', '3.tmp', '4.tmp']);
});

test('delete files - sync', () => {
	deleteSync(['*.tmp', '!1*'], {cwd: temporaryPath});

	exists(['1.tmp', '.dot.tmp']);
	notExists(['2.tmp', '3.tmp', '4.tmp']);
});

test('take options into account - async', async () => {
	await deleteAsync(['*.tmp', '!1*'], {
		cwd: temporaryPath,
		dot: true,
	});

	exists(['1.tmp']);
	notExists(['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('take options into account - sync', () => {
	deleteSync(['*.tmp', '!1*'], {
		cwd: temporaryPath,
		dot: true,
	});

	exists(['1.tmp']);
	notExists(['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('return deleted files - async', async () => {
	assert.deepEqual(
		await deleteAsync('1.tmp', {cwd: temporaryPath}),
		[path.join(temporaryPath, '1.tmp')],
	);
});

test('return deleted files - sync', () => {
	assert.deepEqual(
		deleteSync('1.tmp', {cwd: temporaryPath}),
		[path.join(temporaryPath, '1.tmp')],
	);
});

test('don\'t delete files, but return them - async', async () => {
	const deletedFiles = await deleteAsync(['*.tmp', '!1*'], {
		cwd: temporaryPath,
		dryRun: true,
	});
	exists(['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	assert.deepEqual(deletedFiles, [
		path.join(temporaryPath, '2.tmp'),
		path.join(temporaryPath, '3.tmp'),
		path.join(temporaryPath, '4.tmp'),
	]);
});

test('don\'t delete files, but return them - sync', () => {
	const deletedFiles = deleteSync(['*.tmp', '!1*'], {
		cwd: temporaryPath,
		dryRun: true,
	});
	exists(['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	assert.deepEqual(deletedFiles, [
		path.join(temporaryPath, '2.tmp'),
		path.join(temporaryPath, '3.tmp'),
		path.join(temporaryPath, '4.tmp'),
	]);
});

// Currently this is only testable locally on macOS.
// https://github.com/sindresorhus/del/issues/68
test('does not throw EINVAL - async', async () => {
	await deleteAsync('**/*', {
		cwd: temporaryPath,
		dot: true,
	});

	const nestedFile = path.resolve(temporaryPath, 'a/b/c/nested.js');
	const totalAttempts = 200;

	let count = 0;
	while (count !== totalAttempts) {
		fs.mkdirSync(nestedFile, {recursive: true});

		// eslint-disable-next-line no-await-in-loop
		const removed = await deleteAsync('**/*', {
			cwd: temporaryPath,
			dot: true,
		});

		const expected = [
			path.resolve(temporaryPath, 'a'),
			path.resolve(temporaryPath, 'a/b'),
			path.resolve(temporaryPath, 'a/b/c'),
			path.resolve(temporaryPath, 'a/b/c/nested.js'),
		];

		assert.deepEqual(removed, expected);

		count += 1;
	}

	notExists([...fixtures, 'a']);
	assert.equal(count, totalAttempts);
});

test('does not throw EINVAL - sync', () => {
	deleteSync('**/*', {
		cwd: temporaryPath,
		dot: true,
	});

	const nestedFile = path.resolve(temporaryPath, 'a/b/c/nested.js');
	const totalAttempts = 200;

	let count = 0;
	while (count !== totalAttempts) {
		fs.mkdirSync(nestedFile, {recursive: true});

		const removed = deleteSync('**/*', {
			cwd: temporaryPath,
			dot: true,
		});

		const expected = [
			path.resolve(temporaryPath, 'a'),
			path.resolve(temporaryPath, 'a/b'),
			path.resolve(temporaryPath, 'a/b/c'),
			path.resolve(temporaryPath, 'a/b/c/nested.js'),
		];

		assert.deepEqual(removed, expected);

		count += 1;
	}

	notExists([...fixtures, 'a']);
	assert.equal(count, totalAttempts);
});

test('delete relative files outside of process.cwd using cwd - async', async () => {
	await deleteAsync(['1.tmp'], {cwd: temporaryPath});

	exists(['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	notExists(['1.tmp']);
});

test('delete relative files outside of process.cwd using cwd - sync', () => {
	deleteSync(['1.tmp'], {cwd: temporaryPath});

	exists(['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	notExists(['1.tmp']);
});

test('delete absolute files outside of process.cwd using cwd - async', async () => {
	const absolutePath = path.resolve(temporaryPath, '1.tmp');
	await deleteAsync([absolutePath], {cwd: temporaryPath});

	exists(['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	notExists(['1.tmp']);
});

test('delete absolute files outside of process.cwd using cwd - sync', () => {
	const absolutePath = path.resolve(temporaryPath, '1.tmp');
	deleteSync([absolutePath], {cwd: temporaryPath});

	exists(['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	notExists(['1.tmp']);
});

test('cannot delete actual working directory without force: true - async', async () => {
	process.chdir(temporaryPath);

	await assert.rejects(deleteAsync([temporaryPath]), {
		message: cannotDeleteCwdMessage,
	});

	exists(['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('cannot delete actual working directory without force: true - sync', () => {
	process.chdir(temporaryPath);

	assert.throws(() => {
		deleteSync([temporaryPath]);
	}, {
		message: cannotDeleteCwdMessage,
	});

	exists(['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('cannot delete actual working directory with cwd option without force: true - async', async () => {
	process.chdir(temporaryPath);

	await assert.rejects(deleteAsync([temporaryPath], {cwd: __dirname}), {
		message: cannotDeleteCwdMessage,
	});

	exists(['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('cannot delete actual working directory with cwd option without force: true - sync', () => {
	process.chdir(temporaryPath);

	assert.throws(() => {
		deleteSync([temporaryPath], {cwd: __dirname});
	}, {
		message: cannotDeleteCwdMessage,
	});

	exists(['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('cannot delete files outside cwd without force: true - async', async () => {
	const absolutePath = path.resolve(temporaryPath, '1.tmp');

	await assert.rejects(deleteAsync([absolutePath]), {
		message: cannotDeleteOutsideCwdMessage,
	});

	exists(['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('cannot delete files outside cwd without force: true - sync', () => {
	const absolutePath = path.resolve(temporaryPath, '1.tmp');

	assert.throws(() => {
		deleteSync([absolutePath]);
	}, {
		message: cannotDeleteOutsideCwdMessage,
	});

	exists(['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('cannot delete files inside process.cwd when outside cwd without force: true - async', async () => {
	process.chdir(temporaryPath);
	const removeFile = path.resolve(temporaryPath, '2.tmp');
	const cwd = path.resolve(temporaryPath, '1.tmp');

	await assert.rejects(deleteAsync([removeFile], {cwd}), {
		message: cannotDeleteOutsideCwdMessage,
	});

	exists(['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('cannot delete files inside process.cwd when outside cwd without force: true - sync', () => {
	process.chdir(temporaryPath);
	const removeFile = path.resolve(temporaryPath, '2.tmp');
	const cwd = path.resolve(temporaryPath, '1.tmp');

	assert.throws(() => {
		deleteSync([removeFile], {cwd});
	}, {
		message: cannotDeleteOutsideCwdMessage,
	});

	exists(['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test(String.raw`windows can pass absolute paths with "\" - async`, async () => {
	const filePath = path.resolve(temporaryPath, '1.tmp');

	const removeFiles = await deleteAsync([filePath], {cwd: temporaryPath, dryRun: true});

	assert.deepEqual(removeFiles, [filePath]);
});

test(String.raw`windows can pass absolute paths with "\" - sync`, () => {
	const filePath = path.resolve(temporaryPath, '1.tmp');

	const removeFiles = deleteSync([filePath], {cwd: temporaryPath, dryRun: true});

	assert.deepEqual(removeFiles, [filePath]);
});

test(String.raw`windows can pass relative paths with "\" - async`, async () => {
	const nestedFile = path.resolve(temporaryPath, 'a/b/c/nested.js');
	fs.mkdirSync(nestedFile, {recursive: true});

	const removeFiles = await deleteAsync([nestedFile], {cwd: temporaryPath, dryRun: true});

	assert.deepEqual(removeFiles, [nestedFile]);
});

test(String.raw`windows can pass relative paths with "\" - sync`, () => {
	const nestedFile = path.resolve(temporaryPath, 'a/b/c/nested.js');
	fs.mkdirSync(nestedFile, {recursive: true});

	const removeFiles = deleteSync([nestedFile], {cwd: temporaryPath, dryRun: true});

	assert.deepEqual(removeFiles, [nestedFile]);
});

test('onProgress option - progress of non-existent file', async () => {
	let report;

	await deleteAsync('non-existent-directory', {
		cwd: temporaryPath,
		onProgress(event) {
			report = event;
		},
	});

	assert.deepEqual(report, {
		totalCount: 0,
		deletedCount: 0,
		percent: 1,
	});
});

test('onProgress option - progress of single file', async () => {
	let report;

	await deleteAsync(temporaryPath, {
		cwd: __dirname, force: true, onProgress(event) {
			report = event;
		},
	});

	assert.deepEqual(report, {
		totalCount: 1,
		deletedCount: 1,
		percent: 1,
		path: temporaryPath,
	});
});

test('onProgress option - progress of multiple files', async () => {
	const reports = [];

	const sourcePath = process.platform === 'win32' ? path.resolve(`${temporaryPath}/*`).replaceAll('\\', '/') : `${temporaryPath}/*`;

	await deleteAsync(sourcePath, {
		cwd: __dirname,
		force: true,
		onProgress(event) {
			reports.push(event);
		},
	});

	assert.equal(reports.length, 4);
	assert.deepEqual(reports.map(r => r.totalCount), [4, 4, 4, 4]);
	assert.deepEqual(reports.map(r => r.deletedCount).toSorted((a, b) => a - b), [1, 2, 3, 4]);

	const expectedPaths = ['1', '2', '3', '4'].map(x => path.join(temporaryPath, `${x}.tmp`));
	assert.deepEqual(reports.map(r => r.path).toSorted((a, b) => a.localeCompare(b)), expectedPaths.toSorted((a, b) => a.localeCompare(b)));
});

/* eslint-enable node-test/require-assertion, node-test/no-conditional-assertion, node-test/no-process-chdir-in-test -- Re-enabled for anything added below this file. */
