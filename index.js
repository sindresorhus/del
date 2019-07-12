'use strict';
const {promisify} = require('util');
const path = require('path');
const globby = require('globby');
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
		force,
		dryRun,
		cwd = process.cwd(),

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

		...globbyOptions
	} = options;

	const delOptions = {
		cwd,
		force,
		dryRun
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

	return {delOptions, rimrafOptions, globbyOptions};
}

module.exports = async (patterns, options = {}) => {
	const {delOptions, globbyOptions, rimrafOptions} = sortOptions(options);

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

	return pMap(files, mapper, options);
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
