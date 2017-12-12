![100% test coverage](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)

# sequelize-history
> Creates a revision history for instances of a given Sequelize model.

This module will setup automatic revision tracking for any [Sequelize](https://github.com/sequelize/sequelize) model.
This is effectively a re-write of [`sequelize-temporal`](https://github.com/bonaval/sequelize-temporal), which deserves any and all due credit.
More specifically...

- re-written in ES6-_ish_ code 
- addition of a couple of factory methods to make instantiation simpler (this is especially true if you're going to track revisions on all of your models)
- optionally tracks revision author
- a few new instantiation options
- up-to-date dependencies
- tests re-written in `tape`
- linted against `xo`
- less lodash magic

## Installation
Install via npm:

```sh
$ npm i sequelize-history --save
```

## Usage
Create your Sequelize instance and models per usual.

```js
const Sequelize = require('sequelize');
const sequelizeHistory = require('sequelize-history');

// Create a sequelize instance
const sequelize = new Sequelize('', '', '', {
  dialect: 'sqlite',
  operatorsAliases: false,
  storage: path.join(__dirname, 'test.sqlite')
});

// Create the model class to be tracked
const Model = sequelize.define('Model', {name: Sequelize.TEXT});
```

By default, the module exports a factory method to avoid having to deal with the constructor.
All options are passed transparently as they would be to the constructor if called directly.
To begin tracking a model's revisions:

```js
// If you want a reference to the tracking model...
const ModelHistory = sequelizeHistory(Model, sequelize);

// Otherwise...
sequelizeHistory(Model, sequelize);

// You're done. 
// A record of all changes to instances of 
// `Model` will be recorded in the modelHistory table via the
// `ModelHistory` collection.
```

If you need to access the constructor for some reason, it is exported as `SequelizeHistory`.

```js
// Require the constructor instead of the factory
const sequelizeHistory = require('sequelize-history').SequelizeHistory;

// Create an instance
const history = new SequelizeHistory(Model, sequelize);

// If you want a reference to the tracking model...
const modelHistory = history.modelHistory;
```

Finally, if you want to track all of your models, an `all` method is exported.
Just pass it your sequelize instance and you're done.

```js
const trackAll = require('sequelize-history').all;

trackAll(sequelize);
```

## Tracking revision author
If you pass an `authorFieldName` option, the tracking model gets a field of the same name added to its table.
It also results in your original model getting a new `setRevisionAuthor` static method.

Use this method by passing in any appropriate value before updating your original model instances, and the passed value will be written to the `authorFieldName` column of the tracking table.
The value is reset immediately after the next update is written to the history model.

_This functionality is available to both single instance updates and static bulk updates._

```js
const Sequelize = require('sequelize');
const sequelizeHistory = require('sequelize-history');

// Create a sequelize instance
const sequelize = new Sequelize('', '', '', {
  dialect: 'sqlite',
  operatorsAliases: false,
  storage: path.join(__dirname, 'test.sqlite')
});

// Create the model class to be tracked
const Model = sequelize.define('Model', {name: Sequelize.TEXT});

// Create some instances of the model
Model
  .create({name: 'test-1'})
  .then(() => Model.create({name: 'test-2'}))
  .then(() => {
    // Now we update our instances
    // First, set the revision author
    Model.setRevisingAuthor(100);
    // Then update the instances
    // Both bulk updates and instance updates are supported
    return Model.update({name: 'same'}, {where: {}});
  })
  // Get all of our recent revisions
  .then(() => sequelize.models.ModelHistory.findAll({where: {name: 'same'}}))
  .then(revisions => {
    revisions.forEach(revision => {
      // Should output 100 for each returned row
      console.log(revision.authorId);
    });
  })
  .catch(err => console.error.bind(console));
```

There are more examples in the tests.


# Options
The constructor and factory methods accept the following instantiation object properties:
- **authorFieldName** `string|null` - string to indicate a field name to store author of the revisions, or null to disable
- **modelSuffix** `string` - string to append to tracked model's name when creating name of tracking model
- **excludedAttributes** `array` - collection of model attributes to be excluded when creating history model from the target model
- **excludedNames** `array` - collection of model options to filter out when creating history model from the target model

**NOTE** - if `authorFieldName` is set, `hasMany` and `belongsTo` relationships will be created between the history model and the target model.
This is to ensure that constraints are not enforced in creating the associations.

### Defaults

```js
SequelizeHistory.DEFAULTS = {
    // String to indicate a field name to use to store the
    // author of the revisions to the model, or null if you
    // don't want to track revision authors
    authorFieldName: null,
    // String to append to tracked model's name in creating
    // name of model's history model
    modelSuffix: 'History',
    // Array of attributes to be ignored and excluded when
    // recording a change to the target model
    excludedAttributes: [],
    // Array of attribute properties to ignore when duplicating
    // the target model's attributes - this is mostly to prevent
    // the use of constraints that may be in place on the target
    excludedAttributeProperties: [
        'Model',
        'unique',
        'primaryKey',
        'references',
        'onUpdate',
        'onDelete',
        'autoIncrement',
        'set',
        'get',
        '_modelAttribute'
    ]
};
```

# Tests and coverage
Written with tape and Istanbul respectively.

To run the tests:
```
$ npm test
```

To generate a coverage report:
```
$ npm run coverage
```

To build JSDoc docs from in-line documentation:
```
$ npm run docs && open docs/index.html
```
