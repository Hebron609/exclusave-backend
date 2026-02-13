/**
 * Balance Parser Utility
 * Parses InstantData response balance strings to numeric values
 *
 * Input: "GH₵9.25" or "GH₵100.00" or "9.25"
 * Output: 9.25 or 100.00
 */

export function parseInstantDataBalance(balanceString) {
  if (!balanceString) return 0;

  // Remove "GH₵" symbol and whitespace
  const cleaned = String(balanceString)
    .replace(/GH₵/g, "")
    .replace(/\s/g, "")
    .trim();

  const balance = parseFloat(cleaned);

  if (isNaN(balance)) {
    console.error("[Balance Parser] Invalid balance format:", balanceString);
    return 0;
  }

  return balance;
}

/**
 * Extracts balance from InstantData API response
 * Handles different response formats
 */
export function extractBalanceFromResponse(responseData) {
  if (!responseData) return null;

  // Try different possible balance field names
  const balanceString =
    responseData.remaining_balance ||
    responseData.balance ||
    responseData.current_balance ||
    responseData.accountBalance;

  if (!balanceString) {
    console.error(
      "[Balance Parser] No balance field found in response:",
      responseData,
    );
    return null;
  }

  return parseInstantDataBalance(balanceString);
}

/**
 * Validates if balance is sufficient for operation
 */
export function isBalanceSufficient(currentBalance, requiredAmount) {
  return currentBalance >= requiredAmount;
}
