const Joi = require('joi');

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }
    next();
  };
};

const schemas = {
  register: Joi.object({
    username: Joi.string().alphanum().min(3).max(50).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required()
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  message: Joi.object({
    content: Joi.string().min(1).max(500).required()
  }),

  joinQueue: Joi.object({
    category: Joi.string().valid('jogos', 'series', 'filmes').required()
  })
};

module.exports = {
  validate,
  schemas
};