Package.describe({
  name: 'robsw:cfs-migrator',
  version: '0.0.3',
  summary: 'Migrate files between FS.Collection stores',
  git: 'https://github.com/robwatkin/meteor-cfs-migrator',
  documentation: 'README.md'
});

Npm.depends({'stream-throttle': '0.1.3'});

Package.onUse(function(api) {
  api.versionsFrom('1.1.0.2');

  api.use('meteor-platform');

  api.use('cfs:standard-packages@0.5.9');
  api.use('cfs:power-queue@0.9.11');

  api.addFiles('common.js');
  api.addFiles('server.js', 'server');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('robsw:cfs-migrator');
  api.addFiles('tests.js');
});
