import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Benchmark from 'benchmark';
import {temporaryDirectory} from 'tempy';
import {deleteAsync, deleteSync} from './index.js';

const suite = new Benchmark.Suite('concurrency');

const temporaryDirectoryPath = temporaryDirectory();

const fixtures = Array.from({length: 2000}, (_, index) => path.resolve(temporaryDirectoryPath, (index + 1).toString()));

function createFixtures() {
	for (const fixture of fixtures) {
		fs.mkdirSync(path.resolve(temporaryDirectoryPath, fixture), {recursive: true});
	}
}

const concurrencies = [
	1,
	3,
	5,
	10,
	15,
	20,
	50,
	100,
	200,
	300,
	400,
	500,
	1000,
	Number.POSITIVE_INFINITY,
];

for (const concurrency of concurrencies) {
	const name = `concurrency: ${concurrency.toString()}`;

	suite.add({
		name,
		defer: true,
		async fn(deferred) {
			// Can't use `setup()` because it isn't called after every
			// defer and it breaks using `async` keyword here.
			// https://github.com/bestiejs/benchmark.js/issues/136
			createFixtures();

			const removedFiles = await deleteAsync(['**/*'], {
				cwd: temporaryDirectoryPath,
				concurrency,
			});

			if (removedFiles.length !== fixtures.length) {
				const error = new Error(
					`"${name}": files removed: ${removedFiles.length}, expected: ${fixtures.length}`,
				);

				console.error(error);

				deleteSync(temporaryDirectoryPath, {cwd: temporaryDirectoryPath, force: true});

				// eslint-disable-next-line unicorn/no-process-exit
				process.exit(1);
			}

			deferred.resolve();
		},
	});
}

suite
	.on('cycle', event => {
		console.log(String(event.target));
	})
	.on('complete', function () {
		console.log(`Fastest is ${this.filter('fastest').map('name')}`);

		deleteSync(temporaryDirectoryPath, {cwd: temporaryDirectoryPath, force: true});
	})
	.run({async: true});
