'use strict';
const {promisify} = require('util');
const path = require('path');
const globby = require('globby');
const isGlob = require('is-glob');
const slash = require('slash');
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

function normalizePatterns(patterns) {
	patterns = Array.isArray(patterns) ? patterns : [patterns];

	patterns = patterns.map(pattern => {
		if (process.platform === 'win32' && isGlob(pattern) === false) {
			return slash(pattern);
		}

		return pattern;
	});

	return patterns;
}

module.exports = async (patterns, {force, dryRun, cwd = process.cwd(), ...options} = {}) => {
	options = {
		expandDirectories: false,
		onlyFiles: false,
		followSymbolicLinks: false,
		cwd,
		...options
	};

	patterns = normalizePatterns(patterns);

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

	return pMap(files, mapper, options);
};

module.exports.sync = (patterns, {force, dryRun, cwd = process.cwd(), ...options} = {}) => {
	options = {
		expandDirectories: false,
		onlyFiles: false,
		followSymbolicLinks: false,
		cwd,
		...options
	};

	patterns = normalizePatterns(patterns);

	const files = globby.sync(patterns, options)
		.sort((a, b) => b.localeCompare(a));

	return files.map(file => {
		file = path.resolve(cwd, file);

		if (!force) {
			safeCheck(file, cwd);
		}

		if (!dryRun) {
			rimraf.sync(file, {glob: false});
		}

		return file;
	});
};
