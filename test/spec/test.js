'use strict';

require('events').EventEmitter.defaultMaxListeners = 100;

const path = require('path');
const test = require('tape');
const Sequelize = require('sequelize');
const revisionTracker = require('./../../');

let UserRevision = null;
let sequelize = null;
let User = null;

const freshDb = () => {
	sequelize = new Sequelize('', '', '', {
		dialect: 'sqlite',
		logging: false,
		operatorsAliases: false,
		storage: path.join(__dirname, 'test.sqlite')
	});

	User = sequelize.define('User', {name: Sequelize.TEXT});
	UserRevision = revisionTracker(User, sequelize);

	return sequelize.sync({force: true});
};

test('onUpdate/onDestroy: should save to the historyDB', t => {
	let u = null;
	t.plan(3);

	return freshDb()
		.then(() => User.create())
		.then(user => {
			u = user;
			return UserRevision.count();
		})
		.then(c => {
			t.equal(c, 0, 'no revisions');
			return Promise.resolve();
		})
		.then(() => {
			u.name = 'foo';
			return u.save();
		})
		.then(() => UserRevision.count())
		.then(c => {
			t.equal(c, 1, 'name change revision');
			return Promise.resolve(u);
		})
		.then(() => u.destroy())
		.then(() => UserRevision.count())
		.then(c => {
			t.equal(c, 2, 'state at destroy revision');
		})
		.catch(err => console.error(err));
});

test('onUpdate: should store the previous version to the historyDB', t => {
	let u = null;
	t.plan(5);

	return freshDb()
		.then(() => User.create({name: 'foo'}))
		.then(user => {
			u = user;
			return UserRevision.count();
		})
		.then(c => {
			t.equal(c, 0);
			return Promise.resolve(u);
		})
		.then(() => {
			u.name = 'bar';
			return u.save();
		})
		.then(() => UserRevision.count())
		.then(c => {
			t.equal(c, 1);
			return Promise.resolve(u);
		})
		.then(() => UserRevision.findAll())
		.then(users => {
			t.equal(users.length, 1, 'only one entry in DB');
			t.equal(users[0].name, 'foo', 'previous entry saved');
			return User.findOne();
		})
		.then(user => user.destroy())
		.then(() => UserRevision.count())
		.then(c => {
			t.equal(c, 2);
		})
		.catch(err => console.error(err));
});

test('onDelete: should store the previous version to the historyDB', t => {
	let u = null;
	t.plan(4);

	return freshDb()
		.then(() => User.create({name: 'foo'}))
		.then(user => {
			u = user;
			return UserRevision.count();
		})
		.then(c => {
			t.equal(c, 0, 'no revisions');
			return Promise.resolve(u);
		})
		.then(user => user.destroy())
		.then(() => UserRevision.count())
		.then(c => {
			t.equal(c, 1, 'state at destroy revision');
			return UserRevision.findAll();
		})
		.then(users => {
			t.equal(users.length, 1, 'only one entry in DB');
			t.equal(users[0].name, 'foo', 'previous entry saved');
		})
		.catch(err => console.error(err));
});

test('transactions: revert on failed transactions', t => {
	let trans = null;
	let opts = null;
	let u = null;
	t.plan(3);

	return freshDb()
		.then(() => sequelize.transaction())
		.then(t => {
			trans = t;
			opts = {transaction: trans};
			return User.create(opts);
		})
		.then(user => {
			u = user;
			return UserRevision.count(opts);
		})
		.then(c => {
			t.equal(c, 0, 'no revisions');
		})
		.then(() => {
			u.name = 'foo';
			return u.save(opts);
		})
		.then(() => UserRevision.count(opts))
		.then(c => {
			t.equal(c, 1, 'name change revision');
			return trans.rollback();
		})
		.then(() => UserRevision.count())
		.then(c => {
			t.equal(c, 0, 'no revisions post-rollback');
		})
		.catch(err => console.error(err));
});

test('bulk updates: should track multiple revisions', t => {
	t.plan(2);

	return freshDb()
		.then(() => User.bulkCreate([{name: 'foo1'}, {name: 'foo2'}]))
		.then(() => UserRevision.count())
		.then(c => {
			t.equal(c, 0, 'no revisions');
			return User.update({name: 'updated-foo'}, {where: {}});
		})
		.then(() => UserRevision.count())
		.then(c => {
			t.equal(c, 2, 'all updates accounted for');
		})
		.catch(err => console.error(err));
});

