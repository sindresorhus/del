import path from 'path';
import fs from 'fs';
import test from 'ava';
import tempy from 'tempy';
import makeDir from 'make-dir';
import m from '.';

function exists(t, files) {
	for (const file of files) {
		t.true(fs.existsSync(path.join(t.context.tmp, file)));
	}
}

function notExists(t, files) {
	for (const file of files) {
		t.false(fs.existsSync(path.join(t.context.tmp, file)));
	}
}

const fixtures = [
	'1.tmp',
	'2.tmp',
	'3.tmp',
	'4.tmp',
	'.dot.tmp'
];

test.beforeEach(t => {
	t.context.tmp = tempy.directory();

	for (const fixture of fixtures) {
		makeDir.sync(path.join(t.context.tmp, fixture));
	}
});

test('delete files - async', async t => {
	await m(['*.tmp', '!1*'], {cwd: t.context.tmp});

	exists(t, ['1.tmp', '.dot.tmp']);
	notExists(t, ['2.tmp', '3.tmp', '4.tmp']);
});

test('delete files - sync', t => {
	m.sync(['*.tmp', '!1*'], {cwd: t.context.tmp});

	exists(t, ['1.tmp', '.dot.tmp']);
	notExists(t, ['2.tmp', '3.tmp', '4.tmp']);
});

test('take options into account - async', async t => {
	await m(['*.tmp', '!1*'], {
		cwd: t.context.tmp,
		dot: true
	});

	exists(t, ['1.tmp']);
	notExists(t, ['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test('take options into account - sync', t => {
	m.sync(['*.tmp', '!1*'], {
		cwd: t.context.tmp,
		dot: true
	});

	exists(t, ['1.tmp']);
	notExists(t, ['2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
});

test.serial('return deleted files - async', async t => {
	t.deepEqual(
		await m('1.tmp', {cwd: t.context.tmp}),
		[path.join(t.context.tmp, '1.tmp')]
	);
});

test('return deleted files - sync', t => {
	t.deepEqual(
		m.sync('1.tmp', {cwd: t.context.tmp}),
		[path.join(t.context.tmp, '1.tmp')]
	);
});

test(`don't delete files, but return them - async`, async t => {
	const deletedFiles = await m(['*.tmp', '!1*'], {
		cwd: t.context.tmp,
		dryRun: true
	});
	exists(t, ['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	t.deepEqual(deletedFiles, [
		path.join(t.context.tmp, '2.tmp'),
		path.join(t.context.tmp, '3.tmp'),
		path.join(t.context.tmp, '4.tmp')
	]);
});

test(`don't delete files, but return them - sync`, t => {
	const deletedFiles = m.sync(['*.tmp', '!1*'], {
		cwd: t.context.tmp,
		dryRun: true
	});
	exists(t, ['1.tmp', '2.tmp', '3.tmp', '4.tmp', '.dot.tmp']);
	t.deepEqual(deletedFiles, [
		path.join(t.context.tmp, '2.tmp'),
		path.join(t.context.tmp, '3.tmp'),
		path.join(t.context.tmp, '4.tmp')
	]);
});

describe('With nested directories', function() {
	beforeEach(function() {
		[
			'tmpDir/5.tmp',
			'tmpDir/6.tmp',
			'tmpDir/anotherDir/7.tmp',
			'tmpDir/anotherDir/8.tmp'
		].forEach(fs.ensureFileSync);
	});

	afterEach(function() {
		[
			'tmpDir/5.tmp',
			'tmpDir/6.tmp',
			'tmpDir/',
			'tmpDir/anotherDir/7.tmp',
			'tmpDir/anotherDir/8.tmp',
			'tmpDir/anotherDir/'
		].forEach(fs.removeSync);

	});

	it('should not delete negated file', function(cb) {
		del(['tmpDir/**/*', '!tmpDir/anotherDir/8.tmp'], function() {
			assert(!pathExists.sync('tmpDir/5.tmp'));
			assert(!pathExists.sync('tmpDir/6.tmp'));
			assert(!pathExists.sync('tmpDir/anotherDir/7.tmp'));
			assert(pathExists.sync('tmpDir/anotherDir/8.tmp'));
			fileList
			cb();
		});
	});
});
