'use strict';
var assert = require('assert');
var fs = require('fs-extra');
var path = require('path');
var pathExists = require('path-exists');
var del = require('./');

var fixtures = [
	'1.tmp',
	'2.tmp',
	'3.tmp',
	'4.tmp',
	'.dot.tmp'
];

beforeEach(function () {
	fixtures.forEach(fs.ensureFileSync);
});

afterEach(function () {
	fixtures.forEach(fs.removeSync);
});

it('should delete files - async', function () {
	return del(['*.tmp', '!1*']).then(function () {
		assert(pathExists.sync('1.tmp'));
		assert(!pathExists.sync('2.tmp'));
		assert(!pathExists.sync('3.tmp'));
		assert(!pathExists.sync('4.tmp'));
		assert(pathExists.sync('.dot.tmp'));
	});
});

it('should delete files - sync', function () {
	del.sync(['*.tmp', '!1*']);
	assert(pathExists.sync('1.tmp'));
	assert(!pathExists.sync('2.tmp'));
	assert(!pathExists.sync('3.tmp'));
	assert(!pathExists.sync('4.tmp'));
	assert(pathExists.sync('.dot.tmp'));
});

it('should take account of options - async', function () {
	return del(['*.tmp', '!1*'], {dot: true}).then(function () {
		assert(pathExists.sync('1.tmp'));
		assert(!pathExists.sync('2.tmp'));
		assert(!pathExists.sync('3.tmp'));
		assert(!pathExists.sync('4.tmp'));
		assert(!pathExists.sync('.dot.tmp'));
	});
});

it('should take account of options - sync', function () {
	del.sync(['*.tmp', '!1*'], {dot: true});
	assert(pathExists.sync('1.tmp'));
	assert(!pathExists.sync('2.tmp'));
	assert(!pathExists.sync('3.tmp'));
	assert(!pathExists.sync('4.tmp'));
	assert(!pathExists.sync('.dot.tmp'));
});

it('cwd option - sync', function () {
	var f = 'tmp/tmp.txt';
	fs.ensureFileSync(f);
	del.sync('tmp.txt', {cwd: 'tmp'});
	assert(!pathExists.sync(f));
	fs.remove(f);
});

it('cwd option - async', function () {
	var f = 'tmp/tmp.txt';
	fs.ensureFileSync(f);

	return del('tmp.txt', {cwd: 'tmp'}).then(function () {
		assert(!pathExists.sync(f));
		fs.remove(f);
	});
});

it('return deleted files - sync', function () {
	fs.ensureFileSync('tmp/tmp.txt');
	assert.deepEqual(del.sync('tmp.txt', {cwd: 'tmp'}), [path.resolve('tmp/tmp.txt')]);
});

it('return deleted files - async', function () {
	fs.ensureFileSync('tmp/tmp.txt');
	return del('tmp.txt', {cwd: 'tmp'}).then(function (deletedFiles) {
		assert.deepEqual(deletedFiles, [path.resolve('tmp/tmp.txt')]);
	});
});

it('should not delete files, but return them - async', function () {
	return del(['*.tmp', '!1*'], {dryRun: true}).then(function (deletedFiles) {
		assert(pathExists.sync('1.tmp'));
		assert(pathExists.sync('2.tmp'));
		assert(pathExists.sync('3.tmp'));
		assert(pathExists.sync('4.tmp'));
		assert(pathExists.sync('.dot.tmp'));
		assert.deepEqual(deletedFiles, [path.resolve('2.tmp'), path.resolve('3.tmp'), path.resolve('4.tmp')]);
	});
});

it('should not delete files, but return them - sync', function () {
	del.sync(['*.tmp', '!1*'], {dryRun: true});
	assert(pathExists.sync('1.tmp'));
	assert(pathExists.sync('2.tmp'));
	assert(pathExists.sync('3.tmp'));
	assert(pathExists.sync('4.tmp'));
	assert(pathExists.sync('.dot.tmp'));
	assert.deepEqual(deletedFiles, [path.resolve('2.tmp'), path.resolve('3.tmp'), path.resolve('4.tmp')]);
});

it('options are optional', function () {
	del.sync('1.tmp');
	return del('1.tmp');
});
