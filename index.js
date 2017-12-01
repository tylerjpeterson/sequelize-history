'use strict';

const cloneDeep = require('lodash/cloneDeep');
const merge = require('lodash/merge');
const map = require('lodash/map');

/**
 * @class
 * SequelizeHistory
 *
 * @classdesc
 * Creates a revision history for instances of a given Sequelize model
 *
 * @constructor
 * @description
 * The constructor parses passed options, attaches hooks
 *
 * @param {object} model - Sequelize model to track
 * @param {object} sequelize - Sequelize object (enforces installation above this module)
 * @param {object} options - Object instantiation options
 * @param {string} options.modelSuffix - String to append to tracked model's name when creating name of tracking model
 * @param {array} options.excludedAttributes - Collection of attributes to be excluded when creating history model from the target model
 * @param {array} options.excludedNames - Collection of options to filter out when creating history model from the target model
 * @return {null}
 */
class SequelizeHistory {
	constructor(model, sequelize, options) {
		this.options = Object.assign({},
			SequelizeHistory.DEFAULTS,
			options || {});

		this.model = model;

		this.modelName = [
			this.model.name,
			this.options.modelSuffix
		].join('');

		this.fields = this.createSchema(
			sequelize.Sequelize);

		const modelOptions = this.excludeAttributes(
			this.model.options,
			this.options.excludedNames);

		this.historyOptions = merge({},
			modelOptions, {timestamps: false});

		sequelize.define(
			this.modelName,
			this.setAttributes(),
			this.historyOptions);

		this.modelHistory = sequelize.models[this.modelName];

		this.hookup();
	}

	/**
	 * Sets attributes of history model by parsing out target model attributes
	 * @private
	 * @return {object}
	 */
	setAttributes() {
		const attributes = [];
		const cloned = cloneDeep(this.model.rawAttributes);

		Object.keys(cloned).forEach(field => {
			const f = this.excludeAttributes(
				cloned[field],
				this.options.excludedAttributes);

			if (f.fieldName === 'createdAt' ||
				f.fieldName === 'updatedAt') {
				delete f.defaultValue;
				f.allowNull = true;
			}

			if (f.fieldName === 'id') {
				f.allowNull = true;
			}

			attributes[field] = f;
		});

		return merge({}, this.fields, attributes);
	}

	/**
	 * Creates fields to be added in addition to the tracked model's fields
	 * @private
	 * @return {object} - Model instance field options
	 */
	createSchema(sequelize) {
		return {
			revisionId: {
				type: sequelize.INTEGER,
				autoIncrement: true,
				primaryKey: true,
				unique: true
			},
			archivedAt: {
				type: sequelize.DATE,
				defaultValue: sequelize.NOW,
				allowNull: false
			}
		};
	}

	/**
	 * Attaches hooks to target model and history model
	 * @private
	 * @return {null}
	 */
	hookup() {
		this.model.hook('beforeUpdate', this.insertHook.bind(this));
		this.model.hook('beforeDestroy', this.insertHook.bind(this));
		this.model.hook('beforeBulkUpdate', this.insertBulkHook.bind(this));
		this.model.hook('beforeBulkDestroy', this.insertBulkHook.bind(this));
		this.modelHistory.hook('beforeUpdate', this.readOnlyHook.bind(this));
		this.modelHistory.hook('beforeDestroy', this.readOnlyHook.bind(this));
	}

	/**
	 * Enforces read-only nature of history model instances
	 * @private
	 * @return {null}
	 */
	readOnlyHook() {
		throw new Error('This is a read-only history database. You cannot modify it.');
	}

	/**
	 * Hook to trigger recording of revision
	 * @private
	 * @param  {Sequelize.Model} doc - instance to track
	 * @param  {object} options - instance options
	 * @return {Sequelize.Model} - Instance representing the revision
	 */
	insertHook(doc, options) {
		const dataValues = doc._previousDataValues || doc.dataValues;

		const historyRecord = this.modelHistory.create(dataValues, {
			transaction: options.transaction
		});

		return historyRecord;
	}

	/**
	 * Hook to trigger recording of multiple revision
	 * @param  {object} options - options
	 * @return {Promise} = resolves
	 */
	insertBulkHook(options) {
		if (!options.individualHooks) {
			const queryAll = this.model.findAll({
				where: options.where,
				transaction: options.transaction
			}).then(hits => {
				if (hits !== null) {
					hits = map(hits, 'dataValues');

					return this.modelHistory.bulkCreate(hits, {
						transaction: options.transaction
					});
				}
			});

			return queryAll;
		}
	}

	/**
	 * Remove unwanted attributes when copying source model
	 * @private
	 * @param  {object} field [description]
	 * @param  {array} attrs [description]
	 * @return {object}       [description]
	 */
	excludeAttributes(field, attrs) {
		const f = cloneDeep(field);

		attrs.forEach(attr => {
			if (typeof f[attr] !== 'undefined') {
				delete f[attr];
			}
		});

		return f;
	}
}

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

/**
 * Factory method for creation without requiring the constructor
 *
 * @module
 * TrackFactory
 *
 * @description
 * Factory method to avoid having to deal with the constructor directly
 * since you're likely applying this to more than one model. All constructor
 * options are passed transparently upon instantiation.
 *
 * @param {object} model - Sequelize model to track
 * @param {object} sequelize - Sequelize object (enforces installation above this module)
 * @param {object} options - Object instantiation options
 * @param {string} options.modelSuffix - String to append to tracked model's name when creating name of tracking model
 * @param {array} options.excludedAttributes - Collection of attributes to be excluded when creating history model from the target model
 * @param {array} options.excludedNames - Collection of options to filter out when creating history model from the target model
 * @return {object} - returns the tracked model and generated tracking model
 */
module.exports = (model, sequelize, options) => {
	const instance = new SequelizeHistory(
		model, sequelize, options);

	return instance.modelHistory;
};

/**
 * Factory method to track changes for all sequelize models
 *
 * @module
 * TrackAllFactory
 *
 * @description
 * Convenience factory method to track changes for all models found
 * within the passed sequelize instance. All constructor options
 * are passed transparently upon instantiation.
 *
 * @param {object} sequelize - Sequelize object (enforces installation above this module)
 * @param {object} options - Object instantiation options
 * @param {string} options.modelSuffix - String to append to tracked model's name when creating name of tracking model
 * @param {array} options.excludedAttributes - Collection of attributes to be excluded when creating history model from the target model
 * @param {array} options.excludedNames - Collection of options to filter out when creating history model from the target model
 * @return {null}
 */
module.exports.all = (sequelize, options) => {
	const instances = {};
	const names = Object.keys(sequelize.models);

	names.forEach(key => {
		const instance = new SequelizeHistory(
			sequelize.models[key], sequelize, options);

		instances[instance.modelName] = instance;
	});

	return instances;
};

module.exports.SequelizeHistory = SequelizeHistory;
