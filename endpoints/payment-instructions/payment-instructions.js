// endpoints/payment-instructions/payment-instructions.js

const { createHandler } = require('@app-core/server');
const parseInstruction = require('@app/services/payment-processor/parse-instruction');

module.exports = createHandler({
  path: '/payment-instructions',
  method: 'post',
  middlewares: [],

  async handler(rc, helpers) {
    const payload = { ...rc.body };

    const result = await parseInstruction(payload);

    // Success or Pending → 200
    if (result.status === 'successful' || result.status === 'pending') {
      return {
        status: helpers.http_statuses.HTTP_200_OK,
        message: result.status_reason,
        data: result,
      };
    }

    // Failed → 400
    return {
      status: helpers.http_statuses.HTTP_400_BAD_REQUEST,
      message: result.status_reason || 'Instruction processing failed',
      data: result,
    };
  },
});
