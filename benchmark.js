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

const concurrencies = [1, 3, 5, 10, 15, 20, 50, 100, 200, 300, 400, 500, 1000, Infinity];

for (const concurrency of concurrencies) {
	const name = `concurrency: ${concurrency.toString()}`;

	suite.add({
		name,
		defer: true,
		async fn(deferred) {
			// Can't use setup because it isn't called after every defer
			// https://github.com/bestiejs/benchmark.js/issues/136
			createFixtures();

			const removedFiles = await del(['**/*'], {
				cwd: tempDir,
				concurrency
			});

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
		}
	});
}

suite
	.on('cycle', event => {
		console.log(String(event.target));
	})
	.on('complete', function () {
		console.log(`Fastest is ${this.filter('fastest').map('name')}`);

		del.sync(tempDir, {cwd: tempDir, force: true});
	})
	.run({async: true});
