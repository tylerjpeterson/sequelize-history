![100% test coverage](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)

# sequelize-history
> Creates a revision history for instances of a given Sequelize model.

This module will setup automatic revision tracking for any [Sequelize](https://github.com/sequelize/sequelize) model.
This is effectively a re-write of [`sequelize-temporal`](https://github.com/bonaval/sequelize-temporal), which deserves any and all due credit.
More specifically...

- re-written in ES6-_ish_ code 
- addition of a couple of factory methods to make instantiation simpler (this is especially true if you're going to track revisions on all of your models)
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

# Options
The constructor and factory methods accept the following instantiation object properties:
- **modelSuffix** `string` - string to append to tracked model's name when creating name of tracking model
- **excludedAttributes** `array` - collection of model attributes to be excluded when creating history model from the target model
- **excludedNames** `array` - collection of model options to filter out when creating history model from the target model

### Defaults

```js
SequelizeHistory.DEFAULTS = {
  // String to append to tracked model's name in creating
  // name of model's history model
  modelSuffix: 'History',
  // Collection of attributes to be excluded when creating
  // history model from the target model
  excludedAttributes: [
    'Model',
    'unique',
    'primaryKey',
    'autoIncrement',
    'set',
    'get',
    '_modelAttribute'
  ],
  // Collection of options to filter out when creating
  // history model from the target model
  excludedNames: [
    'name',
    'tableName',
    'sequelize',
    'uniqueKeys',
    'hasPrimaryKey',
    'hooks',
    'scopes',
    'instanceMethods',
    'defaultScope'
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
