'use strict';

const cloneDeep = require('lodash/cloneDeep');
const merge = require('lodash/merge');

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
 * @param {string} options.authorFieldName - String to indicate a field name to store author of the revisions, or null to disable
 * @param {string} options.modelSuffix - String to append to tracked model's name when creating name of tracking model
 * @param {array} options.excludedAttributes - Array of attributes to be ignored and excluded when recording a change to the target model
 * @param {array} options.excludedAttributeProperties - Array of attribute properties to ignore when duplicating the target model's attributes
 * @return {null}
 */
class SequelizeHistory {
	constructor(model, sequelize, options) {
		this.options = Object.assign({},
			SequelizeHistory.DEFAULTS,
			options || {});

		this.model = model;

		// Create name of tracking model by appending
		// suffice option to the tracked model name
		this.modelName = [
			this.model.name,
			this.options.modelSuffix
		].join('');

		// Create the tracking model's schema
		this.fields = this.createSchema(
			sequelize.Sequelize);

		// Register the tracking model with Sequelize
		sequelize.define(
			this.modelName,
			this.setAttributes(),
			{});

		// Store reference to the newly created tracking model
		this.modelHistory = sequelize.models[this.modelName];

		// Add static author tracking method to original model if enabled
		if (typeof this.options.authorFieldName === 'string') {
			this.addModelAuthorSetter(sequelize);

			// Add relationship with the original model to ensure
			// table constraints are not applied if added manually
			this.model.hasMany(this.modelHistory, {
				foreignKey: 'modelId',
				contraints: false,
				as: 'revisions'
			});

			this.modelHistory.belongsTo(this.model, {
				foreignKey: 'modelId',
				contraints: false,
				as: 'model'
			});
		}

		// Setup the necessary hooks for revision tracking
		this.hookup();
	}

	/**
	 * Adds a static `setRevisingAuthor` method to the tracked model if author tracking is enabled.
	 * @private
	 * @param {Sequelize} sequelize - The passed Sequelize instance
	 */
	addModelAuthorSetter(sequelize) {
		const modelName = this.model.name;

		sequelize.models[modelName].setRevisingAuthor = function (value) {
			sequelize.models[modelName]._sequelizeHistoryProps = {
				_authorId: value
			};
		};
	}

	/**
	 * Sets attributes of history model by parsing out target model attributes
	 * @private
	 * @return {object}
	 */
	setAttributes() {
		const cloned = cloneDeep(this.model.rawAttributes);

		const attributes = [];

		Object.keys(cloned).forEach(field => {
			const f = cloned[field];

			// If attribute should be excluded, skip...
			if (this.options.excludedAttributes.indexOf(f.fieldName) > -1) {
				return;
			}

			// Skip the id attribute...
			if (f.fieldName === 'id') {
				return;
			}

			// Remove any attribute properties that should be excluded...
			this.options.excludedAttributeProperties.forEach(prop => {
				if (typeof f[prop] !== 'undefined') {
					delete f[prop];
				}
			});

			// Remove the default behavior of auto-updating the timestamps...
			if (f.fieldName === 'createdAt' ||
				f.fieldName === 'updatedAt') {
				delete f.defaultValue;
			}

			// Allow all fields to be NULL...
			f.allowNull = true;

			// And store the modified attribute
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
		const schema = {
			id: {
				type: sequelize.INTEGER,
				autoIncrement: true,
				primaryKey: true,
				unique: true
			},
			modelId: {
				type: sequelize.INTEGER,
				allowNull: true
			},
			archivedAt: {
				type: sequelize.DATE,
				defaultValue: sequelize.NOW,
				allowNull: false
			}
		};

		// Add our author tracking field if set
		if (typeof this.options.authorFieldName === 'string') {
			schema[this.options.authorFieldName] = {
				type: sequelize.INTEGER,
				allowNull: true
			};
		}

		return schema;
	}

	/**
	 * Attaches hooks to target model and history model
	 * @private
	 * @return {null}
	 */
	hookup() {
		this.model.addHook('beforeUpdate', this.insertHook.bind(this));
		this.model.addHook('beforeDestroy', this.insertHook.bind(this));
		this.model.addHook('beforeUpsert', this.insertHook.bind(this));
		this.model.addHook('beforeBulkUpdate', this.insertBulkHook.bind(this));
		this.model.addHook('beforeBulkDestroy', this.insertBulkHook.bind(this));
		this.modelHistory.addHook('beforeUpdate', this.readOnlyHook.bind(this));
		this.modelHistory.addHook('beforeDestroy', this.readOnlyHook.bind(this));
		this.modelHistory.addHook('beforeUpsert', this.readOnlyHook.bind(this));
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

		// for upsert action - if id is null which means insert, return null. create history record only for update
		if (!dataValues.id){
			return null;
		}

		dataValues.modelId = dataValues.id;

		// Grab the static revision author property from the tracked class
		// and null it out after its first use when called via an instance
		if (typeof this.options.authorFieldName === 'string' &&
			typeof this.model._sequelizeHistoryProps !== 'undefined') {
			dataValues[this.options.authorFieldName] = this.model._sequelizeHistoryProps._authorId;
			this.model._sequelizeHistoryProps._authorId = null;
		}

		delete dataValues.id;

		return this.modelHistory.create(dataValues, {
			transaction: options.transaction
		});
	}

	/**
	 * Hook to trigger recording of multiple revision
	 * @param  {object} options - options
	 * @return {Promise} = resolves
	 */
	insertBulkHook(options) {
		if (!options.individualHooks) {
			return this.model.findAll({
				where: options.where,
				transaction: options.transaction
			}).then(hits => {
				if (hits !== null) {
					const docs = hits.map(hit => {
						const dataSet = cloneDeep(hit.dataValues);

						// Grab the static revision author property from the tracked class
						if (typeof this.options.authorFieldName === 'string' &&
							typeof this.model._sequelizeHistoryProps !== 'undefined') {
							dataSet[this.options.authorFieldName] = this.model._sequelizeHistoryProps._authorId;
						}

						dataSet.modelId = hit.id;
						delete dataSet.id;
						return dataSet;
					});

					// ...and null it out after all bulk updates are complete
					if (typeof this.options.authorFieldName === 'string' &&
						typeof this.model._sequelizeHistoryProps !== 'undefined') {
						this.model._sequelizeHistoryProps._authorId = null;
					}

					return this.modelHistory.bulkCreate(docs, {
						transaction: options.transaction
					});
				}
			});
		}
	}
}

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
 * @param {string} options.authorFieldName - String to indicate a field name to store author of the revisions, or null to disable
 * @param {string} options.modelSuffix - String to append to tracked model's name when creating name of tracking model
 * @param {array} options.excludedAttributes - Array of attributes to be ignored and excluded when recording a change to the target model
 * @param {array} options.excludedAttributeProperties - Array of attribute properties to ignore when duplicating the target model's attributes
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
 * @param {string} options.authorFieldName - String to indicate a field name to store author of the revisions, or null to disable
 * @param {string} options.modelSuffix - String to append to tracked model's name when creating name of tracking model
 * @param {array} options.excludedAttributes - Array of attributes to be ignored and excluded when recording a change to the target model
 * @param {array} options.excludedAttributeProperties - Array of attribute properties to ignore when duplicating the target model's attributes
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
