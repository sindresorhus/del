import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
	globby,
	globbySync,
	generateGlobTasks,
	generateGlobTasksSync,
	convertPathToPattern,
} from 'globby';
import isGlob from 'is-glob';
import isPathCwd from 'is-path-cwd';
import isPathInside from 'is-path-inside';
import pMap, {pMapSkip} from 'p-map';
import slash from 'slash';
import {PresentableError} from 'presentable-error';

// A symlink is unlinked rather than followed, so what is removed is the link
// itself and never what it points at. `fs.rm` follows a link only when it is
// named with a trailing separator, which `resolveFiles` strips.
//
// A path that cannot be inspected is not a symlink, as `fs.rm` would delete
// nothing for a path that is already gone.
function isSymbolicLink(file) {
	try {
		return fs.lstatSync(file).isSymbolicLink();
	} catch {
		return false;
	}
}

// A symlink inside the working directory can reach anywhere, so the real paths
// are checked too, not just the literal ones.
function safeCheck(file, cwd, realCwd) {
	const realFile = realpathOrSelf(file);
	const isLink = isSymbolicLink(file);

	// The `cwd` option can point somewhere else than the process working
	// directory, and deleting it, or anything that contains it, is the same
	// mistake either way, so all of it is refused.
	//
	// Every comparison is made on real paths too, because `file` keeps the
	// spelling the caller used while `process.cwd()` and a resolved `cwd` never
	// do: `/var` and `/private/var` name the same directory and only the latter
	// is what Node reports, so a symlinked `cwd` otherwise walks straight past
	// this check. A symlink is left out, as unlinking one removes the link and
	// nothing else, and `process.cwd()` is always a realpath, so a link is never
	// it.
	//
	// The first term is the only one that is redundant: the containment check
	// below refuses the `cwd` either way, since `isPathInside` is false for a
	// path equal to its parent. It is here to pick the message, which is the one
	// thing a caller can act on when they name their own working directory.
	const removesWorkingDirectory = path.relative(cwd, file) === ''
		|| (!isLink && (realFile === realCwd || isPathCwd(realFile) || isPathInside(process.cwd(), realFile)));

	if (removesWorkingDirectory) {
		throw new PresentableError('Cannot delete the current working directory. Can be overridden with the `force` option.');
	}

	// A link is where it sits, not where it points, so the parent is what is
	// checked, and it may itself have arrived through a link.
	const location = isLink ? realpathOrSelf(path.dirname(file)) : realFile;
	const insideRealCwd = location === realCwd || isPathInside(location, realCwd);

	if (!insideRealCwd || !isPathInside(file, cwd)) {
		throw new PresentableError('Cannot delete files/directories outside the current working directory. Can be overridden with the `force` option.');
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
// child path is a longer version of its parent's path. It also strips any
// trailing separator, which is what keeps a symlink from being followed.
//
// The paths are resolved and deduplicated here rather than while deleting,
// because globby deduplicates on the pattern text, which keeps a trailing
// separator, so `sub` and `sub/` come back as two entries for the same file.
function resolveFiles(matches, cwd) {
	const files = new Set(matches.map(match => path.resolve(cwd, match)));
	return [...files].toSorted((a, b) => b.localeCompare(a));
}

/*
A directory is deleted with everything inside it, so a path left out on purpose would go with it, whether the patterns reach that path or only name the directory. The two globs returned here look inside the matched directories, with and without the exclusions, and what only the second finds was left out.

It returns nothing without exclusions or matched directories, as there is then nothing to keep. Only the topmost matched directories are looked inside, as they hold the rest. A symlink is never looked inside or through, even with `followSymbolicLinks`, as removing a link only unlinks it, and looking through one would turn what it points at into paths to delete.

Both globs include dot files and directories at any depth, whatever the options say, as deleting a directory removes all of it. Each group of positive patterns is scanned with the exclusions that follow it, so a later positive pattern can bring back a directory and everything inside it. The glob without the exclusions walks what they skip, such as `node_modules`, and skips a directory it cannot read rather than failing, as finding the directory itself is enough to keep what holds it.
*/
function globsInsideMatchedDirectories(patterns, matches, {ignore, gitignore, ignoreFiles, globalGitignore, deep, onlyFiles, onlyDirectories, ...options}) {
	const negations = patterns.filter(pattern => pattern.startsWith('!'));
	const hasExclusions = negations.length > 0 || ignore?.length > 0 || ignoreFiles?.length > 0 || gitignore || globalGitignore;

	if (!hasExclusions) {
		return;
	}

	const directories = new Set(matches.filter(match => match.endsWith('/') && !isSymbolicLink(path.resolve(options.cwd, match))));
	const topmostDirectories = [...directories].filter(directory => !hasParentIn(directory, directories));

	if (topmostDirectories.length === 0) {
		return;
	}

	const insidePatterns = topmostDirectories.map(directory => `${convertPathToPattern(directory)}**`);
	options = {
		...options,
		dot: true,
		onlyFiles: false,
		followSymbolicLinks: false,
		globstar: true,
	};

	return {
		withExclusions: {
			patterns: insidePatterns,
			options: {
				...options,
				ignore,
				gitignore,
				ignoreFiles,
				globalGitignore,
			},
		},
		withoutExclusions: {
			patterns: insidePatterns,
			options: {...options, suppressErrors: true},
		},
	};
}

// The paths are the ones globby returns, with `/` as the separator and a trailing one on a directory.
function hasParentIn(directory, directories) {
	for (let parent = path.posix.dirname(directory.slice(0, -1)); parent !== path.posix.dirname(parent); parent = path.posix.dirname(parent)) {
		if (directories.has(`${parent}/`)) {
			return true;
		}
	}

	return false;
}

/*
Every directory holding an excluded path is kept, and what else is directly inside it is deleted in its place. Such a path holds nothing excluded, or it would be kept too, so it can go with everything inside it.

A path the patterns matched is never excluded, even when a negation matches it too, as a later pattern can bring back what an earlier negation left out.
*/
function keepParentsOfExcluded(matches, inside, insideWithoutExclusions, cwd) {
	const files = matches.map(match => path.resolve(cwd, match));
	const insideFiles = inside.map(match => path.resolve(cwd, match));
	const excluded = new Set(insideWithoutExclusions.map(match => path.resolve(cwd, match))).difference(new Set([...insideFiles, ...files]));
	const kept = new Set();

	for (const file of excluded) {
		// Once a directory is kept, so are all its parents.
		for (let directory = path.dirname(file); !kept.has(directory) && directory !== path.dirname(directory); directory = path.dirname(directory)) {
			kept.add(directory);
		}
	}

	return [...files, ...insideFiles.filter(file => kept.has(path.dirname(file)))].filter(file => !kept.has(file));
}

// Every path is checked up front, so that a path outside the working directory
// is refused before anything is deleted rather than after. The paths are sorted
// with the parents last, so checking them one at a time while deleting would
// report the refusal only once the rest of the working directory was gone.
//
// This is a snapshot rather than a lock, so a tree that changes while `del` runs
// can still be deleted differently than it was checked. The check narrows that
// window, it does not close it.
//
// The real `cwd` is resolved once here rather than per path, as it would
// otherwise be walked again for every single path.
function prepareFiles(matches, {cwd, force, onProgress}) {
	const files = resolveFiles(matches, cwd);

	if (!force) {
		const realCwd = realpathOrSelf(cwd);

		for (const file of files) {
			safeCheck(file, cwd, realCwd);
		}
	}

	if (files.length === 0) {
		onProgress({
			totalCount: 0,
			deletedCount: 0,
			percent: 1,
		});
	}

	return files;
}

// A path that cannot be resolved counts as inside, as `fs.rm` would delete
// nothing for a path that is already gone and would only remove the link itself
// for a symlink loop.
function realpathOrSelf(file) {
	try {
		return fs.realpathSync(file);
	} catch {
		return file;
	}
}

// Globby falls back to its own default for an `undefined` value, so merging
// del's defaults underneath the options would let an explicit `undefined` hand
// the decision back to globby and undo them. A config object spread in from
// elsewhere carries such keys often enough to matter.
function createOptions({expandDirectories, onlyFiles, followSymbolicLinks, ...options}, cwd) {
	return {
		expandDirectories: expandDirectories ?? false,
		onlyFiles: onlyFiles ?? false,
		followSymbolicLinks: followSymbolicLinks ?? false,
		cwd,
		...options,
		/*
		A trailing separator is how a directory is told apart from anything else among the matches.

		Every match is resolved against `cwd` anyway, so `absolute` would only change how the matches are spelled. They must be spelled like the patterns, as the directories are looked inside with the same negations, and a relative negation does not apply to an absolute path.
		*/
		markDirectories: true,
		absolute: false,
	};
}

// With `dryRun` nothing is deleted at all, so `deletedCount` and `path` describe
// what the option would have removed.
function reportProgress(onProgress, totalCount, deletedCount, file) {
	onProgress({
		totalCount,
		deletedCount,
		percent: deletedCount / totalCount,
		path: file,
	});
}

export async function deleteAsync(patterns, {force, dryRun, cwd = process.cwd(), onProgress = () => {}, ...options} = {}) {
	patterns = normalizePatterns(patterns);

	const globOptions = createOptions(options, cwd);
	const globTasks = await generateGlobTasks(patterns, globOptions);
	const taskMatches = await Promise.all(globTasks.map(task => globby(task.patterns, {...task.options, expandDirectories: false})));
	let matches = taskMatches.flat();
	const insideGlobs = globTasks.map((task, index) => globsInsideMatchedDirectories(patterns, taskMatches[index], {...task.options, expandDirectories: false})).filter(Boolean);

	if (insideGlobs.length > 0) {
		const scans = await Promise.all(insideGlobs.map(glob => Promise.all([
			globby(glob.withExclusions.patterns, glob.withExclusions.options),
			globby(glob.withoutExclusions.patterns, glob.withoutExclusions.options),
		])));
		matches = keepParentsOfExcluded(matches, scans.flatMap(([inside]) => inside), scans.flatMap(([, insideWithoutExclusions]) => insideWithoutExclusions), cwd);
	}

	const files = prepareFiles(matches, {cwd, force, onProgress});

	let deletedCount = 0;
	let firstError;

	/*
	A failure is held back until the `fs.rm` calls already running have settled. No new call starts once one has failed, which is where the sync side stops too. A throwing `onProgress` is held back the same way.

	Node can keep deleting a directory's children after its recursive `fs.rm` rejects, so settling the calls does not guarantee those child removals have finished.
	*/
	const mapper = async file => {
		if (firstError) {
			return pMapSkip;
		}

		try {
			if (!dryRun) {
				// Windows can still hold a handle on a directory whose contents are
				// gone, so `rmdir` reports an `EPERM` for a delete that then succeeds.
				// `fs.rm` retries those errors, but only when asked to.
				await fsPromises.rm(file, {recursive: true, force: true, maxRetries: 3});
			}

			deletedCount += 1;

			reportProgress(onProgress, files.length, deletedCount, file);

			return file;
		} catch (error) {
			firstError ??= error;
			return pMapSkip;
		}
	};

	/*
	Node already caps the file system calls in flight at the size of its thread pool, 4 by default, so the limit here only decides how much work waits in line. A small one leaves the pool idle between the steps of each `fs.rm` and is measurably slower, while an unlimited one holds every path in flight at once and starts them all before a failure could stop any. 256 is as fast as unlimited.

	It is set here rather than in `createOptions`, as globby has its own default for the same option.
	*/
	const removedFiles = await pMap(files, mapper, {...options, concurrency: options.concurrency ?? 256});

	if (firstError) {
		throw firstError;
	}

	return removedFiles.toSorted((a, b) => a.localeCompare(b));
}

export function deleteSync(patterns, {force, dryRun, cwd = process.cwd(), onProgress = () => {}, ...options} = {}) {
	patterns = normalizePatterns(patterns);

	const globOptions = createOptions(options, cwd);
	const globTasks = generateGlobTasksSync(patterns, globOptions);
	const taskMatches = globTasks.map(task => globbySync(task.patterns, {...task.options, expandDirectories: false}));
	let matches = taskMatches.flat();
	const insideGlobs = globTasks.map((task, index) => globsInsideMatchedDirectories(patterns, taskMatches[index], {...task.options, expandDirectories: false})).filter(Boolean);

	if (insideGlobs.length > 0) {
		const inside = insideGlobs.flatMap(glob => globbySync(glob.withExclusions.patterns, glob.withExclusions.options));
		const insideWithoutExclusions = insideGlobs.flatMap(glob => globbySync(glob.withoutExclusions.patterns, glob.withoutExclusions.options));
		matches = keepParentsOfExcluded(matches, inside, insideWithoutExclusions, cwd);
	}

	const files = prepareFiles(matches, {cwd, force, onProgress});

	// `deletedCount` is derived from the position in the sorted list rather than
	// a counter, as the deletions here are strictly sequential.
	const removedFiles = files.map((file, index) => {
		if (!dryRun) {
			fs.rmSync(file, {recursive: true, force: true, maxRetries: 3});
		}

		reportProgress(onProgress, files.length, index + 1, file);

		return file;
	});

	return removedFiles.toSorted((a, b) => a.localeCompare(b));
}
