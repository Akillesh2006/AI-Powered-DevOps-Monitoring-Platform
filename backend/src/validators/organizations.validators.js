const Joi = require('joi');

const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;

const updateOrganizationBodySchema = Joi.object({
  name: Joi.string().strict().trim().min(2).max(100).optional(),
  notificationDefaults: Joi.object({
    alertEmailRecipients: Joi.array().items(
      Joi.string().strict().pattern(emailRegex).required()
    ).required()
  }).unknown(true).optional()
}).unknown(true);

module.exports = {
  body: updateOrganizationBodySchema
};
