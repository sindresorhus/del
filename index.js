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
	if (isPathCwd(file)) {
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
function isRealPathInside(file, cwd) {
	try {
		return isPathInside(fs.realpathSync(file), fs.realpathSync(cwd));
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

export async function deleteAsync(patterns, {force, dryRun, cwd = process.cwd(), onProgress = () => {}, ...options} = {}) {
	options = {
		expandDirectories: false,
		onlyFiles: false,
		followSymbolicLinks: false,
		cwd,
		...options,
	};

	patterns = normalizePatterns(patterns);

	const paths = await globby(patterns, options);
	const files = paths.toSorted((a, b) => b.localeCompare(a));

	if (files.length === 0) {
		onProgress({
			totalCount: 0,
			deletedCount: 0,
			percent: 1,
		});
	}

	let deletedCount = 0;

	const mapper = async file => {
		file = path.resolve(cwd, file);

		if (!force) {
			safeCheck(file, cwd);
		}

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

	const files = globbySync(patterns, options)
		.toSorted((a, b) => b.localeCompare(a));

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
		file = path.resolve(cwd, file);

		if (!force) {
			safeCheck(file, cwd);
		}

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
