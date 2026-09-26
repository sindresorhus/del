import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import slash from 'slash';
import {deleteAsync, deleteSync} from './index.js';

/* eslint-disable max-lines -- Every behaviour is tested through both entry points in the loop below, so the tests stay together in one file. */

/* eslint-disable node-test/require-assertion, node-test/no-conditional-assertion, node-test/no-process-chdir-in-test -- False positives here: the assertions live in the `exists`/`notExists` helpers and in a loop that runs a fixed number of times, so the linter cannot see them at the call site, and the working-directory guard can only be tested by changing the working directory. */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const processCwd = process.cwd();

const cannotDeleteCwdMessage = 'Cannot delete the current working directory. Can be overridden with the `force` option.';
const cannotDeleteOutsideCwdMessage = 'Cannot delete files/directories outside the current working directory. Can be overridden with the `force` option.';

// Symlink creation needs elevated privileges on Windows.
const symlinkTestOptions = process.platform === 'win32'
	? {skip: 'Creating symlinks requires elevated privileges on Windows'}
	: {};

/*
Version 16.2.4 of globby does not apply an absolute negation to an absolute pattern, which its next release fixes. Node.js 22 does not know `expectFailure` and would run the test as a normal one, so it is skipped there.
*/
const absoluteNegationTestOptions = typeof test.expectFailure === 'function'
	? {expectFailure: 'globby 16.2.4 does not apply an absolute negation to an absolute pattern'}
	: {skip: 'Node.js 22 has no expectFailure'};

// A file name cannot hold a star on Windows.
const starFileNameTestOptions = process.platform === 'win32'
	? {skip: 'A file name cannot hold a star on Windows'}
	: {};

// A read-only directory keeps its entries from being deleted, except on Windows,
// which ignores the permission, and as root, which bypasses it.
const readOnlyDirectoryTestOptions = process.platform === 'win32' || process.getuid?.() === 0
	? {skip: 'A read-only directory does not stop a deletion on Windows or as root'}
	: {};

