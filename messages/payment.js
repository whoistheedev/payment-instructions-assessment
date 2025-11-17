// messages/payment.js
const PaymentMessages = {
  // Syntax / parsing
  MISSING_KEYWORD: 'Missing required keyword(s) in instruction',
  INVALID_KEYWORD_ORDER: 'Invalid keyword order in instruction',
  MALFORMED_INSTRUCTION: 'Malformed instruction: unable to parse keywords',

  // Amount
  INVALID_AMOUNT: 'Amount must be a positive integer',

  // Currency
  UNSUPPORTED_CURRENCY: 'Unsupported currency. Only NGN, USD, GBP, and GHS are supported',
  ACCOUNT_CURRENCY_MISMATCH: 'Account currency mismatch',

  // Accounts
  ACCOUNT_NOT_FOUND: 'Account not found',
  INVALID_ACCOUNT_ID: 'Invalid account ID format',
  SAME_ACCOUNT_ERROR: 'Debit and credit accounts cannot be the same',
  INSUFFICIENT_FUNDS: 'Insufficient funds in debit account',

  // Date
  INVALID_DATE_FORMAT: 'Invalid date format. Expect YYYY-MM-DD',

  // Execution
  TRANSACTION_SUCCESSFUL: 'Transaction executed successfully',
  TRANSACTION_PENDING: 'Transaction scheduled for future execution',

  // Codes (human readable mapping)
  CODES: {
    AM01: 'Amount must be a positive integer',
    CU01: 'Account currency mismatch',
    CU02: 'Unsupported currency',
    AC01: 'Insufficient funds in debit account',
    AC02: 'Debit and credit accounts cannot be the same',
    AC03: 'Account not found',
    AC04: 'Invalid account ID format',
    DT01: 'Invalid date format',
    SY01: 'Missing required keyword',
    SY02: 'Invalid keyword order',
    SY03: 'Malformed instruction',
    AP00: 'Transaction executed successfully',
    AP02: 'Transaction scheduled for future execution',
  },
};

module.exports = PaymentMessages;
