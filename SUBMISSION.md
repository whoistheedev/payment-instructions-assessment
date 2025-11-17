Payment Instruction Parser — Assessment Submission

This repository contains my implementation of the Payment Instruction Parser & Executor, built using the official Resilience17 Node.js backend template.
The solution fully adheres to the assessment specification, including validation rules, instruction formats, and required response structures.

🔗 Live Endpoint (Render Deployment)

POST

https://payment-instructions-assessment.onrender.com/payment-instructions


This endpoint accepts payment instructions, validates them, and executes or schedules transactions as defined in the assessment brief.

✔ Key Capabilities
🎯 Instruction Parsing (No Regex)

Supports DEBIT and CREDIT formats

Case-insensitive keyword processing

Strict keyword order validation

Optional ON YYYY-MM-DD scheduling

Instruction parsing done using only string operations (split, indexOf, etc.)

🎯 Business Rule Validation

Positive integer amounts (AM01)

Supported currencies: NGN, USD, GBP, GHS (CU02)

Currency consistency (CU01)

Account existence (AC03)

Valid account ID format (AC04)

Sufficient funds in debit account (AC01)

Debit ≠ credit account (AC02)

Date format and UTC date comparison (DT01)

Malformed syntax handling (SY01, SY02, SY03)

🎯 Execution Logic

Immediate execution (AP00)

Future-dated transactions return pending (AP02)

Balances only update on successful execution

Pending and failed transactions keep balances unchanged

Response includes only involved accounts, maintaining request order

🧪 Test Coverage

All 12 required assessment test cases were implemented and validated using Postman:

Valid DEBIT

Valid CREDIT

Case-insensitive keywords

Past date (immediate execution)

Future date (pending)

Currency mismatch

Unsupported currency

Same account

Negative and decimal amounts

Missing accounts

Malformed instructions

All tests produced expected results.

📄 Request Example
{
  "accounts": [
    {"id": "A", "balance": 230, "currency": "USD"},
    {"id": "B", "balance": 300, "currency": "USD"}
  ],
  "instruction": "DEBIT 30 USD FROM ACCOUNT A FOR CREDIT TO ACCOUNT B"
}

📄 Response Example (AP00 – Successful)
{
  "type": "DEBIT",
  "amount": 30,
  "currency": "USD",
  "debit_account": "A",
  "credit_account": "B",
  "execute_by": null,
  "status": "successful",
  "status_reason": "Transaction executed successfully",
  "status_code": "AP00",
  "accounts": [
    {"id": "A", "balance": 200, "balance_before": 230, "currency": "USD"},
    {"id": "B", "balance": 330, "balance_before": 300, "currency": "USD"}
  ]
}

🧱 Project Structure

This solution follows the given backend template structure exactly:

bootstrap.js   → loads envs, starts app
app.js         → sets up routes and handlers
endpoints/          → payment-instructions
services/      → instruction parsing & execution logic
messages/      → reusable status messages


Server starts using:

npm start       (which runs: node bootstrap.js)

📦 Running Locally
npm install
npm start


Server starts on the default template port and exposes:

POST /payment-instructions

