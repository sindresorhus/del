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

	for (const directory of [outsideTemporaryPath, outsideMarkerPath]) {
		if (directory) {
			fs.rmSync(directory, {recursive: true, force: true});
		}
	}

	outsideTemporaryPath = undefined;
	outsideMarkerPath = undefined;
});

// A directory next to `temporaryPath`, so it is reachable through a symlink but
// is still outside of the working directory. Created on demand, as most tests
// do not need it.
let outsideTemporaryPath;

function createOutsideDirectory(name) {
	if (!outsideTemporaryPath) {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'del-outside-'));
		outsideTemporaryPath = fs.realpathSync(root);
	}

	const directory = path.join(outsideTemporaryPath, name);
	fs.mkdirSync(directory, {recursive: true});
	return directory;
}

// Creates `<temporaryPath>/a/<name>` as a symlink pointing at a fresh directory
// outside of the working directory, and returns the path of the linked file.
function createSymlinkToOutside(name) {
	const target = createOutsideDirectory(name);
	fs.mkdirSync(path.join(target, 'secret'), {recursive: true});

	const link = path.join(temporaryPath, 'a', name);
	fs.mkdirSync(path.dirname(link), {recursive: true});
	fs.symlinkSync(target, link, 'dir');

	return path.join(target, 'secret');
}

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

