module.exports = {
  ...require('./authentication'),
  ...require('./identity-management'),
  PaymentMessages: require('./payment'),
};
