const validator = require('@app-core/validator');
const { appLogger } = require('@app-core/logger');
const PaymentMessages = require('@app/messages/payment');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');

// VSL spec
const spec = `root {
  accounts[] {
    id string<trim>
    balance number
    currency string<trim|uppercase|length:3>
  }
  instruction string<trim>
}`;

const parsedSpec = validator.parse(spec);

// Supported currencies
const SUPPORTED = ['NGN', 'USD', 'GBP', 'GHS'];

/* ---------------------------
   Helpers
--------------------------- */

function normalizeSpacesNoRegex(s) {
  if (typeof s !== 'string') return s;
  let out = s.replace('\r', ' ').replace('\n', ' ').replace('\t', ' ');
  while (out.indexOf('  ') !== -1) out = out.replace('  ', ' ');
  return out.trim();
}

function tokenize(str) {
  if (!str) return [];
  return str.split(' ').filter(Boolean);
}

function isIntegerStringPositive(nStr) {
  if (!nStr || typeof nStr !== 'string') return false;
  if (nStr.indexOf('.') !== -1 || nStr.indexOf('-') !== -1) return false;
  for (let i = 0; i < nStr.length; i++) {
    const c = nStr[i];
    if (c < '0' || c > '9') return false;
  }
  return Number(nStr) > 0;
}

function isValidAccountId(id) {
  if (!id || typeof id !== 'string') return false;
  for (let i = 0; i < id.length; i++) {
    const ch = id[i];
    const code = ch.charCodeAt(0);
    const num = code >= 48 && code <= 57;
    const up = code >= 65 && code <= 90;
    const low = code >= 97 && code <= 122;
    const dash = ch === '-';
    const dot = ch === '.';
    const at = ch === '@';
    if (!(num || up || low || dash || dot || at)) return false;
  }
  return true;
}

function isValidDateFormatYYYYMMDD(d) {
  if (!d || typeof d !== 'string') return false;
  const parts = d.split('-');
  if (parts.length !== 3) return false;
  const [ys, ms, ds] = parts;
  if (ys.length !== 4 || ms.length !== 2 || ds.length !== 2) return false;

  for (const ch of ys) if (ch < '0' || ch > '9') return false;
  for (const ch of ms) if (ch < '0' || ch > '9') return false;
  for (const ch of ds) if (ch < '0' || ch > '9') return false;

  const y = Number(ys);
  const m = Number(ms);
  const dnum = Number(ds);
  if (m < 1 || m > 12) return false;

  const mdays = [
    31,
    (isLeapYear(y) ? 29 : 28),
    31, 30, 31, 30, 31,
    31, 30, 31, 30, 31
  ];
  return dnum >= 1 && dnum <= mdays[m - 1];
}

function isLeapYear(y) {
  if (y % 400 === 0) return true;
  if (y % 100 === 0) return false;
  return y % 4 === 0;
}

function compareDateToUTC(d) {
  const [yy, mm, dd] = d.split('-').map(Number);
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const day = now.getUTCDate();

  if (yy < y) return -1;
  if (yy > y) return 1;
  if (mm < m) return -1;
  if (mm > m) return 1;
  if (dd < day) return -1;
  if (dd > day) return 1;
  return 0;
}

function buildAccountsResponseFromRequest(requestAccounts, debitId, creditId, debitBefore, creditBefore, updatedMap) {
  const out = [];
  for (const a of requestAccounts) {
    if (a.id === debitId || a.id === creditId) {
      const before = updatedMap?.[a.id]?.balance_before ?? a.balance;
      const after = updatedMap?.[a.id]?.balance ?? a.balance;
      out.push({
        id: a.id,
        balance: after,
        balance_before: before,
        currency: a.currency?.toUpperCase(),
      });
    }
  }
  return out;
}

/* ---------------------------
   Main Service
--------------------------- */