test('onProgress option - progress of non-existent file - sync', () => {
	let report;

	deleteSync('non-existent-directory', {
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

test('onProgress option - progress of single file - sync', () => {
	let report;

	deleteSync(temporaryPath, {
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

test('onProgress option - progress of multiple files - sync', () => {
	const reports = [];

	const sourcePath = process.platform === 'win32' ? path.resolve(`${temporaryPath}/*`).replaceAll('\\', '/') : `${temporaryPath}/*`;

	deleteSync(sourcePath, {
		cwd: __dirname,
		force: true,
		onProgress(event) {
			reports.push(event);
		},
	});

	assert.equal(reports.length, 4);
	assert.deepEqual(reports.map(r => r.totalCount), [4, 4, 4, 4]);
	assert.deepEqual(reports.map(r => r.deletedCount), [1, 2, 3, 4]);
	assert.deepEqual(reports.map(r => r.percent), [0.25, 0.5, 0.75, 1]);

	const expectedPaths = ['1', '2', '3', '4'].map(x => path.join(temporaryPath, `${x}.tmp`));
	assert.deepEqual(reports.map(r => r.path).toSorted((a, b) => a.localeCompare(b)), expectedPaths.toSorted((a, b) => a.localeCompare(b)));
});

// Symlink creation needs elevated privileges on Windows.
const symlinkTestOptions = process.platform === 'win32'
	? {skip: 'Creating symlinks requires elevated privileges on Windows'}
	: {};

test('cannot delete files outside cwd through a symlink - async', symlinkTestOptions, async () => {
	const outsideFile = createSymlinkToOutside('escape');

	await assert.rejects(deleteAsync('a/escape/**', {cwd: temporaryPath}), {
		message: cannotDeleteOutsideCwdMessage,
	});

	assert.ok(fs.existsSync(outsideFile));
});

test('cannot delete files outside cwd through a symlink - sync', symlinkTestOptions, () => {
	const outsideFile = createSymlinkToOutside('escape');

	assert.throws(() => {
		deleteSync('a/escape/**', {cwd: temporaryPath});
	}, {
		message: cannotDeleteOutsideCwdMessage,
	});

	assert.ok(fs.existsSync(outsideFile));
});

test('cannot delete files outside cwd through a followed symlink - async', symlinkTestOptions, async () => {
	const outsideFile = createSymlinkToOutside('escape');

	await assert.rejects(deleteAsync('a/**', {cwd: temporaryPath, followSymbolicLinks: true}), {
		message: cannotDeleteOutsideCwdMessage,
	});

	assert.ok(fs.existsSync(outsideFile));
});

test('cannot delete files outside cwd through a followed symlink - sync', symlinkTestOptions, () => {
	const outsideFile = createSymlinkToOutside('escape');

	assert.throws(() => {
		deleteSync('a/**', {cwd: temporaryPath, followSymbolicLinks: true});
	}, {
		message: cannotDeleteOutsideCwdMessage,
	});

	assert.ok(fs.existsSync(outsideFile));
});

test('can delete files outside cwd through a symlink with force: true - async', symlinkTestOptions, async () => {
	const outsideFile = createSymlinkToOutside('escape');

	const removed = await deleteAsync('a/escape/**', {cwd: temporaryPath, force: true});

	assert.deepEqual(removed, [path.join(temporaryPath, 'a/escape/secret')]);
	assert.ok(!fs.existsSync(outsideFile));
});

test('can delete files outside cwd through a symlink with force: true - sync', symlinkTestOptions, () => {
	const outsideFile = createSymlinkToOutside('escape');

	const removed = deleteSync('a/escape/**', {cwd: temporaryPath, force: true});

	assert.deepEqual(removed, [path.join(temporaryPath, 'a/escape/secret')]);
	assert.ok(!fs.existsSync(outsideFile));
});

// A symlink loop cannot be resolved, but it must not stop the deletion.
function createSymlinkLoop() {
	const loop = path.join(temporaryPath, 'loop');
	fs.mkdirSync(loop, {recursive: true});
	fs.symlinkSync(path.join(loop, 'b'), path.join(loop, 'a'), 'dir');
	fs.symlinkSync(path.join(loop, 'a'), path.join(loop, 'b'), 'dir');
	return loop;
}

test('deletes a symlink loop - async', symlinkTestOptions, async () => {
	const loop = createSymlinkLoop();

	const removed = await deleteAsync('loop/*', {cwd: temporaryPath});

	assert.deepEqual(removed, [path.join(loop, 'a'), path.join(loop, 'b')]);
	notExists(['loop/a', 'loop/b']);
});

test('deletes a symlink loop - sync', symlinkTestOptions, () => {
	const loop = createSymlinkLoop();

	const removed = deleteSync('loop/*', {cwd: temporaryPath});

	assert.deepEqual(removed, [path.join(loop, 'a'), path.join(loop, 'b')]);
	notExists(['loop/a', 'loop/b']);
});

// Backslash patterns are only rewritten on Windows, where a backslash would
// otherwise escape the next character for fast-glob. Faking the platform is the
// only way to exercise that branch from another OS.
async function withPlatform(platform, callback) {
	const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
	Object.defineProperty(process, 'platform', {value: platform, configurable: true});

	try {
		return await callback();
	} finally {
		Object.defineProperty(process, 'platform', descriptor);
	}
}

// Creates `temp/keep.js` and `temp/drop.js` and returns the patterns that match
// both of them, keeping only the first one.
function createNegationFixture() {
	fs.mkdirSync(path.join(temporaryPath, 'temp'), {recursive: true});
	fs.writeFileSync(path.join(temporaryPath, 'temp', 'keep.js'), '');
	fs.writeFileSync(path.join(temporaryPath, 'temp', 'drop.js'), '');
	return [String.raw`temp\*.js`, String.raw`!temp\keep.js`];
}

test(String.raw`negated pattern with "\" is converted on Windows - async`, async () => {
	const patterns = createNegationFixture();

	const removed = await withPlatform('win32', async () => deleteAsync(patterns, {cwd: temporaryPath}));

	assert.deepEqual(removed, [path.join(temporaryPath, 'temp', 'drop.js')]);
	notExists(['temp/drop.js']);
	exists(['temp/keep.js']);
});

test(String.raw`negated pattern with "\" is converted on Windows - sync`, async () => {
	const patterns = createNegationFixture();

	const removed = await withPlatform('win32', async () => deleteSync(patterns, {cwd: temporaryPath}));

	assert.deepEqual(removed, [path.join(temporaryPath, 'temp', 'drop.js')]);
	notExists(['temp/drop.js']);
	exists(['temp/keep.js']);
});

test('negated pattern is left alone off Windows - async', async () => {
	// Off Windows a backslash escapes the next character, so `temp\*.js` looks
	// for a literal `*` and matches nothing. Reaching fast-globby untouched is
	// what keeps that the case.
	const patterns = createNegationFixture();

	const removed = await withPlatform('linux', async () => deleteAsync(patterns, {cwd: temporaryPath, dryRun: true}));

	assert.deepEqual(removed, []);
	exists(['temp/keep.js', 'temp/drop.js']);
});

test('negated pattern is left alone off Windows - sync', async () => {
	const patterns = createNegationFixture();

	const removed = await withPlatform('linux', async () => deleteSync(patterns, {cwd: temporaryPath, dryRun: true}));

	assert.deepEqual(removed, []);
	exists(['temp/keep.js', 'temp/drop.js']);
});

// Globby deduplicates on the pattern text, and a trailing separator survives
// that, so these patterns all name the same directory.
const trailingSlashPatterns = [
	['1.tmp', '1.tmp/'],
	['1.tmp/', '1.tmp'],
	['1.tmp', '1.tmp//'],
	['./1.tmp', '1.tmp/'],
];

test('returns each path once for patterns that differ only by a trailing slash - async', async () => {
	for (const patterns of trailingSlashPatterns) {
		// eslint-disable-next-line no-await-in-loop
		const removed = await deleteAsync(patterns, {cwd: temporaryPath, dryRun: true});

		assert.deepEqual(removed, [path.join(temporaryPath, '1.tmp')]);
	}
});

test('returns each path once for patterns that differ only by a trailing slash - sync', () => {
	for (const patterns of trailingSlashPatterns) {
		const removed = deleteSync(patterns, {cwd: temporaryPath, dryRun: true});

		assert.deepEqual(removed, [path.join(temporaryPath, '1.tmp')]);
	}
});

test('onProgress counts each path once for patterns that differ only by a trailing slash - async', async () => {
	const reports = [];

	await deleteAsync(['1.tmp', '1.tmp/'], {
		cwd: temporaryPath,
		dryRun: true,
		onProgress(event) {
			reports.push(event);
		},
	});

	assert.deepEqual(reports, [{
		totalCount: 1,
		deletedCount: 1,
		percent: 1,
		path: path.join(temporaryPath, '1.tmp'),
	}]);
});

test('onProgress counts each path once for patterns that differ only by a trailing slash - sync', () => {
	const reports = [];

	deleteSync(['1.tmp', '1.tmp/'], {
		cwd: temporaryPath,
		dryRun: true,
		onProgress(event) {
			reports.push(event);
		},
	});

	assert.deepEqual(reports, [{
		totalCount: 1,
		deletedCount: 1,
		percent: 1,
		path: path.join(temporaryPath, '1.tmp'),
	}]);
});

// The `cwd` option can point somewhere else than the process working directory,
// and deleting it is the same mistake either way, so it gets the same message.
test('cannot delete the cwd option itself without force: true - async', async () => {
	await assert.rejects(deleteAsync([temporaryPath], {cwd: temporaryPath}), {
		message: cannotDeleteCwdMessage,
	});

	exists(['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('cannot delete the cwd option itself without force: true - sync', () => {
	assert.throws(() => {
		deleteSync([temporaryPath], {cwd: temporaryPath});
	}, {
		message: cannotDeleteCwdMessage,
	});

	exists(['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('cannot delete "." with the cwd option without force: true - async', async () => {
	await assert.rejects(deleteAsync('.', {cwd: temporaryPath}), {
		message: cannotDeleteCwdMessage,
	});

	exists(['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('cannot delete "." with the cwd option without force: true - sync', () => {
	assert.throws(() => {
		deleteSync('.', {cwd: temporaryPath});
	}, {
		message: cannotDeleteCwdMessage,
	});

	exists(['', '1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

// A directory next to `temporaryPath`, so that a `../` pattern names something
// real that `del` will match and then refuse to delete. The name is unique per
// test, as several temporary directories can exist at once.
let outsideMarkerPath;

function createOutsideMarker() {
	outsideMarkerPath = path.join(path.dirname(temporaryPath), `${path.basename(temporaryPath)}-marker`);
	fs.mkdirSync(outsideMarkerPath, {recursive: true});
	return `../${path.basename(outsideMarkerPath)}`;
}

// The paths are sorted deepest first, so a path outside `cwd` is reached last
// and everything inside it is already gone by the time the guard notices. The
// whole batch has to be checked before anything is deleted.
test('deletes nothing when a matched path is outside cwd - async', async () => {
	const outsidePattern = createOutsideMarker();

	await assert.rejects(deleteAsync(['*', outsidePattern], {cwd: temporaryPath}), {
		message: cannotDeleteOutsideCwdMessage,
	});

	exists(fixtures);

	// In-flight deletions keep running after the rejection.
	await new Promise(resolve => {
		setTimeout(resolve, 100);
	});

	exists(fixtures);
});

test('deletes nothing when a matched path is outside cwd - sync', () => {
	const outsidePattern = createOutsideMarker();

	assert.throws(() => {
		deleteSync(['*', outsidePattern], {cwd: temporaryPath});
	}, {
		message: cannotDeleteOutsideCwdMessage,
	});

	exists(fixtures);
});

/* eslint-enable node-test/require-assertion, node-test/no-conditional-assertion, node-test/no-process-chdir-in-test -- Re-enabled for anything added below this file. */
