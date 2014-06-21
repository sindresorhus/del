'use strict';
var assert = require('assert');
var fs = require('fs-extra');
var del = require('./');

beforeEach(function () {
	fs.writeFileSync('1.tmp', '');
	fs.writeFileSync('2.tmp', '');
	fs.writeFileSync('3.tmp', '');
	fs.writeFileSync('4.tmp', '');
});

afterEach(function () {
	try {
		fs.unlinkSync('1.tmp');
		fs.unlinkSync('2.tmp');
		fs.unlinkSync('3.tmp');
		fs.unlinkSync('4.tmp');
	} catch (err) {}
});

it('should delete files async', function (cb) {
	del(['*.tmp', '!1*'], function (err) {
		assert(!err, err);
		assert(fs.existsSync('1.tmp'));
		assert(!fs.existsSync('2.tmp'));
		assert(!fs.existsSync('3.tmp'));
		assert(!fs.existsSync('4.tmp'));
		cb();
	});
});

it('should delete files sync', function () {
	del.sync(['*.tmp', '!1*']);
	assert(fs.existsSync('1.tmp'));
	assert(!fs.existsSync('2.tmp'));
	assert(!fs.existsSync('3.tmp'));
	assert(!fs.existsSync('4.tmp'));
});
