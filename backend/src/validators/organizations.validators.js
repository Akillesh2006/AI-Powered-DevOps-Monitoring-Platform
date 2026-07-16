const Joi = require('joi');

const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;

const updateOrganizationBodySchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional(),
  notificationDefaults: Joi.object({
    alertEmailRecipients: Joi.array().items(
      Joi.string().pattern(emailRegex).required()
    ).required()
  }).optional()
});

module.exports = {
  body: updateOrganizationBodySchema
};
