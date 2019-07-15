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

module.exports = async (patterns, {force, dryRun, cwd = process.cwd(), ...options} = {}) => {
	options = {
		expandDirectories: false,
		onlyFiles: false,
		followSymbolicLinks: false,
		cwd,
		...options
	};

	const files = (await globby(patterns, options))
		.sort((a, b) => b.localeCompare(a));

	const mapper = async file => {
		file = path.resolve(cwd, file);

		if (!force) {
			safeCheck(file, cwd);
		}

		if (!dryRun) {
			await rimrafP(file, {glob: false});
		}

		return file;
	};

	const removedFiles = await pMap(files, mapper, options);

	removedFiles.sort((a, b) => a.localeCompare(b));

	return removedFiles;
};

module.exports.sync = (patterns, {force, dryRun, cwd = process.cwd(), ...options} = {}) => {
	options = {
		expandDirectories: false,
		onlyFiles: false,
		followSymbolicLinks: false,
		cwd,
		...options
	};

	const files = globby.sync(patterns, options)
		.sort((a, b) => b.localeCompare(a));

	const removedFiles = files.map(file => {
		file = path.resolve(cwd, file);

		if (!force) {
			safeCheck(file, cwd);
		}

		if (!dryRun) {
			rimraf.sync(file, {glob: false});
		}

		return file;
	});

	removedFiles.sort((a, b) => a.localeCompare(b));

	return removedFiles;
};
