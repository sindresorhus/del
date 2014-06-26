/*global it, beforeEach, afterEach */
'use strict';
var assert = require('assert');
var fs = require('fs-extra');
var del = require('./');

beforeEach(function () {
	[
		'1.tmp',
		'2.tmp',
		'3.tmp',
		'4.tmp',
		'.dot.tmp'
	].forEach(function(path) {
		fs.writeFileSync(path, '');
	});
});

afterEach(function () {
	[
		'1.tmp',
		'2.tmp',
		'3.tmp',
		'4.tmp',
		'.dot.tmp'
	].forEach(function(path) {
		try {
			fs.unlinkSync(path);
		} catch (err) {}
	});
});

it('should delete files async', function (cb) {
	del(['*.tmp', '!1*'], function (err) {
		assert(!err, err);
		assert(fs.existsSync('1.tmp'));
		assert(!fs.existsSync('2.tmp'));
		assert(!fs.existsSync('3.tmp'));
		assert(!fs.existsSync('4.tmp'));
		assert(fs.existsSync('.dot.tmp'));
		cb();
	});
});

it('should delete files sync', function () {
	del.sync(['*.tmp', '!1*']);
	assert(fs.existsSync('1.tmp'));
	assert(!fs.existsSync('2.tmp'));
	assert(!fs.existsSync('3.tmp'));
	assert(!fs.existsSync('4.tmp'));
	assert(fs.existsSync('.dot.tmp'));
});

it('should take account of options (async)', function(cb) {
	del(['*.tmp', '!1*'], {dot: true}, function (err) {
		assert(!err, err);
		assert(fs.existsSync('1.tmp'));
		assert(!fs.existsSync('2.tmp'));
		assert(!fs.existsSync('3.tmp'));
		assert(!fs.existsSync('4.tmp'));
		assert(!fs.existsSync('.dot.tmp'));
		cb();
	});
});

it('should take account of options (sync)', function () {
	del.sync(['*.tmp', '!1*'], {dot: true});
	assert(fs.existsSync('1.tmp'));
	assert(!fs.existsSync('2.tmp'));
	assert(!fs.existsSync('3.tmp'));
	assert(!fs.existsSync('4.tmp'));
	assert(!fs.existsSync('.dot.tmp'));
});
