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
	].forEach(fs.ensureFileSync);
});

afterEach(function () {
	[
		'1.tmp',
		'2.tmp',
		'3.tmp',
		'4.tmp',
		'.dot.tmp'
	].forEach(fs.removeSync);
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

it('should take account of options (async)', function (cb) {
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

it('cwd option - sync', function () {
	var f = 'tmp/tmp.txt';
	fs.ensureFileSync(f);
	del.sync('tmp.txt', {cwd: 'tmp'});
	assert(!fs.existsSync(f));
	fs.remove(f);
});

it('cwd option - async', function (cb) {
	var f = 'tmp/tmp.txt';
	fs.ensureFileSync(f);

	del('tmp.txt', {cwd: 'tmp'}, function (err) {
		assert(!err, err);
		assert(!fs.existsSync(f));
		fs.remove(f);
		cb();
	});
});
