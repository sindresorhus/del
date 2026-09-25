import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import slash from 'slash';
import {deleteAsync, deleteSync} from './index.js';

/* eslint-disable node-test/require-assertion, node-test/no-conditional-assertion, node-test/no-process-chdir-in-test -- False positives here: the assertions live in the `exists`/`notExists` helpers and in a loop that runs a fixed number of times, so the linter cannot see them at the call site, and the working-directory guard can only be tested by changing the working directory. */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const processCwd = process.cwd();

const cannotDeleteCwdMessage = 'Cannot delete the current working directory. Can be overridden with the `force` option.';
const cannotDeleteOutsideCwdMessage = 'Cannot delete files/directories outside the current working directory. Can be overridden with the `force` option.';

// Symlink creation needs elevated privileges on Windows.
const symlinkTestOptions = process.platform === 'win32'
	? {skip: 'Creating symlinks requires elevated privileges on Windows'}
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

// The expectations below are written the way a pattern is written, with forward
// slashes, so the separator is normalised: `path.relative` gives `a\b` on
// Windows and nothing below would ever match.
function relativePaths(files) {
	return files.map(file => slash(path.relative(temporaryPath, file)));
}

for (const {suffix, run, assertRejects} of entryPoints) {
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
	// `concurrency: 1` because otherwise the async side starts every deletion at
	// once and there is nothing left for the callback to take away.
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

	// Naming a directory removes it in one go, so a negation cannot rescue a file
	// inside it. This is the opposite of what the readme used to claim.
	test(`naming a directory deletes its contents, negation notwithstanding - ${suffix}`, async () => {
		fs.mkdirSync(path.join(temporaryPath, 'assets'), {recursive: true});
		fs.writeFileSync(path.join(temporaryPath, 'assets', 'goat.png'), '');

		await run(['assets', '!assets/goat.png'], {cwd: temporaryPath});

		notExists(['assets', 'assets/goat.png']);
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
		'a',
		'a/b',
		'a/b/c',
	]);
});

/* eslint-enable node-test/require-assertion, node-test/no-conditional-assertion, node-test/no-process-chdir-in-test -- Re-enabled for anything added below this file. */
