/**
 * Calculate balances for all members.
 */
export function calculateBalances(members, expenses) {
  const balances = {};
  members.forEach(member => { balances[member] = 0; });

  expenses.forEach(expense => {
    balances[expense.paidBy] += expense.amount;
    Object.entries(expense.splits).forEach(([member, splitAmount]) => {
      balances[member] -= splitAmount;
    });
  });

  return balances;
}

/**
 * Calculate settlements to minimize transactions.
 */
export function calculateSettlements(members, expenses) {
  const balances = calculateBalances(members, expenses);
  const settlements = [];

  const debtors = [];
  const creditors = [];

  Object.entries(balances).forEach(([member, balance]) => {
    if (balance < -0.01) debtors.push({ name: member, amount: -balance });
    else if (balance > 0.01) creditors.push({ name: member, amount: balance });
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const settleAmount = Math.min(debtor.amount, creditor.amount);

    if (settleAmount > 0.01) {
      settlements.push({
        from: debtor.name,
        to: creditor.name,
        amount: Math.round(settleAmount * 100) / 100
      });
    }

    debtor.amount -= settleAmount;
    creditor.amount -= settleAmount;

    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

  return settlements;
}

/**
 * Calculate splits from percentages.
 */
export function calculatePercentageSplits(amount, splitBetween, getPercentageFn) {
  let totalPercentage = 0;
  const percentages = {};
  const splits = {};

  splitBetween.forEach(member => {
    const percentage = getPercentageFn(member);
    percentages[member] = percentage;
    totalPercentage += percentage;
  });

  if (Math.abs(totalPercentage - 100) > 0.01) {
    return { error: `Percentages must sum to 100% (currently ${totalPercentage.toFixed(2)}%)` };
  }

  splitBetween.forEach(member => {
    splits[member] = Math.round((amount * percentages[member] / 100) * 100) / 100;
  });

  const totalSplit = Object.values(splits).reduce((a, b) => a + b, 0);
  const diff = Math.round((amount - totalSplit) * 100) / 100;
  if (diff !== 0) splits[splitBetween[0]] += diff;

  return { splits };
}

/**
 * Check if expense is an equal split.
 */
export function checkIfEqualSplit(expense) {
  const splitValues = Object.values(expense.splits);
  if (splitValues.length === 0) return true;

  const expectedPerPerson = expense.amount / splitValues.length;
  return splitValues.every(val => Math.abs(val - expectedPerPerson) < 0.02);
}

/**
 * Check if expense is a percentage split.
 */
export function checkIfPercentageSplit(expense) {
  if (!expense.splits || Object.keys(expense.splits).length === 0) return false;

  const members = Object.keys(expense.splits);
  let totalPercentage = 0;

  for (const member of members) {
    const splitAmount = expense.splits[member];
    const percentage = (splitAmount / expense.amount) * 100;
    totalPercentage += percentage;
  }

  if (Math.abs(totalPercentage - 100) > 0.01) return false;
  if (checkIfEqualSplit(expense)) return false;

  return true;
}