async function parseInstruction(serviceData, options = {}) {
  let response;

  const data = validator.validate(serviceData, parsedSpec);

  try {
    const raw = data.instruction;
    const normalized = normalizeSpacesNoRegex(raw);
    const upper = normalized.toUpperCase();

    let execute_by = null;
    let instructionMain = normalized;

    const ON_MARK = ' ON ';
    const idx = upper.indexOf(ON_MARK);
    if (idx !== -1) {
      const datePart = normalized.substring(idx + ON_MARK.length).trim();
      execute_by = datePart.split(' ')[0];
      instructionMain = normalized.substring(0, idx).trim();
    }

    const tokens = tokenize(instructionMain.toUpperCase());
    const rawTokens = tokenize(instructionMain);

    if (tokens.length === 0) {
      return {
        type: null, amount: null, currency: null,
        debit_account: null, credit_account: null, execute_by: null,
        status: 'failed',
        status_reason: PaymentMessages.MALFORMED_INSTRUCTION,
        status_code: 'SY03',
        accounts: []
      };
    }

    let type = null;
    let amount = null;
    let currency = null;
    let debit_account = null;
    let credit_account = null;

    const first = tokens[0];

    /* ---------------------------
         DEBIT branch
    --------------------------- */
    if (first === 'DEBIT') {
      if (tokens.length < 3) {
        return {
          type: 'DEBIT',
          amount: null, currency: null,
          debit_account: null, credit_account: null, execute_by,
          status: 'failed',
          status_reason: PaymentMessages.MISSING_KEYWORD,
          status_code: 'SY01',
          accounts: []
        };
      }

      const amtStr = rawTokens[1] || '';
      if (!isIntegerStringPositive(amtStr)) {
        return {
          type: 'DEBIT',
          amount: null, currency: null,
          debit_account: null, credit_account: null, execute_by,
          status: 'failed',
          status_reason: PaymentMessages.INVALID_AMOUNT,
          status_code: 'AM01',
          accounts: []
        };
      }
      amount = Number(amtStr);

      currency = rawTokens[2]?.toUpperCase() || null;
      if (!SUPPORTED.includes(currency)) {
        return {
          type: 'DEBIT',
          amount, currency,
          debit_account: null, credit_account: null, execute_by,
          status: 'failed',
          status_reason: PaymentMessages.UNSUPPORTED_CURRENCY,
          status_code: 'CU02',
          accounts: []
        };
      }

      const fromIdx = tokens.indexOf('FROM');
      const forIdx = tokens.indexOf('FOR');

      if (fromIdx === -1 || forIdx === -1 || fromIdx <= 2 || forIdx <= fromIdx) {
        return {
          type: 'DEBIT',
          amount, currency,
          debit_account: null, credit_account: null, execute_by,
          status: 'failed',
          status_reason: PaymentMessages.MISSING_KEYWORD,
          status_code: 'SY01',
          accounts: []
        };
      }

      if (tokens[fromIdx + 1] !== 'ACCOUNT') {
        return {
          type: 'DEBIT',
          amount, currency,
          debit_account: null, credit_account: null, execute_by,
          status: 'failed',
          status_reason: PaymentMessages.INVALID_KEYWORD_ORDER,
          status_code: 'SY02',
          accounts: []
        };
      }

      const debitId = rawTokens[fromIdx + 2]?.trim();
      if (!isValidAccountId(debitId)) {
        return {
          type: 'DEBIT',
          amount, currency,
          debit_account: null, credit_account: null, execute_by,
          status: 'failed',
          status_reason: PaymentMessages.INVALID_ACCOUNT_ID,
          status_code: 'AC04',
          accounts: []
        };
      }
      debit_account = debitId;

      if (
        tokens[forIdx + 1] !== 'CREDIT' ||
        tokens[forIdx + 2] !== 'TO' ||
        tokens[forIdx + 3] !== 'ACCOUNT'
      ) {
        return {
          type: 'DEBIT',
          amount, currency,
          debit_account, credit_account: null, execute_by,
          status: 'failed',
          status_reason: PaymentMessages.INVALID_KEYWORD_ORDER,
          status_code: 'SY02',
          accounts: buildAccountsResponseFromRequest(data.accounts, debit_account, null, null, null, null)
        };
      }

      const creditId = rawTokens[forIdx + 4]?.trim();
      if (!isValidAccountId(creditId)) {
        return {
          type: 'DEBIT',
          amount, currency,
          debit_account, credit_account: null, execute_by,
          status: 'failed',
          status_reason: PaymentMessages.INVALID_ACCOUNT_ID,
          status_code: 'AC04',
          accounts: buildAccountsResponseFromRequest(data.accounts, debit_account, null, null, null, null)
        };
      }
      credit_account = creditId;

      type = 'DEBIT';
    }

    /* ---------------------------
         CREDIT branch
    --------------------------- */
    else if (first === 'CREDIT') {
      if (tokens.length < 3) {
        return {
          type: 'CREDIT',
          amount: null, currency: null,
          debit_account: null, credit_account: null, execute_by,
          status: 'failed',
          status_reason: PaymentMessages.MISSING_KEYWORD,
          status_code: 'SY01',
          accounts: []
        };
      }

      const amtStr = rawTokens[1] || '';
      if (!isIntegerStringPositive(amtStr)) {
        return {
          type: 'CREDIT',
          amount: null, currency: null,
          debit_account: null, credit_account: null, execute_by,
          status: 'failed',
          status_reason: PaymentMessages.INVALID_AMOUNT,
          status_code: 'AM01',
          accounts: []
        };
      }
      amount = Number(amtStr);

      currency = rawTokens[2]?.toUpperCase() || null;
      if (!SUPPORTED.includes(currency)) {
        return {
          type: 'CREDIT',
          amount, currency,
          debit_account: null, credit_account: null, execute_by,
          status: 'failed',
          status_reason: PaymentMessages.UNSUPPORTED_CURRENCY,
          status_code: 'CU02',
          accounts: []
        };
      }

      const toIdx = tokens.indexOf('TO');
      const forIdx = tokens.indexOf('FOR');

      if (toIdx === -1 || forIdx === -1 || toIdx <= 2 || forIdx <= toIdx) {
        return {
          type: 'CREDIT',
          amount, currency,
          debit_account: null, credit_account: null, execute_by,
          status: 'failed',
          status_reason: PaymentMessages.MISSING_KEYWORD,
          status_code: 'SY01',
          accounts: []
        };
      }

      if (tokens[toIdx + 1] !== 'ACCOUNT') {
        return {
          type: 'CREDIT',
          amount, currency,
          debit_account: null, credit_account: null, execute_by,
          status: 'failed',
          status_reason: PaymentMessages.INVALID_KEYWORD_ORDER,
          status_code: 'SY02',
          accounts: []
        };
      }

      const creditId = rawTokens[toIdx + 2]?.trim();
      if (!isValidAccountId(creditId)) {
        return {
          type: 'CREDIT',
          amount, currency,
          debit_account: null, credit_account: null, execute_by,
          status: 'failed',
          status_reason: PaymentMessages.INVALID_ACCOUNT_ID,
          status_code: 'AC04',
          accounts: []
        };
      }
      credit_account = creditId;

      if (
        tokens[forIdx + 1] !== 'DEBIT' ||
        tokens[forIdx + 2] !== 'FROM' ||
        tokens[forIdx + 3] !== 'ACCOUNT'
      ) {
        return {
          type: 'CREDIT',
          amount, currency,
          debit_account: null, credit_account, execute_by,
          status: 'failed',
          status_reason: PaymentMessages.INVALID_KEYWORD_ORDER,
          status_code: 'SY02',
          accounts: buildAccountsResponseFromRequest(data.accounts, null, credit_account, null, null, null)
        };
      }

      const debitId = rawTokens[forIdx + 4]?.trim();
      if (!isValidAccountId(debitId)) {
        return {
          type: 'CREDIT',
          amount, currency,
          debit_account: null, credit_account, execute_by,
          status: 'failed',
          status_reason: PaymentMessages.INVALID_ACCOUNT_ID,
          status_code: 'AC04',
          accounts: buildAccountsResponseFromRequest(data.accounts, null, credit_account, null, null, null)
        };
      }
      debit_account = debitId;

      type = 'CREDIT';
    }

    /* Unknown first keyword */
    else {
      return {
        type: null, amount: null, currency: null,
        debit_account: null, credit_account: null,
        execute_by: null,
        status: 'failed',
        status_reason: PaymentMessages.MALFORMED_INSTRUCTION,
        status_code: 'SY03',
        accounts: []
      };
    }

    /* ---------------------------
         DATE validation
    --------------------------- */

    if (execute_by !== null) {
      if (!isValidDateFormatYYYYMMDD(execute_by)) {
        return {
          type, amount, currency,
          debit_account, credit_account, execute_by,
          status: 'failed',
          status_reason: PaymentMessages.INVALID_DATE_FORMAT,
          status_code: 'DT01',
          accounts: buildAccountsResponseFromRequest(data.accounts, debit_account, credit_account, null, null, null)
        };
      }
    }

    /* ---------------------------
         ACCOUNT lookups
    --------------------------- */

    const reqAcc = data.accounts;
    const dAcc = reqAcc.find(a => a.id === debit_account);
    const cAcc = reqAcc.find(a => a.id === credit_account);

    if (!dAcc || !cAcc) {
      return {
        type, amount, currency,
        debit_account, credit_account, execute_by,
        status: 'failed',
        status_reason: PaymentMessages.ACCOUNT_NOT_FOUND,
        status_code: 'AC03',
        accounts: buildAccountsResponseFromRequest(data.accounts, debit_account, credit_account, null, null, null)
      };
    }

    if (dAcc.currency.toUpperCase() !== cAcc.currency.toUpperCase()) {
      return {
        type, amount, currency,
        debit_account, credit_account, execute_by,
        status: 'failed',
        status_reason: PaymentMessages.ACCOUNT_CURRENCY_MISMATCH,
        status_code: 'CU01',
        accounts: buildAccountsResponseFromRequest(data.accounts, debit_account, credit_account, null, null, null)
      };
    }

    if (currency !== dAcc.currency.toUpperCase()) {
      return {
        type, amount, currency,
        debit_account, credit_account, execute_by,
        status: 'failed',
        status_reason: PaymentMessages.ACCOUNT_CURRENCY_MISMATCH,
        status_code: 'CU01',
        accounts: buildAccountsResponseFromRequest(data.accounts, debit_account, credit_account, null, null, null)
      };
    }

    if (debit_account === credit_account) {
      return {
        type, amount, currency,
        debit_account, credit_account, execute_by,
        status: 'failed',
        status_reason: PaymentMessages.SAME_ACCOUNT_ERROR,
        status_code: 'AC02',
        accounts: buildAccountsResponseFromRequest(data.accounts, debit_account, credit_account, null, null, null)
      };
    }

    /* ---------------------------
         PENDING (future date)
    --------------------------- */

    if (execute_by !== null && compareDateToUTC(execute_by) === 1) {
      return {
        type, amount, currency,
        debit_account, credit_account, execute_by,
        status: 'pending',
        status_reason: PaymentMessages.TRANSACTION_PENDING,
        status_code: 'AP02',
        accounts: buildAccountsResponseFromRequest(data.accounts, debit_account, credit_account, null, null, null)
      };
    }

    /* ---------------------------
         FUNDS
    --------------------------- */

    if (amount > dAcc.balance) {
      return {
        type, amount, currency,
        debit_account, credit_account, execute_by,
        status: 'failed',
        status_reason: PaymentMessages.INSUFFICIENT_FUNDS,
        status_code: 'AC01',
        accounts: buildAccountsResponseFromRequest(data.accounts, debit_account, credit_account, null, null, null)
      };
    }

    /* ---------------------------
         EXECUTE transaction
    --------------------------- */

    const beforeD = dAcc.balance;
    const beforeC = cAcc.balance;

    dAcc.balance -= amount;
    cAcc.balance += amount;

    const updatedMap = {
      [dAcc.id]: { balance_before: beforeD, balance: dAcc.balance },
      [cAcc.id]: { balance_before: beforeC, balance: cAcc.balance },
    };

    response = {
      type,
      amount,
      currency,
      debit_account,
      credit_account,
      execute_by,
      status: 'successful',
      status_reason: PaymentMessages.TRANSACTION_SUCCESSFUL,
      status_code: 'AP00',
      accounts: buildAccountsResponseFromRequest(data.accounts, debit_account, credit_account, beforeD, beforeC, updatedMap)
    };

  } catch (err) {
    appLogger.errorX(err, 'parse-instruction-internal-error');
    response = {
      type: null, amount: null, currency: null,
      debit_account: null, credit_account: null, execute_by: null,
      status: 'failed',
      status_reason: PaymentMessages.MALFORMED_INSTRUCTION,
      status_code: 'SY03',
      accounts: []
    };
  }

  return response;
}

module.exports = parseInstruction;
