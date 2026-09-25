import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {globby, globbySync} from 'globby';
import isGlob from 'is-glob';
import isPathCwd from 'is-path-cwd';
import isPathInside from 'is-path-inside';
import pMap from 'p-map';
import slash from 'slash';
import {PresentableError} from 'presentable-error';

function safeCheck(file, cwd) {
	// The `cwd` option can point somewhere else than the process working
	// directory, and deleting it is the same mistake either way.
	if (isPathCwd(file) || path.relative(cwd, file) === '') {
		throw new PresentableError('Cannot delete the current working directory. Can be overridden with the `force` option.');
	}

	// A symlink inside the working directory can point anywhere, so the real
	// paths are checked as well and not just the literal ones.
	if (!isPathInside(file, cwd) || !isRealPathInside(file, cwd)) {
		throw new PresentableError('Cannot delete files/directories outside the current working directory. Can be overridden with the `force` option.');
	}
}

// A path that cannot be resolved is treated as inside, as `fs.rm` would delete
// nothing for a path that is already gone and would only remove the link itself
// for a symlink loop.
//
// A symlink is unlinked rather than followed, so where it points does not
// matter, only where it lives. Anything reached *through* a link is a real
// path, which is the case that has to be caught.
function isRealPathInside(file, cwd) {
	try {
		return fs.lstatSync(file).isSymbolicLink() || isPathInside(fs.realpathSync(file), fs.realpathSync(cwd));
	} catch {
		return true;
	}
}

function normalizePatterns(patterns) {
	patterns = Array.isArray(patterns) ? patterns : [patterns];

	return patterns.map(pattern => {
		if (process.platform !== 'win32') {
			return pattern;
		}

		// `is-glob` reports a glob for anything starting with `!`, even when the
		// rest is a plain path, so the negation is set aside for the test and put
		// back afterwards.
		const negation = pattern.startsWith('!') ? '!' : '';
		const barePattern = negation === '' ? pattern : pattern.slice(1);

		return isGlob(barePattern) ? pattern : negation + slash(barePattern);
	});
}

// Sorting descending guarantees children are deleted before their parents, as a
// child path is a longer version of its parent's path.
//
// The paths are resolved and deduplicated here rather than while deleting,
// because globby deduplicates on the pattern text, which keeps a trailing
// separator, so `sub` and `sub/` come back as two entries for the same file.
function resolveFiles(patterns, cwd) {
	const files = new Set(patterns.map(pattern => path.resolve(cwd, pattern)));
	return [...files].toSorted((a, b) => b.localeCompare(a));
}

// Every path is checked up front, so that a path outside the working directory
// is refused before anything is deleted rather than after. The paths are sorted
// with the parents last, so checking them one at a time while deleting would
// report the refusal only once the rest of the working directory was gone.
function safeCheckAll(files, cwd) {
	for (const file of files) {
		safeCheck(file, cwd);
	}
}

export async function deleteAsync(patterns, {force, dryRun, cwd = process.cwd(), onProgress = () => {}, ...options} = {}) {
	options = {
		expandDirectories: false,
		onlyFiles: false,
		followSymbolicLinks: false,
		cwd,
		...options,
	};

	patterns = normalizePatterns(patterns);

	const files = resolveFiles(await globby(patterns, options), cwd);

	if (!force) {
		safeCheckAll(files, cwd);
	}

	if (files.length === 0) {
		onProgress({
			totalCount: 0,
			deletedCount: 0,
			percent: 1,
		});
	}

	let deletedCount = 0;

	const mapper = async file => {
		if (!dryRun) {
			await fsPromises.rm(file, {recursive: true, force: true});
		}

		deletedCount += 1;

		onProgress({
			totalCount: files.length,
			deletedCount,
			percent: deletedCount / files.length,
			path: file,
		});

		return file;
	};

	const removedFiles = await pMap(files, mapper, options);

	return removedFiles.toSorted((a, b) => a.localeCompare(b));
}

export function deleteSync(patterns, {force, dryRun, cwd = process.cwd(), onProgress = () => {}, ...options} = {}) {
	options = {
		expandDirectories: false,
		onlyFiles: false,
		followSymbolicLinks: false,
		cwd,
		...options,
	};

	patterns = normalizePatterns(patterns);

	const files = resolveFiles(globbySync(patterns, options), cwd);

	if (!force) {
		safeCheckAll(files, cwd);
	}

	if (files.length === 0) {
		onProgress({
			totalCount: 0,
			deletedCount: 0,
			percent: 1,
		});
	}

	// `deletedCount` is derived from the position in the sorted list rather than
	// a counter, as the deletions here are strictly sequential.
	const removedFiles = files.map((file, index) => {
		if (!dryRun) {
			fs.rmSync(file, {recursive: true, force: true});
		}

		const deletedCount = index + 1;

		onProgress({
			totalCount: files.length,
			deletedCount,
			percent: deletedCount / files.length,
			path: file,
		});

		return file;
	});

	return removedFiles.toSorted((a, b) => a.localeCompare(b));
}
