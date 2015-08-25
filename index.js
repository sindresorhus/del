'use strict';
var Promise = require('pinkie-promise');
var path = require('path');
var globby = require('globby');
var eachAsync = require('each-async');
var isPathCwd = require('is-path-cwd');
var isPathInCwd = require('is-path-in-cwd');
var objectAssign = require('object-assign');
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
	if (typeof opts !== 'object') {
		opts = {};
	}

	opts = objectAssign({}, opts);

	var force = opts.force;
	delete opts.force;

	var deletedFiles = [];

	return globby(patterns, opts).then(function (files) {
		return Promise.all(files.map(function (el) {
			if (!force) {
				safeCheck(el);
			}

			el = path.resolve(opts.cwd || '', el);
			deletedFiles.push(el);
			return rimrafP(el);
		})).then(function () {
			return deletedFiles;
		});
	});
};

module.exports.sync = function (patterns, opts) {
	opts = objectAssign({}, opts);

	var force = opts.force;
	delete opts.force;

	var deletedFiles = [];

	globby.sync(patterns, opts).forEach(function (el) {
		if (!force) {
			safeCheck(el);
		}

		el = path.resolve(opts.cwd || '', el);
		deletedFiles.push(el);
		rimraf.sync(el);
	});

	return deletedFiles;
};