// The two entry points are meant to be behavioural twins, differing only in what
// they return, so every behaviour below is written once and run through both.
// They have already drifted once, which is what having the twins here prevents.
//
// `assertRejects` takes the call rather than its result, as the sync side throws
// where the async side rejects.
const entryPoints = [
	{
		suffix: 'async',
		run: deleteAsync,
		assertRejects: (call, expected) => assert.rejects(call(), expected),
	},
	{
		suffix: 'sync',
		run: deleteSync,
		assertRejects: (call, expected) => assert.throws(call, expected),
	},
];

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
// `temporaryPath` goes too, as a test that deletes the working directory has
// already removed it by the time this runs, which `force` covers.
afterEach(() => {
	process.chdir(processCwd);

	for (const directory of [temporaryPath, outsideTemporaryPath, outsideMarkerPath]) {
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

// A file outside `temporaryPath`, so it can be linked to from inside it. The
// directory is created on demand, like the other outside directories.
function createSymlinkedFile(name) {
	const file = path.join(createOutsideDirectory('shared'), name);
	fs.writeFileSync(file, '');
	return file;
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

// A symlink loop cannot be resolved, but it must not stop the deletion.
function createSymlinkLoop() {
	const loop = path.join(temporaryPath, 'loop');
	fs.mkdirSync(loop, {recursive: true});
	fs.symlinkSync(path.join(loop, 'b'), path.join(loop, 'a'), 'dir');
	fs.symlinkSync(path.join(loop, 'a'), path.join(loop, 'b'), 'dir');
	return loop;
}

// The deletions run concurrently, so a symlink that is the only route to its
// target can be unlinked before the paths below it are removed. `concurrency: 1`
// is the way to get the deterministic order that `deleteSync` always has.
function createSymlinkAlias() {
	fs.mkdirSync(path.join(temporaryPath, 'dir1/deep'), {recursive: true});
	fs.writeFileSync(path.join(temporaryPath, 'dir1/deep/x.js'), '');
	fs.symlinkSync(path.join(temporaryPath, 'dir1'), path.join(temporaryPath, 'link'), 'dir');
	return path.join(temporaryPath, 'dir1');
}

// A directory next to `temporaryPath`, so that a `../` pattern names something
// real that `del` will match and then refuse to delete. The name is unique per
// test, as several temporary directories can exist at once.
let outsideMarkerPath;

function createOutsideMarker() {
	outsideMarkerPath = path.join(path.dirname(temporaryPath), `${path.basename(temporaryPath)}-marker`);
	fs.mkdirSync(outsideMarkerPath, {recursive: true});
	return `../${path.basename(outsideMarkerPath)}`;
}

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

// The three defaults `del` moves away from globby's are defaults, not just
// values, so an explicit `undefined` must not hand them back to globby. A
// config object spread in from elsewhere carries those keys with `undefined`
// values often enough to matter.
//
// `onlyFiles` comes first, as `expandDirectories` is checked with a directory
// pattern, and that one only ever returns a result when `onlyFiles` is off. This
// way a failure names the option that was actually reverted.
//
// `**/*` is required for `followSymbolicLinks`, since `linked/target.js` only
// shows up in the result when the link is followed.
const undefinedDefaultFixture = () => {
	fs.mkdirSync(path.join(temporaryPath, 'dist/sub'), {recursive: true});
	fs.mkdirSync(path.join(temporaryPath, 'subdir'), {recursive: true});
	fs.writeFileSync(path.join(temporaryPath, 'top.txt'), '');
	fs.mkdirSync(path.join(temporaryPath, 'link'), {recursive: true});
	fs.writeFileSync(path.join(temporaryPath, 'link/target.js'), '');
	fs.symlinkSync(path.join(temporaryPath, 'link'), path.join(temporaryPath, 'linked'), 'dir');
};

const undefinedDefaultCases = [
	['onlyFiles', '*'],
	['expandDirectories', 'dist'],
	['followSymbolicLinks', '**/*'],
];

// Each case is compared against `false` and against `true`, so it cannot pass
// for a pattern where the option makes no difference at all.
function assertUndefinedKeepsDelDefault(undefinedResults, falseResults, trueResults) {
	for (const [index, [name]] of undefinedDefaultCases.entries()) {
		assert.deepEqual(
			undefinedResults[index],
			falseResults[index],
			`${name}: undefined must behave like false`,
		);

		assert.notDeepEqual(
			undefinedResults[index],
			trueResults[index],
			`${name}: the globby default must not win, or this case proves nothing`,
		);
	}
}

function undefinedDefaultOptions(name, value) {
	return {
		cwd: temporaryPath,
		dot: true,
		dryRun: true,
		[name]: value,
	};
}

// A function, as `temporaryPath` is only assigned in `beforeEach`.
const symlinkAliasOptions = () => ({
	cwd: temporaryPath,
	followSymbolicLinks: true,
	expandDirectories: true,
});

// Globby deduplicates on the pattern text, and a trailing separator survives
// that, so these patterns all name the same directory.
const trailingSlashPatterns = [
	['1.tmp', '1.tmp/'],
	['1.tmp/', '1.tmp'],
	['1.tmp', '1.tmp//'],
	['./1.tmp', '1.tmp/'],
];

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

// Creates each file along with the directories that hold it. A path ending in `/` is created as an empty directory.
function createFiles(files) {
	for (const file of files) {
		const fullPath = path.join(temporaryPath, file);

		if (file.endsWith('/')) {
			fs.mkdirSync(fullPath, {recursive: true});
			continue;
		}

		fs.mkdirSync(path.dirname(fullPath), {recursive: true});
		fs.writeFileSync(fullPath, '');
	}
}

// Creates `slow`, a directory large enough that deleting it is still in flight
// when a quicker deletion next to it has already settled.
function createSlowDirectory() {
	const slow = path.join(temporaryPath, 'slow');
	fs.mkdirSync(slow);
	for (let index = 0; index < 500; index++) {
		fs.writeFileSync(path.join(slow, String(index)), '');
	}
}

// Runs `callback` while `locked/file` cannot be deleted. The directory is made
// writable again afterwards, or the cleanup could not remove it.
async function withLockedFile(callback) {
	const locked = path.join(temporaryPath, 'locked');
	fs.mkdirSync(locked);
	fs.writeFileSync(path.join(locked, 'file'), '');
	fs.chmodSync(locked, 0o555);

	try {
		await callback();
	} finally {
		fs.chmodSync(locked, 0o755);
	}
}

// The expectations below are written the way a pattern is written, with forward
// slashes, so the separator is normalised: `path.relative` gives `a\b` on
// Windows and nothing below would ever match.
function relativePaths(files) {
	return files.map(file => slash(path.relative(temporaryPath, file)));
}

for (const {suffix, run, assertRejects} of entryPoints) {
	// The paths are deleted with `locked/file` first, so nothing after it may be
	// started once it fails. `concurrency: 1` is what makes that observable on the
	// async side.
	test(`stops at the first failed deletion - ${suffix}`, readOnlyDirectoryTestOptions, async () => {
		fs.mkdirSync(path.join(temporaryPath, 'a'));

		await withLockedFile(async () => {
			await assertRejects(() => run(['locked/file', 'a'], {cwd: temporaryPath, concurrency: 1}), {code: 'EACCES'});
			exists(['a']);
		});
	});

	test(`delete files - ${suffix}`, async () => {
		await run(['*.tmp', '!1*'], {cwd: temporaryPath});

		exists(['1.tmp', '.dot.tmp']);
		notExists(['2.tmp', '3.tmp', '4.tmp']);
	});

	test(`take options into account - ${suffix}`, async () => {
		await run(['*.tmp', '!1*'], {
			cwd: temporaryPath,
			dot: true,
		});

		exists(['1.tmp']);
		notExists(['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	});

	test(`return deleted files - ${suffix}`, async () => {
		assert.deepEqual(
			await run('1.tmp', {cwd: temporaryPath}),
			[path.join(temporaryPath, '1.tmp')],
		);
	});

	test(`don't delete files, but return them - ${suffix}`, async () => {
		const deletedFiles = await run(['*.tmp', '!1*'], {
			cwd: temporaryPath,
			dryRun: true,
		});
		exists(fixtures);
		assert.deepEqual(deletedFiles, [
			path.join(temporaryPath, '2.tmp'),
			path.join(temporaryPath, '3.tmp'),
			path.join(temporaryPath, '4.tmp'),
		]);
	});

	// Currently this is only testable locally on macOS.
	// https://github.com/sindresorhus/del/issues/68
	test(`does not throw EINVAL - ${suffix}`, async () => {
		await run('**/*', {
			cwd: temporaryPath,
			dot: true,
		});

		const nestedFile = path.resolve(temporaryPath, 'a/b/c/nested.js');
		const totalAttempts = 200;

		let count = 0;
		while (count !== totalAttempts) {
			fs.mkdirSync(nestedFile, {recursive: true});

			// eslint-disable-next-line no-await-in-loop
			const removed = await run('**/*', {
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

	test(`delete relative files outside of process.cwd using cwd - ${suffix}`, async () => {
		await run(['1.tmp'], {cwd: temporaryPath});

		exists(['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
		notExists(['1.tmp']);
	});

	test(`delete absolute files outside of process.cwd using cwd - ${suffix}`, async () => {
		const absolutePath = path.resolve(temporaryPath, '1.tmp');
		await run([absolutePath], {cwd: temporaryPath});

		exists(['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
		notExists(['1.tmp']);
	});

	test(`cannot delete actual working directory without force: true - ${suffix}`, async () => {
		process.chdir(temporaryPath);

		await assertRejects(() => run([temporaryPath]), {
			message: cannotDeleteCwdMessage,
		});

		exists(['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	});

	test(`cannot delete actual working directory with cwd option without force: true - ${suffix}`, async () => {
		process.chdir(temporaryPath);

		await assertRejects(() => run([temporaryPath], {cwd: __dirname}), {
			message: cannotDeleteCwdMessage,
		});

		exists(['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	});

	test(`cannot delete files outside cwd without force: true - ${suffix}`, async () => {
		const absolutePath = path.resolve(temporaryPath, '1.tmp');

		await assertRejects(() => run([absolutePath]), {
			message: cannotDeleteOutsideCwdMessage,
		});

		exists(['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	});

	test(`cannot delete files inside process.cwd when outside cwd without force: true - ${suffix}`, async () => {
		process.chdir(temporaryPath);
		const removeFile = path.resolve(temporaryPath, '2.tmp');
		const cwd = path.resolve(temporaryPath, '1.tmp');

		await assertRejects(() => run([removeFile], {cwd}), {
			message: cannotDeleteOutsideCwdMessage,
		});

		exists(['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	});

	// The `cwd` option can point somewhere else than the process working
	// directory, and deleting it is the same mistake either way, so it gets the
	// same message.
	test(`cannot delete the cwd option itself without force: true - ${suffix}`, async () => {
		await assertRejects(() => run([temporaryPath], {cwd: temporaryPath}), {
			message: cannotDeleteCwdMessage,
		});

		exists(['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	});

	test(`cannot delete "." with the cwd option without force: true - ${suffix}`, async () => {
		await assertRejects(() => run('.', {cwd: temporaryPath}), {
			message: cannotDeleteCwdMessage,
		});

		exists(['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	});

	// A directory that contains the process working directory takes it down with
	// the rest of the tree, so it is the same mistake as deleting the working
	// directory itself, even though the two are not the same path.
	test(`cannot delete a directory that contains the working directory - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, 'build/scripts'), {recursive: true});
		process.chdir(path.join(temporaryPath, 'build/scripts'));

		await assertRejects(() => run(['build'], {cwd: temporaryPath}), {
			message: cannotDeleteCwdMessage,
		});

		exists(['build', 'build/scripts']);
	});

	// Naming the `cwd` option by its real path rather than through the link is
	// still naming the working directory, and has to report the same mistake.
	test(`cannot delete the cwd option named by another spelling - ${suffix}`, symlinkTestOptions, async () => {
		fs.symlinkSync(temporaryPath, path.join(temporaryPath, 'alias'), 'dir');

		await assertRejects(() => run(temporaryPath, {cwd: path.join(temporaryPath, 'alias')}), {
			message: cannotDeleteCwdMessage,
		});

		exists(fixtures);
	});

	test(`force: true allows deleting the cwd option - ${suffix}`, async () => {
		const removed = await run('.', {cwd: temporaryPath, force: true});

		assert.deepEqual(removed, [temporaryPath]);
		assert.ok(!fs.existsSync(temporaryPath));
	});

	test(`force: true allows deleting a path outside cwd - ${suffix}`, async () => {
		const outsidePattern = createOutsideMarker();

		const removed = await run([outsidePattern], {cwd: temporaryPath, force: true});

		assert.deepEqual(removed, [path.resolve(temporaryPath, outsidePattern)]);
		assert.ok(!fs.existsSync(outsideMarkerPath));
	});

	test(`force: true allows deleting an absolute path outside cwd - ${suffix}`, async () => {
		const outsidePattern = createOutsideMarker();
		const outsidePath = path.resolve(temporaryPath, outsidePattern);

		const removed = await run([outsidePath], {cwd: temporaryPath, force: true});

		assert.deepEqual(removed, [outsidePath]);
		assert.ok(!fs.existsSync(outsidePath));
	});

	// A path can be gone by the time it comes up, when something earlier in the
	// batch took it with it or the tree changed underneath. That is not an
	// error, which is what `force: true` on the `fs.rm` call is for.
	//
	// `concurrency: 1` because otherwise the async side starts every deletion of
	// this small batch at once and there is nothing left for the callback to take
	// away.
	test(`a path that vanished between matching and deleting is not an error - ${suffix}`, async () => {
		let hasReported = false;

		const removed = await run('**/*', {
			cwd: temporaryPath,
			concurrency: 1,
			onProgress() {
				if (hasReported) {
					return;
				}

				hasReported = true;
				// `1.tmp` is the last path in the batch, so it is still
				// there to be taken away.
				fs.rmSync(path.join(temporaryPath, '1.tmp'), {recursive: true, force: true});
			},
		});

		assert.deepEqual(removed, [
			path.join(temporaryPath, '1.tmp'),
			path.join(temporaryPath, '2.tmp'),
			path.join(temporaryPath, '3.tmp'),
			path.join(temporaryPath, '4.tmp'),
		]);
	});

	test(`returns the deleted paths in ascending order - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, 'a/b'), {recursive: true});

		const removed = await run('**/*', {cwd: temporaryPath, dryRun: true});

		assert.deepEqual(removed, removed.toSorted((a, b) => a.localeCompare(b)));
	});

	test(`returns each path once for patterns that differ only by a trailing slash - ${suffix}`, async () => {
		for (const patterns of trailingSlashPatterns) {
			// eslint-disable-next-line no-await-in-loop
			const removed = await run(patterns, {cwd: temporaryPath, dryRun: true});

			assert.deepEqual(removed, [path.join(temporaryPath, '1.tmp')]);
		}
	});

	test(`onProgress counts each path once for patterns that differ only by a trailing slash - ${suffix}`, async () => {
		const reports = [];

		await run(['1.tmp', '1.tmp/'], {
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

	test(`onProgress option - progress of non-existent file - ${suffix}`, async () => {
		let report;

		await run('non-existent-directory', {
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

	test(`onProgress option - progress of single file - ${suffix}`, async () => {
		let report;

		await run(temporaryPath, {
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

	test(`onProgress option - progress of multiple files - ${suffix}`, async () => {
		const reports = [];

		const sourcePath = process.platform === 'win32' ? path.resolve(`${temporaryPath}/*`).replaceAll('\\', '/') : `${temporaryPath}/*`;

		await run(sourcePath, {
			cwd: __dirname,
			force: true,
			onProgress(event) {
				reports.push(event);
			},
		});

		const expectedPaths = ['1', '2', '3', '4'].map(x => path.join(temporaryPath, `${x}.tmp`));
		const byCount = (a, b) => a - b;
		const byName = (a, b) => a.localeCompare(b);

		assert.equal(reports.length, 4);
		assert.deepEqual(reports.map(r => r.totalCount), [4, 4, 4, 4]);
		assert.deepEqual(reports.map(r => r.deletedCount).toSorted(byCount), [1, 2, 3, 4]);
		assert.deepEqual(reports.map(r => r.percent).toSorted(byCount), [0.25, 0.5, 0.75, 1]);
		assert.deepEqual(reports.map(r => r.path).toSorted(byName), expectedPaths.toSorted(byName));
	});

	// With `dryRun` nothing is deleted, so the count and the path describe what
	// the option would have removed.
	test(`onProgress under dryRun describes what would have been deleted - ${suffix}`, async () => {
		const reports = [];

		await run('*', {
			cwd: temporaryPath,
			dryRun: true,
			onProgress(event) {
				reports.push(event);
			},
		});

		const byCount = (a, b) => a - b;

		assert.deepEqual(reports.map(r => r.totalCount), [4, 4, 4, 4]);
		assert.deepEqual(reports.map(r => r.deletedCount).toSorted(byCount), [1, 2, 3, 4]);
		assert.deepEqual(reports.map(r => r.percent).toSorted(byCount), [0.25, 0.5, 0.75, 1]);
		exists(fixtures);
	});

	test(`a negated pattern protects a file from a broader pattern - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, 'assets'), {recursive: true});
		fs.writeFileSync(path.join(temporaryPath, 'assets', 'goat.png'), '');
		fs.writeFileSync(path.join(temporaryPath, 'assets', 'other.png'), '');

		await run(['assets/**', '!assets/goat.png'], {cwd: temporaryPath});

		exists(['assets', 'assets/goat.png']);
		notExists(['assets/other.png']);
	});

	/*
	Naming a directory deletes what is inside it too, so a negation inside it keeps the directory, and the rest of what is inside it is deleted.
	*/
	test(`naming a directory keeps it when a negation is inside it - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, 'assets/css'), {recursive: true});
		fs.writeFileSync(path.join(temporaryPath, 'assets', 'goat.png'), '');
		fs.writeFileSync(path.join(temporaryPath, 'assets', 'other.png'), '');
		fs.writeFileSync(path.join(temporaryPath, 'assets/css/a.css'), '');

		const removed = await run(['assets', '!assets/goat.png'], {cwd: temporaryPath});

		assert.deepEqual(relativePaths(removed), ['assets/css', 'assets/other.png']);
		exists(['assets/goat.png']);
		notExists(['assets/css', 'assets/other.png']);
	});

	// A trailing `**` covers everything inside a directory but not the directory
	// itself, so the directory is left behind, still holding whatever the
	// negation kept.
	test(`a trailing ** leaves the directory itself behind - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, 'assets/css'), {recursive: true});
		fs.writeFileSync(path.join(temporaryPath, 'assets', 'goat.png'), '');
		fs.writeFileSync(path.join(temporaryPath, 'assets/css/a.css'), '');

		const removed = await run(['assets/**', '!assets/goat.png'], {cwd: temporaryPath});

		assert.deepEqual(removed, [
			path.join(temporaryPath, 'assets/css'),
			path.join(temporaryPath, 'assets/css/a.css'),
		]);
		exists(['assets', 'assets/goat.png']);
		notExists(['assets/css']);
	});

	/*
	A directory goes with everything inside it, so the directories holding a negated path are kept, and the rest of what is inside them is deleted one path at a time.
	*/
	test(`a negated path keeps the directories that hold it - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, 'assets/sub/deep'), {recursive: true});
		fs.writeFileSync(path.join(temporaryPath, 'assets/other.png'), '');
		fs.writeFileSync(path.join(temporaryPath, 'assets/sub/goat.png'), '');
		fs.writeFileSync(path.join(temporaryPath, 'assets/sub/other.png'), '');
		fs.writeFileSync(path.join(temporaryPath, 'assets/sub/deep/other.png'), '');

		const removed = await run(['assets/**', '!assets/sub/goat.png'], {cwd: temporaryPath});

		assert.deepEqual(relativePaths(removed), [
			'assets/other.png',
			'assets/sub/deep',
			'assets/sub/deep/other.png',
			'assets/sub/other.png',
		]);
		exists(['assets/sub/goat.png']);
	});

	test(`a negated glob keeps the directories that hold its matches - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, 'assets/a/b'), {recursive: true});
		fs.writeFileSync(path.join(temporaryPath, 'assets/a/goat.png'), '');
		fs.writeFileSync(path.join(temporaryPath, 'assets/a/b/goat.png'), '');
		fs.writeFileSync(path.join(temporaryPath, 'assets/a/b/other.css'), '');

		await run(['assets/**', '!**/goat.png'], {cwd: temporaryPath});

		exists(['assets/a/goat.png', 'assets/a/b/goat.png']);
		notExists(['assets/a/b/other.css']);
	});

	test(`the ignore option keeps the directories that hold what it ignores - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, 'package/.git'), {recursive: true});
		fs.writeFileSync(path.join(temporaryPath, 'package/.git/HEAD'), '');
		fs.writeFileSync(path.join(temporaryPath, 'package/index.js'), '');

		await run('**/*', {cwd: temporaryPath, dot: true, ignore: ['**/.git']});

		exists(['package/.git/HEAD']);
		notExists(['package/index.js']);
	});

	test(`gitignore: true keeps the directories that hold what it ignores - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, 'app'), {recursive: true});
		fs.writeFileSync(path.join(temporaryPath, '.gitignore'), '*.log\n');
		fs.writeFileSync(path.join(temporaryPath, 'app/debug.log'), '');
		fs.writeFileSync(path.join(temporaryPath, 'app/index.js'), '');

		await run('**/*', {cwd: temporaryPath, gitignore: true});

		exists(['app/debug.log']);
		notExists(['app/index.js']);
	});

	test(`ignoreFiles keeps the directories that hold what it ignores - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, 'app'), {recursive: true});
		fs.writeFileSync(path.join(temporaryPath, '.delignore'), '*.log\n');
		fs.writeFileSync(path.join(temporaryPath, 'app/debug.log'), '');
		fs.writeFileSync(path.join(temporaryPath, 'app/index.js'), '');

		await run('**/*', {cwd: temporaryPath, ignoreFiles: '.delignore'});

		exists(['app/debug.log']);
		notExists(['app/index.js']);
	});

	/*
	Globby turns a list of nothing but negations into everything except them, so that is what the excluded paths are found against too.
	*/
	test(`a pattern of nothing but negations keeps the directories that hold them - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, 'sub'), {recursive: true});
		fs.writeFileSync(path.join(temporaryPath, 'sub/keep.js'), '');
		fs.writeFileSync(path.join(temporaryPath, 'sub/other.js'), '');

		await run(['!sub/keep.js'], {cwd: temporaryPath});

		exists(['sub/keep.js']);
		notExists(['sub/other.js', '1.tmp']);
	});

	test(`a negated directory keeps everything inside it - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, 'assets/sub/deep'), {recursive: true});
		fs.writeFileSync(path.join(temporaryPath, 'assets/sub/deep/file'), '');
		fs.writeFileSync(path.join(temporaryPath, 'assets/other'), '');

		await run(['assets/**', '!assets/sub'], {cwd: temporaryPath});

		exists(['assets/sub/deep/file']);
		notExists(['assets/other']);
	});

	/*
	A negation applies only to the patterns before it, so a later pattern can bring a path back. That path is then deleted, while what the negation still leaves out keeps its directory.
	*/
	test(`a path brought back by a later pattern is deleted - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, 'a/b'), {recursive: true});
		fs.writeFileSync(path.join(temporaryPath, 'a/b/keep.txt'), '');
		fs.writeFileSync(path.join(temporaryPath, 'a/b/other.txt'), '');
		fs.writeFileSync(path.join(temporaryPath, 'a/other.txt'), '');

		await run(['a/**', '!a/b/**', 'a/b/keep.txt'], {cwd: temporaryPath});

		exists(['a/b/other.txt']);
		notExists(['a/b/keep.txt', 'a/other.txt']);
	});

	test(`an excluded path is found in a directory whose name has glob characters - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, 'assets/sub (1)/[x]'), {recursive: true});
		fs.writeFileSync(path.join(temporaryPath, 'assets/sub (1)/[x]/goat.png'), '');
		fs.writeFileSync(path.join(temporaryPath, 'assets/sub (1)/[x]/other.png'), '');

		await run(['assets/**', '!**/goat.png'], {cwd: temporaryPath});

		exists(['assets/sub (1)/[x]/goat.png']);
		notExists(['assets/sub (1)/[x]/other.png']);
	});

	test(`dryRun reports what a real run deletes when directories are kept - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, 'assets/sub'), {recursive: true});
		fs.writeFileSync(path.join(temporaryPath, 'assets/sub/goat.png'), '');
		fs.writeFileSync(path.join(temporaryPath, 'assets/sub/other.png'), '');
		const patterns = ['assets/**', '!assets/sub/goat.png'];

		const planned = await run(patterns, {cwd: temporaryPath, dryRun: true});
		const removed = await run(patterns, {cwd: temporaryPath});

		assert.deepEqual(planned, removed);
		assert.deepEqual(relativePaths(removed), ['assets/sub/other.png']);
	});

	test(`force keeps the directories outside the working directory that hold an excluded path - ${suffix}`, async () => {
		const marker = createOutsideMarker();
		fs.mkdirSync(path.join(outsideMarkerPath, 'sub'), {recursive: true});
		fs.writeFileSync(path.join(outsideMarkerPath, 'sub/keep.txt'), '');
		fs.writeFileSync(path.join(outsideMarkerPath, 'sub/other.txt'), '');

		await run([`${marker}/**`, `!${marker}/sub/keep.txt`], {cwd: temporaryPath, force: true});

		assert.ok(fs.existsSync(path.join(outsideMarkerPath, 'sub/keep.txt')));
		assert.ok(!fs.existsSync(path.join(outsideMarkerPath, 'sub/other.txt')));
	});

	/*
	The second glob walks what `ignore` skips, so a directory it cannot read must not fail a deletion that never needed to read it.
	*/
	test(`the ignore option still skips a directory that cannot be read - ${suffix}`, readOnlyDirectoryTestOptions, async () => {
		const unreadable = path.join(temporaryPath, 'app/unreadable');
		fs.mkdirSync(unreadable, {recursive: true});
		fs.writeFileSync(path.join(unreadable, 'file'), '');
		fs.writeFileSync(path.join(temporaryPath, 'app/index.js'), '');
		fs.chmodSync(unreadable, 0o000);

		try {
			await run('app/**', {cwd: temporaryPath, ignore: ['**/unreadable']});
		} finally {
			fs.chmodSync(unreadable, 0o755);
		}

		exists(['app/unreadable/file']);
		notExists(['app/index.js']);
	});

	test(`a negation keeps a directory matched by a single star - ${suffix}`, async () => {
		createFiles(['out/a.css', 'out/sub/keep.png', 'out/sub/b.css']);

		const removed = await run(['out/*', '!out/sub/keep.png'], {cwd: temporaryPath});

		assert.deepEqual(relativePaths(removed), ['out/a.css', 'out/sub/b.css']);
		exists(['out/sub/keep.png']);
	});

	test(`a negation deep inside a named directory keeps every directory on the way - ${suffix}`, async () => {
		createFiles(['dist/a/b/c/keep.txt', 'dist/a/b/c/other.txt', 'dist/a/b/other/', 'dist/a/other.txt', 'dist/other.txt']);

		const removed = await run(['dist', '!dist/a/b/c/keep.txt'], {cwd: temporaryPath});

		assert.deepEqual(relativePaths(removed), [
			'dist/a/b/c/other.txt',
			'dist/a/b/other',
			'dist/a/other.txt',
			'dist/other.txt',
		]);
		exists(['dist/a/b/c/keep.txt']);
	});

	test(`a named directory with nothing excluded inside it is deleted as one path - ${suffix}`, async () => {
		createFiles(['dist/a/b.txt', 'src/keep.txt']);

		const removed = await run(['dist', '!src/keep.txt'], {cwd: temporaryPath});

		assert.deepEqual(relativePaths(removed), ['dist']);
		notExists(['dist']);
	});

	test(`a negation that matches nothing leaves a named directory to be deleted as one path - ${suffix}`, async () => {
		createFiles(['dist/a.txt']);

		const removed = await run(['dist', '!dist/missing.txt'], {cwd: temporaryPath});

		assert.deepEqual(relativePaths(removed), ['dist']);
	});

	test(`the ignore option keeps what it ignores inside a named directory - ${suffix}`, async () => {
		createFiles(['dist/app.js', 'dist/app.js.map', 'dist/lib/util.js', 'dist/lib/util.js.map']);

		await run('dist', {cwd: temporaryPath, ignore: ['**/*.map']});

		exists(['dist/app.js.map', 'dist/lib/util.js.map']);
		notExists(['dist/app.js', 'dist/lib/util.js']);
	});

	test(`gitignore: true keeps what it ignores inside a named directory - ${suffix}`, async () => {
		createFiles(['dist/app.js', 'dist/logs/debug.log']);
		fs.writeFileSync(path.join(temporaryPath, '.gitignore'), '*.log\n');

		await run('dist', {cwd: temporaryPath, gitignore: true});

		exists(['dist/logs/debug.log']);
		notExists(['dist/app.js']);
	});

	test(`the ignore option keeps a whole ignored directory inside a named directory - ${suffix}`, async () => {
		createFiles(['packages/a/index.js', 'packages/a/node_modules/x/index.js', 'packages/b/index.js']);

		const removed = await run('packages', {cwd: temporaryPath, ignore: ['**/node_modules']});

		assert.deepEqual(relativePaths(removed), ['packages/a/index.js', 'packages/b']);
		exists(['packages/a/node_modules/x/index.js']);
		notExists(['packages/a/index.js', 'packages/b']);
	});

	test(`ignoreFiles keeps what it ignores inside a named directory - ${suffix}`, async () => {
		createFiles(['dist/app.js', 'dist/logs/debug.log']);
		fs.writeFileSync(path.join(temporaryPath, '.delignore'), '*.log\n');

		await run('dist', {cwd: temporaryPath, ignoreFiles: '.delignore'});

		exists(['dist/logs/debug.log']);
		notExists(['dist/app.js']);
	});

	test(`an ignored directory that cannot be read inside a named directory is left alone - ${suffix}`, readOnlyDirectoryTestOptions, async () => {
		createFiles(['app/index.js', 'app/secret/file']);
		fs.writeFileSync(path.join(temporaryPath, '.gitignore'), 'secret\n');
		const secret = path.join(temporaryPath, 'app/secret');
		fs.chmodSync(secret, 0o000);

		try {
			assert.deepEqual(relativePaths(await run('app', {cwd: temporaryPath, dryRun: true, ignore: ['**/secret']})), ['app/index.js']);
			assert.deepEqual(relativePaths(await run('app', {cwd: temporaryPath, dryRun: true, gitignore: true})), ['app/index.js']);
		} finally {
			fs.chmodSync(secret, 0o755);
		}
	});

	test(`a directory both named and reached keeps a negated file - ${suffix}`, async () => {
		createFiles(['dist/keep', 'dist/sub/other']);

		const removed = await run(['dist', 'dist/**', '!dist/keep'], {cwd: temporaryPath});

		assert.deepEqual(relativePaths(removed), ['dist/sub', 'dist/sub/other']);
		exists(['dist/keep']);
	});

	test(`a directory named twice, once with a trailing separator, keeps a negated file - ${suffix}`, async () => {
		createFiles(['dist/keep', 'dist/other']);

		const removed = await run(['dist', 'dist/', '!dist/keep'], {cwd: temporaryPath});

		assert.deepEqual(relativePaths(removed), ['dist/other']);
		exists(['dist/keep']);
	});

	test(`a negated dot file inside a named directory is kept without the dot option - ${suffix}`, async () => {
		createFiles(['dist/.gitkeep', 'dist/app.js']);

		await run(['dist', '!dist/.gitkeep'], {cwd: temporaryPath});

		exists(['dist/.gitkeep']);
		notExists(['dist/app.js']);
	});

	test(`dot files inside a kept directory are deleted like the rest - ${suffix}`, async () => {
		createFiles(['dist/keep.txt', 'dist/.cache/data', 'dist/.env']);

		const removed = await run(['dist', '!dist/keep.txt'], {cwd: temporaryPath});

		assert.deepEqual(relativePaths(removed), ['dist/.cache', 'dist/.env']);
		exists(['dist/keep.txt']);
	});

	test(`a negated empty directory inside a named directory is kept - ${suffix}`, async () => {
		createFiles(['dist/empty/', 'dist/app.js']);

		await run(['dist', '!dist/empty'], {cwd: temporaryPath});

		exists(['dist/empty']);
		notExists(['dist/app.js']);
	});

	test(`a negated directory inside a named directory keeps everything inside it - ${suffix}`, async () => {
		createFiles(['dist/keep/a/b.txt', 'dist/keep/c.txt', 'dist/app.js']);

		await run(['dist', '!dist/keep'], {cwd: temporaryPath});

		exists(['dist/keep/a/b.txt', 'dist/keep/c.txt']);
		notExists(['dist/app.js']);
	});

	test(`a negated glob of a directory's contents keeps them inside a named directory - ${suffix}`, async () => {
		createFiles(['dist/keep/a/b.txt', 'dist/app.js']);

		await run(['dist', '!dist/keep/**'], {cwd: temporaryPath});

		exists(['dist/keep/a/b.txt']);
		notExists(['dist/app.js']);
	});

	test(`a negation keeps what it matches in every named directory - ${suffix}`, async () => {
		createFiles(['a/keep', 'a/other', 'b/c/keep', 'b/c/other', 'c/other']);

		const removed = await run(['a', 'b', 'c', '!**/keep'], {cwd: temporaryPath});

		assert.deepEqual(relativePaths(removed), ['a/other', 'b/c/other', 'c']);
		exists(['a/keep', 'b/c/keep']);
	});

	test(`a named directory inside another named directory is kept only once - ${suffix}`, async () => {
		createFiles(['a/b/keep', 'a/b/other', 'a/other']);

		const removed = await run(['a', 'a/b', '!a/b/keep'], {cwd: temporaryPath});

		assert.deepEqual(relativePaths(removed), ['a/b/other', 'a/other']);
		exists(['a/b/keep']);
	});

	test(`a path brought back by a later pattern is deleted from a named directory - ${suffix}`, async () => {
		createFiles(['dist/keep', 'dist/other']);

		const removed = await run(['dist', '!dist/keep', 'dist/keep'], {cwd: temporaryPath});

		assert.deepEqual(relativePaths(removed), ['dist', 'dist/keep']);
		notExists(['dist']);
	});

	test(`a negation keeps a file in a named directory whose name has glob characters - ${suffix}`, async () => {
		createFiles(['sub (1)/[x]/{a,b}/keep', 'sub (1)/[x]/{a,b}/other', 'sub (1)/other']);

		await run([String.raw`sub \(1\)`, String.raw`!sub \(1\)/\[x\]/\{a,b\}/keep`], {cwd: temporaryPath});

		exists(['sub (1)/[x]/{a,b}/keep']);
		notExists(['sub (1)/[x]/{a,b}/other', 'sub (1)/other']);
	});

	test(`a negation keeps a file in a named directory whose name has a star - ${suffix}`, starFileNameTestOptions, async () => {
		createFiles(['a*b/keep', 'a*b/other', 'axb/other']);

		await run([String.raw`a\*b`, '!**/keep'], {cwd: temporaryPath});

		exists(['a*b/keep', 'axb/other']);
		notExists(['a*b/other']);
	});

	test(`a matched directory whose name starts with an exclamation mark is looked inside - ${suffix}`, async () => {
		createFiles(['!important/keep', '!important/other']);

		await run([String.raw`\!important`, '!**/keep'], {cwd: temporaryPath});

		exists(['!important/keep']);
		notExists(['!important/other']);
	});

	test(`a negation written with a leading ./ keeps a file inside a named directory - ${suffix}`, async () => {
		createFiles(['dist/keep', 'dist/other']);

		await run(['dist', '!./dist/keep'], {cwd: temporaryPath});

		exists(['dist/keep']);
		notExists(['dist/other']);
	});

	test(`the deep option does not hide what is excluded inside a named directory - ${suffix}`, async () => {
		createFiles(['dist/a/b/c/keep', 'dist/a/b/c/other']);

		await run('dist', {cwd: temporaryPath, deep: 1, ignore: ['**/keep']});

		exists(['dist/a/b/c/keep']);
		notExists(['dist/a/b/c/other']);
	});

	test(`globstar: false does not hide a nested exclusion inside a named directory - ${suffix}`, async () => {
		createFiles(['dist/a/b/keep', 'dist/a/b/other', 'dist/other']);

		const removed = await run(['dist', '!dist/a/b/keep'], {cwd: temporaryPath, globstar: false});

		assert.deepEqual(relativePaths(removed), ['dist/a/b/other', 'dist/other']);
		exists(['dist/a/b/keep']);
		notExists(['dist/a/b/other', 'dist/other']);
	});

	test(`a negation before a named directory does not exclude its contents - ${suffix}`, async () => {
		createFiles(['dist/keep', 'dist/other']);

		const removed = await run(['!dist/keep', 'dist'], {cwd: temporaryPath});

		assert.deepEqual(relativePaths(removed), ['dist']);
		notExists(['dist']);
	});

	test(`a later pattern brings back an excluded directory and its contents - ${suffix}`, async () => {
		createFiles(['dist/sub/keep', 'dist/sub/other', 'dist/other']);

		const removed = await run(['dist', '!dist/sub', 'dist/sub'], {cwd: temporaryPath});

		assert.deepEqual(relativePaths(removed), ['dist', 'dist/sub']);
		notExists(['dist']);
	});

	test(`onlyDirectories: true still finds an excluded file inside a matched directory - ${suffix}`, async () => {
		createFiles(['dist/x/keep', 'dist/x/other', 'dist/y/other']);

		await run(['dist/*', '!dist/x/keep'], {cwd: temporaryPath, onlyDirectories: true});

		exists(['dist/x/keep']);
		notExists(['dist/x/other', 'dist/y']);
	});

	test(`onlyFiles: true matches no directory, so nothing is looked inside - ${suffix}`, async () => {
		createFiles(['dist/x/keep', 'dist/x/other']);

		const removed = await run(['dist/**', '!dist/x/keep'], {cwd: temporaryPath, onlyFiles: true});

		assert.deepEqual(relativePaths(removed), ['dist/x/other']);
		exists(['dist/x/keep']);
	});

	test(`markDirectories: false does not stop a named directory from being kept - ${suffix}`, async () => {
		createFiles(['dist/keep', 'dist/other']);

		const removed = await run(['dist', '!dist/keep'], {cwd: temporaryPath, markDirectories: false});

		assert.deepEqual(relativePaths(removed), ['dist/other']);
		exists(['dist/keep']);
	});

	test(`absolute: true keeps a named directory with a negation inside it - ${suffix}`, async () => {
		createFiles(['dist/keep', 'dist/other']);

		const removed = await run(['dist', '!dist/keep'], {cwd: temporaryPath, absolute: true});

		assert.deepEqual(relativePaths(removed), ['dist/other']);
		exists(['dist/keep']);
	});

	test(`an absolute negation keeps a file inside a directory reached by an absolute pattern - ${suffix}`, absoluteNegationTestOptions, async () => {
		createFiles(['dist/sub/keep', 'dist/sub/other']);
		const directory = slash(path.join(temporaryPath, 'dist'));

		const removed = await run([`${directory}/**`, `!${directory}/sub/keep`], {cwd: temporaryPath});

		assert.deepEqual(relativePaths(removed), ['dist/sub/other']);
		exists(['dist/sub/keep']);
	});

	test(`an absolute negation keeps a file inside a directory named by an absolute pattern - ${suffix}`, absoluteNegationTestOptions, async () => {
		createFiles(['dist/keep', 'dist/other']);
		const directory = slash(path.join(temporaryPath, 'dist'));

		const removed = await run([directory, `!${directory}/keep`], {cwd: temporaryPath});

		assert.deepEqual(relativePaths(removed), ['dist/other']);
		exists(['dist/keep']);
	});

	test(`expandDirectories: true keeps a named directory with a negation inside it - ${suffix}`, async () => {
		createFiles(['dist/keep', 'dist/sub/other']);

		await run(['dist', '!dist/keep'], {cwd: temporaryPath, expandDirectories: true});

		exists(['dist/keep']);
		notExists(['dist/sub']);
	});

	test(`onProgress reports only what is deleted when a directory is kept - ${suffix}`, async () => {
		createFiles(['dist/keep', 'dist/a', 'dist/b']);
		const reports = [];

		const removed = await run(['dist', '!dist/keep'], {
			cwd: temporaryPath,
			onProgress(progress) {
				reports.push(progress);
			},
		});

		assert.equal(reports.length, 2);
		assert.ok(reports.every(report => report.totalCount === 2));
		assert.deepEqual(reports.map(report => report.path).toSorted((a, b) => a.localeCompare(b)), removed);
	});

	test(`dryRun reports what a real run deletes from a named directory - ${suffix}`, async () => {
		createFiles(['dist/keep', 'dist/a/b', 'dist/.c']);
		const patterns = ['dist', '!dist/keep'];

		const planned = await run(patterns, {cwd: temporaryPath, dryRun: true});
		const removed = await run(patterns, {cwd: temporaryPath});

		assert.deepEqual(planned, removed);
		assert.deepEqual(relativePaths(removed), ['dist/.c', 'dist/a']);
		exists(['dist/keep']);
	});

	test(`a kept directory outside the working directory still needs force - ${suffix}`, async () => {
		const marker = createOutsideMarker();
		fs.writeFileSync(path.join(outsideMarkerPath, 'keep'), '');
		fs.writeFileSync(path.join(outsideMarkerPath, 'other'), '');

		await assertRejects(() => run([marker, `!${marker}/keep`], {cwd: temporaryPath}), {
			message: cannotDeleteOutsideCwdMessage,
		});

		assert.ok(fs.existsSync(path.join(outsideMarkerPath, 'other')));
	});

	test(`force keeps a named directory outside the working directory - ${suffix}`, async () => {
		const marker = createOutsideMarker();
		fs.writeFileSync(path.join(outsideMarkerPath, 'keep'), '');
		fs.writeFileSync(path.join(outsideMarkerPath, 'other'), '');

		await run([marker, `!${marker}/keep`], {cwd: temporaryPath, force: true});

		assert.ok(fs.existsSync(path.join(outsideMarkerPath, 'keep')));
		assert.ok(!fs.existsSync(path.join(outsideMarkerPath, 'other')));
	});

	test(`a directory that cannot be read inside a named directory fails before anything is deleted - ${suffix}`, readOnlyDirectoryTestOptions, async () => {
		createFiles(['dist/keep', 'dist/other', 'dist/locked/file']);
		const locked = path.join(temporaryPath, 'dist/locked');
		fs.chmodSync(locked, 0o000);

		try {
			await assertRejects(() => run(['dist', '!dist/keep'], {cwd: temporaryPath}), {code: 'EACCES'});
		} finally {
			fs.chmodSync(locked, 0o755);
		}

		exists(['dist/keep', 'dist/other', 'dist/locked/file']);
	});

	test(`a named symlink is unlinked and its target is left alone - ${suffix}`, symlinkTestOptions, async () => {
		const target = createOutsideDirectory('target');
		fs.writeFileSync(path.join(target, 'keep'), '');
		fs.writeFileSync(path.join(target, 'other'), '');
		fs.symlinkSync(target, path.join(temporaryPath, 'link'), 'dir');

		const removed = await run(['link', '!link/keep'], {cwd: temporaryPath});

		assert.deepEqual(relativePaths(removed), ['link']);
		assert.ok(!fs.existsSync(path.join(temporaryPath, 'link')));
		assert.ok(fs.existsSync(path.join(target, 'other')));
	});

	test(`a symlink inside a kept directory is unlinked and its target is left alone - ${suffix}`, symlinkTestOptions, async () => {
		const target = createOutsideDirectory('target');
		fs.writeFileSync(path.join(target, 'keep'), '');
		fs.writeFileSync(path.join(target, 'other'), '');
		createFiles(['dist/keep', 'dist/other']);
		fs.symlinkSync(target, path.join(temporaryPath, 'dist/link'), 'dir');

		await run(['dist', '!**/keep'], {cwd: temporaryPath});

		exists(['dist/keep']);
		notExists(['dist/other', 'dist/link']);
		assert.ok(fs.existsSync(path.join(target, 'keep')));
		assert.ok(fs.existsSync(path.join(target, 'other')));
	});

	test(`followSymbolicLinks: true does not delete through a symlink inside a named directory - ${suffix}`, symlinkTestOptions, async () => {
		createFiles(['real/keep.txt', 'real/other.txt', 'dist/keep.txt', 'dist/other.txt']);
		fs.symlinkSync(path.join(temporaryPath, 'real'), path.join(temporaryPath, 'dist/link'), 'dir');

		const removed = await run(['dist', '!**/keep.txt'], {cwd: temporaryPath, followSymbolicLinks: true});

		assert.deepEqual(relativePaths(removed), ['dist/link', 'dist/other.txt']);
		exists(['real/keep.txt', 'real/other.txt', 'dist/keep.txt']);
	});

	test(`followSymbolicLinks: true does not look inside a matched symlink - ${suffix}`, symlinkTestOptions, async () => {
		createFiles(['real/keep.txt', 'real/other.txt']);
		fs.mkdirSync(path.join(temporaryPath, 'dist'));
		fs.symlinkSync(path.join(temporaryPath, 'real'), path.join(temporaryPath, 'dist/link'), 'dir');

		const removed = await run(['dist/*', '!**/keep.txt'], {cwd: temporaryPath, followSymbolicLinks: true});

		assert.deepEqual(relativePaths(removed), ['dist/link']);
		exists(['real/keep.txt', 'real/other.txt']);
	});

	test(`force with followSymbolicLinks: true does not delete outside through a symlink inside a named directory - ${suffix}`, symlinkTestOptions, async () => {
		const target = createOutsideDirectory('target');
		fs.writeFileSync(path.join(target, 'keep.txt'), '');
		fs.writeFileSync(path.join(target, 'other.txt'), '');
		createFiles(['dist/keep.txt']);
		fs.symlinkSync(target, path.join(temporaryPath, 'dist/link'), 'dir');

		await run(['dist', '!**/keep.txt'], {cwd: temporaryPath, followSymbolicLinks: true, force: true});

		assert.ok(fs.existsSync(path.join(target, 'other.txt')));
		assert.ok(fs.existsSync(path.join(target, 'keep.txt')));
	});

	test(`a symlink loop inside a named directory does not stop the deletion - ${suffix}`, symlinkTestOptions, async () => {
		const loop = createSymlinkLoop();
		createFiles(['loop/keep', 'loop/other']);

		await run(['loop', '!loop/keep'], {cwd: temporaryPath});

		exists(['loop/keep']);
		notExists(['loop/other', 'loop/a', 'loop/b']);
		assert.ok(fs.existsSync(loop));
	});

	// A trailing separator restricts the pattern to directories.
	test(`a trailing separator matches only directories - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, 'public/a'), {recursive: true});
		fs.mkdirSync(path.join(temporaryPath, 'public/b'), {recursive: true});
		fs.writeFileSync(path.join(temporaryPath, 'public/file.txt'), '');

		const removed = await run('public/*/', {cwd: temporaryPath});

		assert.deepEqual(removed, [path.join(temporaryPath, 'public/a'), path.join(temporaryPath, 'public/b')]);
		exists(['public/file.txt']);
	});

	test(`dot: false leaves dot files alone and dot: true includes them - ${suffix}`, async () => {
		const withoutDot = await run('*', {cwd: temporaryPath, dryRun: true});
		assert.deepEqual(withoutDot.map(file => path.basename(file)), ['1.tmp', '2.tmp', '3.tmp', '4.tmp']);

		const withDot = await run('*', {cwd: temporaryPath, dot: true, dryRun: true});
		assert.deepEqual(withDot.map(file => path.basename(file)), ['.dot.tmp', '1.tmp', '2.tmp', '3.tmp', '4.tmp']);
	});

	// A pattern of nothing but negations matches everything else, dot files
	// included, and is what the readme documents.
	test(`a pattern of nothing but negations matches everything else - ${suffix}`, async () => {
		const removed = await run(['!1.tmp'], {cwd: temporaryPath});

		assert.deepEqual(removed.map(file => path.basename(file)), ['2.tmp', '3.tmp', '4.tmp']);
		exists(['1.tmp', '.dot.tmp']);
	});

	test(`expandNegationOnlyPatterns: false makes a negation-only pattern match nothing - ${suffix}`, async () => {
		const removed = await run(['!1.tmp'], {cwd: temporaryPath, expandNegationOnlyPatterns: false});

		assert.deepEqual(removed, []);
		exists(fixtures);
	});

	// A pattern is a glob, so a filename containing a metacharacter has to escape
	// it. Parentheses are the easy one to trip over, and they make the pattern
	// match nothing at all rather than the file that was meant.
	test(`a filename with parentheses matches nothing until it is escaped - ${suffix}`, async () => {
		const name = 'report (1).pdf';
		fs.writeFileSync(path.join(temporaryPath, name), '');

		assert.deepEqual(await run(name, {cwd: temporaryPath, dryRun: true}), []);

		const removed = await run('report [(]1[)].pdf', {cwd: temporaryPath});

		assert.deepEqual(removed, [path.join(temporaryPath, name)]);
		notExists([name]);
	});

	// A directory whose name looks like a character range fails the same silent
	// way a parenthesised name does. Reported in sindresorhus/del#107.
	test(`a directory named like a character range matches nothing until it is escaped - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, '[test-abc]'), {recursive: true});
		fs.writeFileSync(path.join(temporaryPath, '[test-abc]', 'inner.txt'), '');

		assert.deepEqual(await run('[test-abc]', {cwd: temporaryPath, dryRun: true}), []);

		const removed = await run('[[]test-abc[]]', {cwd: temporaryPath});

		assert.deepEqual(removed, [path.join(temporaryPath, '[test-abc]')]);
		notExists(['[test-abc]', '[test-abc]/inner.txt']);
	});

	test(`an undefined option does not restore the globby default - ${suffix}`, symlinkTestOptions, async () => {
		undefinedDefaultFixture();

		const relative = async (testCase, value) => {
			const [name, pattern] = testCase;
			const removed = await run(pattern, undefinedDefaultOptions(name, value));
			return removed.map(file => path.relative(temporaryPath, file));
		};

		const forEach = value => Promise.all(undefinedDefaultCases.map(testCase => relative(testCase, value)));

		assertUndefinedKeepsDelDefault(
			await forEach(undefined),
			await forEach(false),
			await forEach(true),
		);
	});

	// These two only do anything on Windows. The paths come from
	// `path.resolve`, which produces no backslashes elsewhere, so off Windows
	// they reduce to "an absolute path comes back". The conversion itself is
	// covered on any platform by the `withPlatform` tests below.
	test(String.raw`windows can pass absolute paths with "\" - ${suffix}`, async () => {
		const filePath = path.resolve(temporaryPath, '1.tmp');

		const removeFiles = await run([filePath], {cwd: temporaryPath, dryRun: true});

		assert.deepEqual(removeFiles, [filePath]);
	});

	test(String.raw`windows can pass relative paths with "\" - ${suffix}`, async () => {
		const nestedFile = path.resolve(temporaryPath, 'a/b/c/nested.js');
		fs.mkdirSync(nestedFile, {recursive: true});

		const removeFiles = await run([nestedFile], {cwd: temporaryPath, dryRun: true});

		assert.deepEqual(removeFiles, [nestedFile]);
	});

	test(String.raw`negated pattern with "\" is converted on Windows - ${suffix}`, async () => {
		const patterns = createNegationFixture();

		const removed = await withPlatform('win32', async () => run(patterns, {cwd: temporaryPath}));

		assert.deepEqual(removed, [path.join(temporaryPath, 'temp', 'drop.js')]);
		notExists(['temp/drop.js']);
		exists(['temp/keep.js']);
	});

	test(`negated pattern is left alone off Windows - ${suffix}`, async () => {
		// Off Windows a backslash escapes the next character, so `temp\*.js` looks
		// for a literal `*` and matches nothing. Reaching fast-globby untouched is
		// what keeps that the case.
		const patterns = createNegationFixture();

		const removed = await withPlatform('linux', async () => run(patterns, {cwd: temporaryPath, dryRun: true}));

		assert.deepEqual(removed, []);
		exists(['temp/keep.js', 'temp/drop.js']);
	});

	// The paths are sorted deepest first, so a path outside `cwd` is reached last
	// and everything inside it is already gone by the time the guard notices. The
	// whole batch has to be checked before anything is deleted.
	test(`deletes nothing when a matched path is outside cwd - ${suffix}`, async () => {
		const outsidePattern = createOutsideMarker();

		await assertRejects(() => run(['*', outsidePattern], {cwd: temporaryPath}), {
			message: cannotDeleteOutsideCwdMessage,
		});

		exists(fixtures);

		// In-flight deletions keep running after the rejection.
		await new Promise(resolve => {
			setTimeout(resolve, 100);
		});

		exists(fixtures);
	});

	test(`cannot delete files outside cwd through a symlink - ${suffix}`, symlinkTestOptions, async () => {
		const outsideFile = createSymlinkToOutside('escape');

		await assertRejects(() => run('a/escape/**', {cwd: temporaryPath}), {
			message: cannotDeleteOutsideCwdMessage,
		});

		assert.ok(fs.existsSync(outsideFile));
	});

	test(`cannot delete files outside cwd through a followed symlink - ${suffix}`, symlinkTestOptions, async () => {
		const outsideFile = createSymlinkToOutside('escape');

		await assertRejects(() => run('a/**', {cwd: temporaryPath, followSymbolicLinks: true}), {
			message: cannotDeleteOutsideCwdMessage,
		});

		assert.ok(fs.existsSync(outsideFile));
	});

	test(`can delete files outside cwd through a symlink with force: true - ${suffix}`, symlinkTestOptions, async () => {
		const outsideFile = createSymlinkToOutside('escape');

		const removed = await run('a/escape/**', {cwd: temporaryPath, force: true});

		assert.deepEqual(removed, [path.join(temporaryPath, 'a/escape/secret')]);
		assert.ok(!fs.existsSync(outsideFile));
	});

	test(`deletes a symlink loop - ${suffix}`, symlinkTestOptions, async () => {
		const loop = createSymlinkLoop();

		const removed = await run('loop/*', {cwd: temporaryPath});

		assert.deepEqual(removed, [path.join(loop, 'a'), path.join(loop, 'b')]);
		notExists(['loop/a', 'loop/b']);
	});

	// A symlink is unlinked, never followed, so it can be deleted even though it
	// points outside. This is the shape a `node_modules` full of links has.
	test(`deletes a symlink that points outside cwd - ${suffix}`, symlinkTestOptions, async () => {
		const target = createOutsideDirectory('package');
		fs.writeFileSync(path.join(target, 'index.js'), '');
		fs.symlinkSync(target, path.join(temporaryPath, 'linked'), 'dir');

		const removed = await run('linked', {cwd: temporaryPath});

		assert.deepEqual(removed, [path.join(temporaryPath, 'linked')]);
		notExists(['linked']);
		// Only the link is gone, never what it pointed at.
		assert.ok(fs.existsSync(path.join(target, 'index.js')));
	});

	// The same, for a link that points at the working directory, which unlinking
	// cannot possibly take down.
	test(`deletes a symlink that points at the working directory - ${suffix}`, symlinkTestOptions, async () => {
		fs.symlinkSync(temporaryPath, path.join(temporaryPath, 'alias'), 'dir');
		process.chdir(temporaryPath);

		const removed = await run('alias', {cwd: temporaryPath});

		assert.deepEqual(removed, [path.join(temporaryPath, 'alias')]);
		notExists(['alias']);
		exists(fixtures);
	});

	// A pnpm or Yarn workspace, where every `node_modules` entry is a link out to
	// a shared store. Deleting it must not refuse, and must not follow the links.
	test(`deletes a project whose node_modules are symlinks - ${suffix}`, symlinkTestOptions, async () => {
		const store = createOutsideDirectory('store');
		fs.mkdirSync(path.join(store, 'lodash'), {recursive: true});
		fs.writeFileSync(path.join(store, 'lodash', 'index.js'), '');

		fs.mkdirSync(path.join(temporaryPath, 'node_modules'), {recursive: true});
		fs.symlinkSync(path.join(store, 'lodash'), path.join(temporaryPath, 'node_modules', 'lodash'), 'dir');
		fs.writeFileSync(path.join(temporaryPath, 'app.js'), '');

		const removed = await run('**/*', {cwd: temporaryPath, dot: true});

		assert.deepEqual(relativePaths(removed), [
			'.dot.tmp',
			'1.tmp',
			'2.tmp',
			'3.tmp',
			'4.tmp',
			'app.js',
			'node_modules',
			'node_modules/lodash',
		]);
		notExists(['node_modules', 'node_modules/lodash']);
		assert.ok(fs.existsSync(path.join(store, 'lodash', 'index.js')));
	});

	// Exempting a symlink from the real path check must not let a link that
	// physically lives outside `cwd` be removed, which this path only reaches by
	// walking through another symlink.
	test(`cannot unlink a symlink that lives outside cwd - ${suffix}`, symlinkTestOptions, async () => {
		const shared = createSymlinkedFile('precious.txt');

		fs.mkdirSync(path.join(temporaryPath, 'cache'), {recursive: true});
		fs.symlinkSync(path.dirname(shared), path.join(temporaryPath, 'cache', 'shared'), 'dir');
		fs.symlinkSync(shared, path.join(temporaryPath, 'cache', 'shared', 'link-in-shared'));

		await assertRejects(() => run('cache/shared/link-in-shared', {cwd: temporaryPath}), {
			message: cannotDeleteOutsideCwdMessage,
		});

		assert.ok(fs.existsSync(path.join(temporaryPath, 'cache', 'shared', 'link-in-shared')));
		assert.ok(fs.existsSync(shared));
	});

	// `path.resolve` keeps the spelling the caller used for `cwd`, while
	// `process.cwd()` is always a realpath. When `cwd` is reached through a symlink
	// the two never compare equal, which used to walk straight past the guard and
	// delete the working directory without `force`.
	test(`cannot delete the working directory through a symlinked cwd - ${suffix}`, symlinkTestOptions, async () => {
		const home = createOutsideDirectory('home');
		fs.mkdirSync(path.join(home, 'sub'), {recursive: true});
		fs.symlinkSync(home, path.join(home, 'alias'), 'dir');

		process.chdir(path.join(home, 'sub'));

		await assertRejects(() => run(['sub'], {cwd: path.join(home, 'alias')}), {
			message: cannotDeleteCwdMessage,
		});

		assert.ok(fs.existsSync(path.join(home, 'sub')));
	});

	// `gitignore` protects what `.gitignore` rules out, and nothing else, so a
	// broad pattern with `dot: true` still takes the repository metadata with it.
	test(`gitignore: true skips ignored files but not .git - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, '.git/objects/ab'), {recursive: true});
		fs.writeFileSync(path.join(temporaryPath, '.git/HEAD'), '');
		fs.writeFileSync(path.join(temporaryPath, '.git/objects/ab/cdef'), '');
		fs.writeFileSync(path.join(temporaryPath, 'app.js'), '');
		fs.writeFileSync(path.join(temporaryPath, 'debug.log'), '');
		fs.writeFileSync(path.join(temporaryPath, '.gitignore'), '*.log\n');

		const removed = await run('**/*', {
			cwd: temporaryPath,
			gitignore: true,
			dot: true,
			dryRun: true,
		});
		const relative = new Set(relativePaths(removed));

		assert.ok(!relative.has('debug.log'));
		assert.ok(relative.has('.git'));
		assert.ok(relative.has('.git/HEAD'));
	});

	test(`ignore keeps .git out of a gitignore: true glob - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, '.git'), {recursive: true});
		fs.writeFileSync(path.join(temporaryPath, '.git/HEAD'), '');
		fs.writeFileSync(path.join(temporaryPath, 'app.js'), '');

		const removed = await run('**/*', {
			cwd: temporaryPath,
			gitignore: true,
			dot: true,
			ignore: ['**/.git'],
			dryRun: true,
		});

		const relative = new Set(relativePaths(removed));

		assert.ok(relative.has('app.js'));
		assert.ok([...relative].every(file => !file.startsWith('.git')));
	});
}

// The two entry points are meant to be twins even where the options differ, and
// only the async side has a `concurrency` to set.
test('concurrency: 1 removes what a symlink is the only route to - async', symlinkTestOptions, async () => {
	const target = createSymlinkAlias();

	const removed = await deleteAsync('**/link', {...symlinkAliasOptions(), concurrency: 1});

	assert.deepEqual(relativePaths(removed), [
		'link',
		'link/deep',
		'link/deep/x.js',
	]);
	assert.deepEqual(fs.readdirSync(target), []);
});

// A failed deletion must not reject while other deletions are still running, or
// the caller sees the promise settle with files still being removed. `slow` is
// still being deleted when `locked/file` fails.
//
// Async only, as the sync deletions run one after another, so nothing is in
// flight when one of them throws.
test('rejects only after the deletions in flight have settled - async', readOnlyDirectoryTestOptions, async () => {
	createSlowDirectory();

	await withLockedFile(async () => {
		await assert.rejects(deleteAsync(['locked/file', 'slow'], {cwd: temporaryPath}), {code: 'EACCES'});
		notExists(['slow']);
	});
});

// The same holds for a throwing `onProgress`. `fast` is deleted, and reported,
// while `slow` is still being deleted.
test('rejects for a throwing onProgress only after the deletions in flight have settled - async', async () => {
	createSlowDirectory();

	fs.writeFileSync(path.join(temporaryPath, 'fast'), '');

	const error = new Error('onProgress failed');

	await assert.rejects(deleteAsync(['slow', 'fast'], {
		cwd: temporaryPath,
		onProgress() {
			throw error;
		},
	}), error);

	notExists(['slow', 'fast']);
});

// The deletions are limited to 256 at a time by default, so a failure keeps the
// rest from starting. `locked/file` comes first, and the 255 paths after it start
// alongside it. A deletion that finishes before `locked/file` fails can still
// start one more path, so only the path furthest from that is checked to stay.
test('stops at the first failed deletion with the default concurrency - async', readOnlyDirectoryTestOptions, async () => {
	const files = Array.from({length: 300}, (_, index) => `file${String(index).padStart(3, '0')}`);
	for (const file of files) {
		fs.writeFileSync(path.join(temporaryPath, file), '');
	}

	await withLockedFile(async () => {
		await assert.rejects(deleteAsync(['locked/file', 'file*'], {cwd: temporaryPath}), {code: 'EACCES'});
		notExists(files.slice(-255));
		exists([files[0]]);
	});
});

test('concurrency: 1 removes what a symlink is the only route to - sync', symlinkTestOptions, () => {
	const target = createSymlinkAlias();

	const removed = deleteSync('**/link', symlinkAliasOptions());

	assert.deepEqual(relativePaths(removed), [
		'link',
		'link/deep',
		'link/deep/x.js',
	]);
	assert.deepEqual(fs.readdirSync(target), []);
});

// The batch is ordered so that a directory is removed after the paths inside it,
// which is what stops a child being reported deleted and then left on disk. The
// sort is `localeCompare`-based, so names that differ only by punctuation are
// the case most likely to break it, and they are all siblings here: `a`, `a-b`,
// `a b` and `ab` each need their own contents gone first, not each other's.
//
// Sync only, as the async deletions are concurrent and the order they finish in
// is not the order they were given.
test('deletes every path before the directory that holds it - sync', () => {
	const families = ['a', 'a-b', 'a b', 'ab'];

	for (const family of families) {
		fs.mkdirSync(path.join(temporaryPath, family, 'inner'), {recursive: true});
	}

	const order = [];
	deleteSync('**/*', {
		cwd: temporaryPath,
		onProgress(event) {
			order.push(event.path);
		},
	});

	const position = new Map(order.map((file, index) => [file, index]));

	for (const family of families) {
		const child = path.join(temporaryPath, family, 'inner');
		const parent = path.join(temporaryPath, family);

		assert.ok(position.get(child) < position.get(parent), `${family}/inner must go before ${family}`);
	}
});

// The one place a single test covers both entry points, as comparing their
// output on a nested tree with negations, a dot file and a duplicate-able path
// covers sorting, deduplication and the globby options in one go. They are meant
// to be behavioural twins and had already drifted once.
test('deleteAsync and deleteSync return the same paths', async () => {
	fs.mkdirSync(path.join(temporaryPath, 'a/b/c'), {recursive: true});
	fs.writeFileSync(path.join(temporaryPath, 'a/b/c/nested.js'), '');

	const patterns = ['**/*', '!2.tmp', '!a/b/c/nested.js'];
	const options = {cwd: temporaryPath, dot: true, dryRun: true};

	const fromAsync = await deleteAsync(patterns, options);
	const fromSync = deleteSync(patterns, options);

	assert.deepEqual(fromAsync, fromSync);
	assert.deepEqual(relativePaths(fromAsync), [
		'.dot.tmp',
		'1.tmp',
		'3.tmp',
		'4.tmp',
	]);
});

/* eslint-enable node-test/require-assertion, node-test/no-conditional-assertion, node-test/no-process-chdir-in-test -- Re-enabled for anything added below this file. */

/* eslint-enable max-lines */
