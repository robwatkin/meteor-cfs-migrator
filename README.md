# meteor-cfs-migrator
Meteor - migrate files between FS.Collection stores

## CollectionFS Store Migrator ##
This package has been built to migrate files between FS.Collection stores running on a __live__ server. It has currently only been tested and used to migrate files from cfs:gridfs to cfs:filesystem but should work with other stores because stream throttling has also been implemented. Although it has only been used to transfer a small number of files it should work with a larger number if you set processes carefully so as to not create too many parallel streams.

See the [api](./api.md) and [internal api](./internal.api.md) documentation.

### Design
This module is designed to be used within a running app to allow migration of files on a live platform. Initially include the package and arrange (for example with Meteor.settings) to pass in the action 'none'. Then change the action to 'copy' and restart your app. After you're sure that all stores have been migrated then change action to 'purge' and the old (source) stores will be removed from the collection. Finally set the action to "done" and the new store will be used but no other migration action will take place.

`StoreMigrator` completes the migration of files from a target (old) store to a source (new) store in two steps. These steps can be performed in a single build (deployment) by, for example, changing the action option using settingsand restarted the App. Four steps are defined by the options.action constructor argument:

 1. "none": No action is performed in this step. The collection is backed by the old store.
 2. "copy": The collection is backed by both stores. Files are copied between the old store and the new store.
 3. "purge": The collection is updated and FS.File.copies['oldStoreName'] references removed. The actual store is not touched in any way; if you want to remove the actual store then do it manually.
 4. "done": No action is performed in this step. The collection is backed by the new store.

Migration template helpers are supported should clients need to determine in which store to find or place files during the migration steps.

### Use
Include the package and create StoreMigrated instances as outlined below. Then use Meteor.settings to control the migration steps. Note: `Meteor.settings.public` must be used if you wish to use migration template helpers.

    {
      "some_private": "setting_values",
      "public": {
        "some_public": "setting_values",
        "action":"none"}
      }
    }

For example to migrate these files from cfs:gridfs to a cfs:filesystem store

    var picsStore = new FS.Store.GridFS("pics-gridfs", {chunkSize: 1024*512});

    pics = new FS.Collection("pics", {
      stores: [picsStore]
    });


create an instance of StoreMigrator and use it to control the creation of the new store and the migration


    var picsMigrator = new FS.Collection.StoreMigrator('pics', {
                                                               oldStoreName: 'pics-gridfs',
                                                               newStoreName: 'pics-filesystem',
                                                               rate: 1024,
                                                               maxProcessing: 2,
                                                               action: Meteor.settings.public.action});
    var picsStore;
    if(!picsMigrator.after())
      picsStore = new FS.Store.GridFS("pics", {chunkSize: 1024*512});

    var picsStoreFS;
    if(!picsMigrator.before())
      picsStoreFS = new FS.Store.FileSystem("pics-filesystem", {path: "/uploads/pics"})

    var stores;
    if (picsMigrator.during())
      stores = [picsStore, picsStoreFS];
    else if (picsMigrator.after())
      stores = [picsStoreFS];
    else
      stores = [picsStore];

    pics = new FS.Collection("pics", {
      stores: stores
    });

    picsMigrator.collection(pics);

    if(Meteor.isServer) {
      picsMigrator.perform(picsStore, picsStoreFS);
    }


Now build and run your app to complete the migration in three (actually four) steps.

#### Step 1:
(Meteor.settings)

    {
      "some_private": "setting_values",
      "public": {
        "some_public": "setting_values",
        "action":"none"}
      }
    }

#### Step 2:
(Meteor.settings)

    {
      "some_private": "setting_values",
      "public": {
        "some_public": "setting_values",
        "action":"copy"}
      }
    }

To know when the copy operation has completed, watch the log file for:

    StoreMigrator.perform.copyStore pics COMPLETED all files copied

and if you're controlling the parallelism with optionsdebug == true:

    StoreMigrator.perform.copyStore pics process queue ended

#### Step 3:
(Meteor.settings)

    {
      "some_private": "setting_values",
      "public": {
        "some_public": "setting_values",
        "action":"purge"}
      }
    }

To know when the purge operation has completed, watch the log file for:

    StoreMigrator.perform.purgeStore pics COMPLETED n files purged

#### Step 4:
(Meteor.settings)

    {
      "some_private": "setting_values",
      "public": {
        "some_public": "setting_values",
        "action":"done"}
      }
    }

The store has been migrated make another build without the Migrator package, manually remove the old store and your done!

### Throttling the migration rate
The total bandwidth used for a store migration may be controlled by setting the `StoreMigrator` constructor option `rate` to a numerical value representing the number of bytes transferred per second. This is a total aggregate rate for all file copy operations occuring in parallel.

### Controlling parallelism
By default `StoreMigrator` will attempt to copy all the files in parallel using NodeJS streams. If want to restrict the number of simultaneous streams then set the `StoreMigrator` constructor option `processes` to a numerical value representing the maximum number of streams.

### Template helpers
Global template helpers are defined so that you can customise your templates to use the correct store. For example

    {{#unless picsAfterMigration}}
      <img src="{{this.url store='pics-gridfs'}}"
    {{else}}
      <img src="{{this.url store='pics-filesystem'}}"
    {{/unless}}


