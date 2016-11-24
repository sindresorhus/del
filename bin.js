#!/usr/bin/env node
'use strict';
var meow = require('meow');
var del = require('.');

var cli = meow(`
		Usage
			$ del /oh/my/glob/*.js

		Options
			-f, --force  Force deletion
			-d, --dryRun Print what would have been deleted

		Examples
		$ del /oh/my/glob/*.js --force --dryRun
`, {
	alias: {
		f: 'force',
		d: 'dryRun'
	}
});

del.sync(cli.input, cli.flags);