test('bulk updates: should revert under transactions', t => {
	let trans = null;
	let opts = null;
	t.plan(3);

	return freshDb()
		.then(() => sequelize.transaction())
		.then(t => {
			trans = t;
			opts = {transaction: trans};
			return User.bulkCreate([{name: 'foo1'}, {name: 'foo2'}], opts);
		})
		.then(() => UserRevision.count(opts))
		.then(c => {
			t.equal(c, 0, 'no revisions');
			return User.update({name: 'updated-foo'}, {where: {}, transaction: trans});
		})
		.then(() => UserRevision.count(opts))
		.then(c => {
			t.equal(c, 2, 'transaction revisions');
		})
		.then(() => trans.rollback())
		.then(() => UserRevision.count())
		.then(c => {
			t.equal(c, 0, 'no revisions post-rollback');
		})
		.catch(err => console.error(err));
});

test('bulk destroy/truncate: should archive every entry', t => {
	t.plan(2);

	return freshDb()
		.then(() => User.bulkCreate([{name: 'foo1'}, {name: 'foo2'}]))
		.then(() => UserRevision.count())
		.then(c => {
			t.equal(c, 0, 'no revisions');
			return User.destroy({where: {}, truncate: true});
		})
		.then(() => UserRevision.count())
		.then(c => {
			t.equal(c, 2, 'destroy revisions');
		})
		.catch(err => console.error(err));
});

test('bulk destroy/truncate: should revert under transactions', t => {
	let trans = null;
	let opts = null;
	t.plan(3);

	return freshDb()
		.then(() => sequelize.transaction())
		.then(t => {
			trans = t;
			opts = {transaction: trans};
			return User.bulkCreate([{name: 'foo1'}, {name: 'foo2'}], opts);
		})
		.then(() => UserRevision.count(opts))
		.then(c => {
			t.equal(c, 0, 'no revisions');
			return User.destroy({where: {}, truncate: true, transaction: trans});
		})
		.then(() => UserRevision.count(opts))
		.then(c => {
			t.equal(c, 2, 'destroy revisions');
		})
		.then(() => trans.rollback())
		.then(() => UserRevision.count())
		.then(c => {
			t.equal(c, 0, 'no revisions post-rollback');
		})
		.catch(err => console.error(err));
});

test('read-only: update', t => {
	t.plan(1);

	return freshDb()
		.then(() => UserRevision.create({name: 't'}))
		.then(ur => ur.update({name: 'i'}))
		.catch(() => t.ok(true, 'threw error appropriately'));
});

test('read-only: destroy', t => {
	t.plan(1);

	return freshDb()
		.then(() => UserRevision.create())
		.then(ur => ur.destroy())
		.then(() => {})
		.catch(() => t.ok(true, 'threw error appropriately'));
});

test('interference: shouldn\'t delete instance methods', t => {
	t.plan(2);
	let Fruit = null;

	return freshDb()
		.then(() => {
			sequelize.define('Fruit', {name: Sequelize.TEXT});
			Fruit = sequelize.models.Fruit;
			Fruit.prototype.sayHi = () => {
				return 2;
			};
			return sequelize.sync();
		})
		.then(() => {
			revisionTracker(Fruit, sequelize);
			return Fruit.create({name: 'test'});
		})
		.then(f => {
			t.equal(typeof f.sayHi, 'function', 'instance method is function');
			t.equal(f.sayHi(), 2, 'instance method is unaltered');
		})
		.catch(err => console.error(err));
});

test('interference: shouldn\'t interfere with hooks', t => {
	t.plan(1);
	let triggered = 0;

	return freshDb()
		.then(() => {
			revisionTracker(sequelize.define('Fruit',
				{name: Sequelize.TEXT},
				{hooks: {beforeCreate() {
					triggered++;
				}}}), sequelize);

			return sequelize.sync();
		})
		.then(() => sequelize.models.Fruit.create({name: 'test'}))
		.then(() => {
			t.equal(triggered, 1, 'hook fired properly');
		})
		.catch(err => console.error(err));
});

test('interference: shouldn\'t interfere with setters', t => {
	t.plan(1);
	let triggered = 0;

	return freshDb()
		.then(() => {
			revisionTracker(sequelize.define('Fruit', {
				name: {
					type: Sequelize.TEXT,
					set() {
						triggered++;
					}
				}
			}), sequelize);

			return sequelize.sync();
		})
		.then(() => sequelize.models.Fruit.create({name: 'test'}))
		.then(() => {
			t.equal(triggered, 1, 'setter fired properly');
		})
		.catch(err => console.error(err));
});

test('factories: all factory', t => {
	t.plan(2);

	sequelize = new Sequelize('', '', '', {
		dialect: 'sqlite',
		logging: false,
		operatorsAliases: false,
		storage: path.join(__dirname, 'test.sqlite')
	});

	sequelize.define('Cat', {name: Sequelize.TEXT});
	sequelize.define('Dog', {name: Sequelize.TEXT});
	const instances = revisionTracker.all(sequelize);

	t.equal(Object.keys(sequelize.models).length, 4, 'all 4 tracking instances created');
	t.equal(Object.keys(instances).length, 2, 'all 2 tracking instances created');
});
