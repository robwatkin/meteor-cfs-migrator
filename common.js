/**
 * @constructor
 * @param {string} collectionName Name of the collection containing the stores
 * @param {Object} options
 * @param {string} [options.oldName] Name of the source store
 * @param {string} [options.newName] Name of the target store
 * @param {number} [options.rate] Maximum rate in bytes/sec. Zero is unlimited
 * @param {number} [options.maxProcessing] Maximum parallel file transfers
 * @param {string} [options.action] Action none|copy|purge|done
 * @param {boolean} [options.debug] Enable logging
 * @returns {undefined}
 *
 * CollectionFS Store Migrator
 *
 * This package migrates files between FS.Collection stores running on a __live__ server.
 * See the packages [README](/README.md) for a fuller explanation.
 */

FS.Collection.StoreMigrator = function(collectionName, options) {

  options = options || {};

  var self = this;

  self.collectionName = collectionName;
  self.oldName = options.oldStoreName;
  self.newName = options.newStoreName;
  self.rate = options.rate;
  self.maxProcessing = options.processes;
  self.action = options.action || 'none';
  self.debug = options.debug

  self.debug && console.log('StoreMigrator for ' + collectionName + ' options: ', options);
}

/** @method StoreMigrator.prototype.before Helper to determine migration step
 * @public
 * @returns {boolean} True if options.action == 'none'
 */

FS.Collection.StoreMigrator.prototype.before = function() {
  return this.action === 'none';
}

/** @method StoreMigrator.prototype.during Helper to determine migration step
 * @public
 * @returns {boolean} True if options.action == 'copy'
 */

FS.Collection.StoreMigrator.prototype.during = function() {
  return this.action === 'copy';
}

/** @method StoreMigrator.prototype.after Helper to determine migration step
 * @public
 * @returns {boolean} True if options.action == 'purge'
 */

FS.Collection.StoreMigrator.prototype.after = function() {
  return this.action === 'purge' || this.action === 'done';
}

/** @method StoreMigrator.prototype.collection Set the collection reference
 * @public
 * @param {FS.Collection} collection Collection instance
 * @returns {FS.Colection} A reference to the FS.Collection instance
 *
 * This package extends FS.Collection with the migrator setter which keeps a reference to the migrator.
 * Warning: _collection is a circular reference!
 */

FS.Collection.StoreMigrator.prototype.collection = function (collection) {

  var self = this;

  if(collection) {
     self._collection = collection;

     if(!collection._migrator) {
      collection.migrator(self);

      if(Meteor.isClient) {
        Template.registerHelper(collection.name + 'BeforeMigration', function() {
          return self.before();
        });

        Template.registerHelper(collection.name + 'DuringMigration', function() {
          return self.during();
        });

        Template.registerHelper(collection.name + 'AfterMigration', function() {
          return self.after();
        });
      }
    }
  }
  return self._collection
}

/** @method Collection.prototype.migrator Set the migrator reference
 * @public
 * @param {Collection.StoreMigrator} migrator StoreMigrator instance
 * @returns {Colection.StoreMigrator} A reference to the FS.Collection.StoreMigrator instance
 *
 * Warning: _migrator is a circular reference!
 */

FS.Collection.prototype.migrator = function (migrator) {
 
  if(migrator) {
    this._migrator = migrator;

    if(!migrator._collection)
      migrator.collection(this);
  }
    
  return this._migrator;
}


