'use strict';

const path = require('path');
const Benchmark = require('benchmark');
const makeDir = require('make-dir');
const tempy = require('tempy');
const del = require('.');

const suite = new Benchmark.Suite('concurrency');

const tempDir = tempy.directory();

const fixtures = Array.from({length: 2000}, (x, index) => {
	return path.resolve(tempDir, (index + 1).toString());
});

function createFixtures() {
	for (const fixture of fixtures) {
		makeDir.sync(path.resolve(tempDir, fixture));
	}
}

const concurrency = [1, 3, 5, 10, 15, 20, 50, 100, Infinity];

concurrency.forEach(num => {
	const name = `concurrency: ${num.toString()}`;

	suite.add({
		name,
		defer: true,
		fn(deferred) {
			// Can't use setup because it isn't called after every defer
			// https://github.com/bestiejs/benchmark.js/issues/136
			createFixtures();

			// Async await was giving too many errors. stick with standard promises
			del(['**/*'], {
				cwd: tempDir,
				concurrency: num
				// eslint-disable-next-line promise/prefer-await-to-then
			}).then(removedFiles => {
				if (removedFiles.length !== fixtures.length) {
					const error = new Error(
						`"${name}": files removed: ${removedFiles.length}, expected: ${fixtures.length}`,
					);

					console.error(error);

					del.sync(tempDir, {cwd: tempDir, force: true});

					// eslint-disable-next-line unicorn/no-process-exit
					process.exit(1);
				}

				deferred.resolve();
			});
		}
	});
});

suite
	.on('cycle', event => {
		console.log(String(event.target));
	})
	.on('complete', function () {
		console.log(`Fastest is ${this.filter('fastest').map('name')}`);

		del.sync(tempDir, {cwd: tempDir, force: true});
	})
	.run({async: true});
