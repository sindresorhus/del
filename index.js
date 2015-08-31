'use strict';
var path = require('path');
var globby = require('globby');
var isPathCwd = require('is-path-cwd');
var isPathInCwd = require('is-path-in-cwd');
var objectAssign = require('object-assign');
var Promise = require('pinkie-promise');
var pify = require('pify');
var rimraf = require('rimraf');
var rimrafP = pify(rimraf, Promise);

function safeCheck(file) {
	if (isPathCwd(file)) {
		throw new Error('Cannot delete the current working directory. Can be overriden with the `force` option.');
	}

	if (!isPathInCwd(file)) {
		throw new Error('Cannot delete files/folders outside the current working directory. Can be overriden with the `force` option.');
	}
}

module.exports = function (patterns, opts) {
	opts = objectAssign({}, opts);

	var force = opts.force;
	delete opts.force;

	return globby(patterns, opts).then(function (files) {
		return Promise.all(files.map(function (x) {
			if (!force) {
				safeCheck(x);
			}

			x = path.resolve(opts.cwd || '', x);

			return rimrafP(x).then(function () {
				return files;
			});
		})).then(function (args) {
			return args[0];
		});
	});
};

module.exports.sync = function (patterns, opts) {
	opts = objectAssign({}, opts);

	var force = opts.force;
	delete opts.force;

	return globby.sync(patterns, opts).map(function (x) {
		if (!force) {
			safeCheck(x);
		}

		x = path.resolve(opts.cwd || '', x);
		rimraf.sync(x);

		return x;
	});
};
