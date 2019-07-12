'use strict';
const {promisify} = require('util');
const path = require('path');
const globby = require('globby');
const gracefulFs = require('graceful-fs');
const isPathCwd = require('is-path-cwd');
const isPathInside = require('is-path-inside');
const rimraf = require('rimraf');
const pMap = require('p-map');

const rimrafP = promisify(rimraf);

function safeCheck(file, cwd) {
	if (isPathCwd(file)) {
		throw new Error('Cannot delete the current working directory. Can be overridden with the `force` option.');
	}

	if (!isPathInside(file, cwd)) {
		throw new Error('Cannot delete files/directories outside the current working directory. Can be overridden with the `force` option.');
	}
}

function sortOptions(options) {
	let {
		// Shared options
		cwd = process.cwd(),

		// Del options
		force,
		dryRun,

		// PMap options
		concurrency = Infinity,

		// Rimraf options
		maxBusyTries,
		emfileWait,
		unlink = gracefulFs.unlink,
		unlinkSync = gracefulFs.unlinkSync,
		chmod = gracefulFs.chmod,
		chmodSync = gracefulFs.chmodSync,
		stat = gracefulFs.stat,
		statSync = gracefulFs.statSync,
		lstat = gracefulFs.lstat,
		lstatSync = gracefulFs.lstatSync,
		rmdir = gracefulFs.rmdir,
		rmdirSync = gracefulFs.rmdirSync,
		readdir = gracefulFs.readdir,
		readdirSync = gracefulFs.readdirSync,

		// Globby options
		...globbyOptions
	} = options;

	const delOptions = {
		cwd,
		force,
		dryRun
	};

	const pMapOptions = {
		concurrency
	};

	const rimrafOptions = {
		maxBusyTries,
		emfileWait,
		unlink,
		unlinkSync,
		chmod,
		chmodSync,
		stat,
		statSync,
		lstat,
		lstatSync,
		rmdir,
		rmdirSync,
		readdir,
		readdirSync,
		glob: false
	};

	globbyOptions = {
		expandDirectories: false,
		onlyFiles: false,
		followSymbolicLinks: false,
		cwd,
		...globbyOptions
	};

	return {delOptions, rimrafOptions, globbyOptions, pMapOptions};
}

module.exports = async (patterns, options = {}) => {
	const {delOptions, globbyOptions, rimrafOptions, pMapOptions} = sortOptions(options);

	const files = (await globby(patterns, globbyOptions))
		.sort((a, b) => b.localeCompare(a));

	const mapper = async file => {
		file = path.resolve(delOptions.cwd, file);

		if (!delOptions.force) {
			safeCheck(file, delOptions.cwd);
		}

		if (!delOptions.dryRun) {
			await rimrafP(file, rimrafOptions);
		}

		return file;
	};

	return pMap(files, mapper, pMapOptions);
};

module.exports.sync = (patterns, options = {}) => {
	const {delOptions, globbyOptions, rimrafOptions} = sortOptions(options);

	const files = globby.sync(patterns, globbyOptions)
		.sort((a, b) => b.localeCompare(a));

	return files.map(file => {
		file = path.resolve(delOptions.cwd, file);

		if (!delOptions.force) {
			safeCheck(file, delOptions.cwd);
		}

		if (!delOptions.dryRun) {
			rimraf.sync(file, rimrafOptions);
		}

		return file;
	});
};
