'use strict';
const { promisify } = require('util');
const path = require('path');

const globby = require('globby');
const isGlob = require('is-glob');
const slash = require('slash');
const gracefulFs = require('graceful-fs');
const isPathCwd = require('is-path-cwd');
const isPathInside = require('is-path-inside');
const rimraf = require('rimraf');
const pMap = require('p-map');

const rimrafP = promisify(rimraf);

const rimrafOptions = {
	glob: false,
	unlink: gracefulFs.unlink,
	unlinkSync: gracefulFs.unlinkSync,
	chmod: gracefulFs.chmod,
	chmodSync: gracefulFs.chmodSync,
	stat: gracefulFs.stat,
	statSync: gracefulFs.statSync,
	lstat: gracefulFs.lstat,
	lstatSync: gracefulFs.lstatSync,
	rmdir: gracefulFs.rmdir,
	rmdirSync: gracefulFs.rmdirSync,
	readdir: gracefulFs.readdir,
	readdirSync: gracefulFs.readdirSync
};

function safeCheck(file, cwd) {
	if (isPathCwd(file)) {
		throw new Error(
			'Cannot delete the current working directory. Can be overridden with the `force` option.'
		);
	}

	if (!isPathInside(file, cwd)) {
		throw new Error(
			'Cannot delete files/directories outside the current working directory. Can be overridden with the `force` option.'
		);
	}
}

function normalizePatterns(patterns) {
	patterns = Array.isArray(patterns) ? patterns : [patterns];

	patterns = patterns.map((pattern) => {
		if (process.platform === 'win32' && isGlob(pattern) === false) {
			return slash(pattern);
		}

		return pattern;
	});

	return patterns;
}

/**
 * @typedef {import('globby').GlobbyOptions} GlobbyOptions //  Globby 13.1.1 version @ typedef {import('globby').Options} GlobbyOptions
 * @typedef delOptionPropertys
 * @property {boolean} [force] default false
 * @property {boolean} [dryRun] default false
 * @property {string} [cwd] default false
 * @typedef {delOptionPropertys & GlobbyOptions} delOptions
 * @typedef {string | readonly string[]} patterns
 * @typedef {typeof delAsync & { sync: typeof delSync }} deprecatedCjsCompatModuleObject
 */
const normalizeDelOptions = (/** @type {delOptions} */ delOptions) => {
	const { force = false, dryRun = false, cwd = process.cwd(), ...inputGlobbyOptions } = delOptions;

	/** @type {GlobbyOptions} */
	const globbyOptions = {
		expandDirectories: false,
		onlyFiles: false,
		followSymbolicLinks: false,
		cwd,
		...inputGlobbyOptions
	};
	return { force, dryRun, cwd, globbyOptions };
};

const delAsync = async (patterns, delOptions) => {
	const { force, dryRun, cwd, globbyOptions: options } = normalizeDelOptions(delOptions);

	patterns = normalizePatterns(patterns);

	const files = (await globby(patterns, options)).sort((a, b) => b.localeCompare(a));

	const mapper = async (file) => {
		file = path.resolve(cwd, file);

		if (!force) {
			safeCheck(file, cwd);
		}

		if (!dryRun) {
			await rimrafP(file, rimrafOptions);
		}

		return file;
	};

	const removedFiles = await pMap(files, mapper, options);

	removedFiles.sort((a, b) => a.localeCompare(b));

	return removedFiles;
};

const delSync = (patterns, delOptions) => {
	const { force, dryRun, cwd, globbyOptions: options } = normalizeDelOptions(delOptions);

	patterns = normalizePatterns(patterns);

	const files = globby.sync(patterns, options).sort((a, b) => b.localeCompare(a));

	const removedFiles = files.map((file) => {
		file = path.resolve(cwd, file);

		if (!force) {
			safeCheck(file, cwd);
		}

		if (!dryRun) {
			rimraf.sync(file, rimrafOptions);
		}

		return file;
	});

	removedFiles.sort((a, b) => a.localeCompare(b));

	return removedFiles;
};

exports.delAsync = delAsync;
exports.delSync = delSync;

module.exports = Object.assign(() => {}, delAsync, exports, { sync: delSync });
