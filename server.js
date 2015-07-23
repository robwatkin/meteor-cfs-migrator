/** @method StoreMigrator.prototype.perform Perform the next step of the migration as specified by the action option
 * @public
 * @param {FS.Store} oldStore The store to be migrated
 * @param {FS.Store} newStore The new store
 * @returns {undefined} The migration will continue asynchronously after this method has returned
 */

FS.Collection.StoreMigrator.prototype.perform = function (oldStore, newStore) {

  var self = this;

  if(!self.collection())
    throw new Meteor.Error('FS.Collection.StoreMigrator.perform no bound collection');

  var collection = self.collection(),
      debug = self.debug;

  if(debug) {
    console.log('StoreMigrator.perform self: ' + !!self);
    console.log('StoreMigrator.perform self.collectionName: ' + self.collectionName);
    console.log('StoreMigrator.perform collection: ' + !!collection);
    console.log('StoreMigrator.perform collection.name: ' + collection.name);
  }
  
   // Validate collection and stores

  if (!collection || collection.name != self.collectionName) {
    throw new Meteor.Error('StoreMigrator.perform ' + self.collectionName, 'bad collection');
  }

  if (oldStore && oldStore.name !== self.oldName) {
    throw new Meteor.Error('StoreMigrator.perform ' + self.collectionName, 'bad store: ' + self.oldName);
  }

  if (newStore && newStore.name !== self.newName) {
    throw new Meteor.Error('StoreMigrator.perform ' + self.collectionName, 'bad store: ' + self.newName);
  }

  var name = collection.name;

  var copyStore = function () {

    debug && console.log('StoreMigrator.perform.copyStore ' + name + ' action: ' + self.action + ' rate(bytes/s): ' + self.rate);

    if(self.rate) {
      var ThrottleGroup = Npm.require('stream-throttle').ThrottleGroup,
        throttleGroup = new ThrottleGroup({rate: self.rate});
    }
    
    var completed = 0;
    var files = collection.find();
    var fileCount = files.count();

    debug && console.log('StoreMigrator.perform.copyStore ' + name + ' files: ', files.count());

    var copyFile = function (fileObj, index, done) {

      if( (fileObj.copies[self.newName] && fileObj.copies[self.newName].size === 0 )) {

        debug && console.log('StoreMigrator.perform.copyStore ' + name + ' migrating: ', fileObj.copies[self.newName].key);
        var readStream = fileObj.createReadStream();
        var writeStream = fileObj.createWriteStream(self.newName);

        writeStream.on('finish', Meteor.bindEnvironment(function() {
          debug && console.log('StoreMigrator.perform.copyStore ' + name + ' finished: ' + fileObj.copies[self.newName].key);
          if(++completed === fileCount)
            console.log('StoreMigrator.perform.copyStore ' + name + ' COMPLETED all files copied');
          done();
        }));
        
        if(self.rate) {
         
          readStream.pipe(throttleGroup.throttle()).pipe(writeStream);
        } else {
          readStream.pipe(writeStream);
        }

      } else {
        debug && console.log('StoreMigrator.perform.copyStore ' + name + ' skipping: ', fileObj.copies[self.newName].key);
      }
    }

    if (self.maxProcessing) {
      debug && console.log('StoreMigrator.perform.copyStore ' + name + ' queue max processes: ' + self.maxProcessing);

      var queue = new PowerQueue({
        name: name,
        maxProcessing: self.maxProcessing
      });
     
      if(debug) {
        queue.onEnded = function() {
          console.log('StoreMigrator.perform.copyStore ' + name + ' process queue ended ');
        }
      }
      
      files.forEach(function(fileObj, index) {
        queue.add(function(done) {
          copyFile(fileObj, index, done);
        });
      });
    } else {
      files.forEach(function(fileObj, index) {
        copyFile(fileObj, index, function() {});
      });
    }
  }

  var purgeStore = function () {
    debug && console.log('StoreMigrator.perform.purgeStore ' + name + ' action', self.action);

    var oldCopiesQuery = {};
    oldCopiesQuery['copies.' + self.oldName] = { $exists: true};
    var oldStoreCount = collection.find(oldCopiesQuery).count();

    var newCopiesQuery = {};
    newCopiesQuery['copies.' + self.newName] = { $exists: true}
    var newStoreCount = collection.find(newCopiesQuery).count();

    debug && console.log('StoreMigrator.perform.purgeStore ' + name + ' oldStoreCount: ', oldStoreCount);
    debug && console.log('StoreMigrator.perform.purgeStore ' + name + ' newStoreCount: ', newStoreCount);
    
    if(oldStoreCount && newStoreCount >= oldStoreCount) {

      // Files have been moved to the new store
      debug && console.log('StoreMigrator.perform.purgeStore name: ' + name + ' deleting copies.' + self.oldName);
      fields = {};
      fields['copies.' + self.oldName] = '';

      collection.update(oldCopiesQuery, {$unset: fields}, {multi: true}, function (error, count) {
        if(error)
          throw new Meteor.Error('FS.Collection ' + name,
                             'MoveStore action: ' + self.action  + ' purge failed');
        else
          console.log('StoreMigrator.perform.purgeStore ' + name + ' COMPLETED ' + count + ' files purged');
        
      });

    } else if (oldStoreCount && newStoreCount < oldStoreCount){
      throw new Meteor.Error('FS.Collection ' + name,
                             'MoveStore action: ' + self.action 
                              + '; BAD oldStoreCount: ' + oldStoreCount 
                              + ' newStoreCount: ' + newStoreCount);

    } else {
      debug && console.log('StoreMigrator.perform.purgeStore NO ACTION necessary');
    }
  }

  debug && console.log('StoreMigrator.perform action: ' + self.action
                    + ' oldName: ' + self.oldName + ' newName: ' + self.newName
                    + ' stores: ', Object.keys(collection.storesLookup));

  if (self.action === 'copy') {
    if (Object.keys(collection.storesLookup).length !== 2)
      throw new Meteor.Error('StoreMigrator.perform ' + self.collectionName,
                             'action: ' + self.action + '; bad collection storesLookup');

    if (!oldStore || !newStore)
      throw new Meteor.Error('StoreMigrator.perform ' + self.collectionName,
                             'action: ' + self.action + '; needs both stores');
  
    copyStore()

  } else if (self.action === 'purge') {
    if (Object.keys(collection.storesLookup).length !== 1)
      throw new Meteor.Error('StoreMigrator.perform ' + self.collectionName,
                             'action: ' + self.action + '; bad collection storesLookup');

    if(Object.keys(collection.storesLookup)[0] != self.newName)
      throw new Meteor.Error('StoreMigrator.perform ' + self.collectionName,
                             'action: ' + self.action + '; bad collection store');

    if (self.oldStore)
      throw new Meteor.Error('StoreMigrator.perform ' + self.collectionName,
                             'action: ' + self.action + '; oldStore is defined');

    purgeStore();

  } else if (self.action === 'none') {
    if (Object.keys(collection.storesLookup).length !== 1)
      throw new Meteor.Error('StoreMigrator.perform ' + self.collectionName,
                             'action: ' + self.action + '; bad collection storesLookup');

    if(Object.keys(collection.storesLookup)[0] != self.oldName)
      throw new Meteor.Error('StoreMigrator.perform ' + self.collectionName,
                             'action: ' + self.action + '; bad collection store');

    console.log('StoreMigrator.perform ' + name + ' action', self.action);

  } else if (self.action === 'done') {

    if (Object.keys(collection.storesLookup).length !== 1)
      throw new Meteor.Error('StoreMigrator.perform ' + self.collectionName,
                             'action: ' + self.action + '; bad collection storesLookup');

    if(Object.keys(collection.storesLookup)[0] != self.newName)
      throw new Meteor.Error('StoreMigrator.perform ' + self.collectionName,
                             'action: ' + self.action + '; bad collection store');

    console.log('StoreMigrator.perform ' + name + ' action', self.action);

  } else {
    throw new Meteor.Error('StoreMigrator.perform ' + self.collectionName,
                             'action: ' + self.action + '; bad action');
  }

}

