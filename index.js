'use strict';
const {promisify} = require('util');
const path = require('path');
const globby = require('globby');
const isPathCwd = require('is-path-cwd');
const isPathInCwd = require('is-path-in-cwd');
const rimraf = require('rimraf');
const pMap = require('p-map');

const rimrafP = promisify(rimraf);

function safeCheck(file) {
	if (isPathCwd(file)) {
		throw new Error('Cannot delete the current working directory. Can be overridden with the `force` option.');
	}

	if (!isPathInCwd(file)) {
		throw new Error('Cannot delete files/directories outside the current working directory. Can be overridden with the `force` option.');
	}
}

module.exports = async (patterns, {force, dryRun, ...options} = {}) => {
	options = {
		expandDirectories: false,
		onlyFiles: false,
		followSymbolicLinks: false,
		...options
	};

	const files = await globby(patterns, options);

	const mapper = async file => {
		if (!force) {
			safeCheck(file);
		}

		file = path.resolve(options.cwd || '', file);

		if (!dryRun) {
			await rimrafP(file, {glob: false});
		}

		return file;
	};

	return pMap(files, mapper, options);
};

module.exports.sync = (patterns, {force, dryRun, ...options} = {}) => {
	options = {
		expandDirectories: false,
		onlyFiles: false,
		followSymbolicLinks: false,
		...options
	};

	return globby.sync(patterns, options).map(file => {
		if (!force) {
			safeCheck(file);
		}

		file = path.resolve(options.cwd || '', file);

		if (!dryRun) {
			rimraf.sync(file, {glob: false});
		}

		return file;
	});
};
