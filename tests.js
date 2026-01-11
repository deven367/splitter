/**
 * Splitter - Sanity Tests
 * Run with: node tests.js
 */

// ============================================
// Core Logic (copied from app.js for testing)
// ============================================

function calculateBalances(members, expenses) {
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

function calculateSettlements(members, expenses) {
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

function calculateEqualSplit(amount, splitBetween) {
    const splits = {};
    const perPerson = amount / splitBetween.length;
    
    splitBetween.forEach(member => {
        splits[member] = Math.round(perPerson * 100) / 100;
    });
    
    // Handle rounding difference
    const totalSplit = Object.values(splits).reduce((a, b) => a + b, 0);
    const diff = Math.round((amount - totalSplit) * 100) / 100;
    if (diff !== 0) splits[splitBetween[0]] += diff;
    
    return splits;
}

// ============================================
// Test Framework
// ============================================

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        testsPassed++;
    } catch (error) {
        console.log(`❌ ${name}`);
        console.log(`   Error: ${error.message}`);
        testsFailed++;
    }
}

function assertEqual(actual, expected, message = '') {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
        throw new Error(`${message}\n   Expected: ${expectedStr}\n   Actual: ${actualStr}`);
    }
}

function assertClose(actual, expected, tolerance = 0.01, message = '') {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`${message}\n   Expected: ${expected} (±${tolerance})\n   Actual: ${actual}`);
    }
}

// ============================================
// Tests
// ============================================

console.log('\n🧪 Splitter Sanity Tests\n');
console.log('─'.repeat(40));

// Test: Equal Split Calculation
test('Equal split between 2 people', () => {
    const splits = calculateEqualSplit(100, ['Alice', 'Bob']);
    assertEqual(splits['Alice'], 50);
    assertEqual(splits['Bob'], 50);
});

test('Equal split between 3 people', () => {
    const splits = calculateEqualSplit(100, ['Alice', 'Bob', 'Charlie']);
    assertClose(splits['Alice'], 33.34);
    assertClose(splits['Bob'], 33.33);
    assertClose(splits['Charlie'], 33.33);
});

test('Equal split handles rounding (total matches)', () => {
    const splits = calculateEqualSplit(100, ['Alice', 'Bob', 'Charlie']);
    const total = Object.values(splits).reduce((a, b) => a + b, 0);
    assertClose(total, 100, 0.01, 'Total should equal original amount');
});

test('Equal split with odd amount', () => {
    const splits = calculateEqualSplit(33.33, ['Alice', 'Bob']);
    const total = Object.values(splits).reduce((a, b) => a + b, 0);
    assertClose(total, 33.33, 0.01);
});

// Test: Balance Calculation
test('Simple balance: one expense, equal split', () => {
    const members = ['Alice', 'Bob'];
    const expenses = [{
        paidBy: 'Alice',
        amount: 100,
        splits: { 'Alice': 50, 'Bob': 50 }
    }];
    
    const balances = calculateBalances(members, expenses);
    assertEqual(balances['Alice'], 50);  // Alice is owed $50
    assertEqual(balances['Bob'], -50);   // Bob owes $50
});

test('Balance with multiple expenses', () => {
    const members = ['Alice', 'Bob'];
    const expenses = [
        { paidBy: 'Alice', amount: 100, splits: { 'Alice': 50, 'Bob': 50 } },
        { paidBy: 'Bob', amount: 60, splits: { 'Alice': 30, 'Bob': 30 } }
    ];
    
    const balances = calculateBalances(members, expenses);
    assertEqual(balances['Alice'], 20);   // Alice: +100 - 50 - 30 = +20
    assertEqual(balances['Bob'], -20);    // Bob: +60 - 50 - 30 = -20
});

test('Balance sums to zero', () => {
    const members = ['Alice', 'Bob', 'Charlie'];
    const expenses = [
        { paidBy: 'Alice', amount: 90, splits: { 'Alice': 30, 'Bob': 30, 'Charlie': 30 } },
        { paidBy: 'Bob', amount: 60, splits: { 'Alice': 20, 'Bob': 20, 'Charlie': 20 } },
        { paidBy: 'Charlie', amount: 30, splits: { 'Alice': 10, 'Bob': 10, 'Charlie': 10 } }
    ];
    
    const balances = calculateBalances(members, expenses);
    const total = Object.values(balances).reduce((a, b) => a + b, 0);
    assertClose(total, 0, 0.01, 'Balances should sum to zero');
});

test('No expenses means zero balances', () => {
    const members = ['Alice', 'Bob'];
    const expenses = [];
    
    const balances = calculateBalances(members, expenses);
    assertEqual(balances['Alice'], 0);
    assertEqual(balances['Bob'], 0);
});

// Test: Settlement Calculation
test('Simple settlement: one person owes another', () => {
    const members = ['Alice', 'Bob'];
    const expenses = [{
        paidBy: 'Alice',
        amount: 100,
        splits: { 'Alice': 50, 'Bob': 50 }
    }];
    
    const settlements = calculateSettlements(members, expenses);
    assertEqual(settlements.length, 1);
    assertEqual(settlements[0].from, 'Bob');
    assertEqual(settlements[0].to, 'Alice');
    assertEqual(settlements[0].amount, 50);
});

test('Settlement with 3 people', () => {
    const members = ['Alice', 'Bob', 'Charlie'];
    const expenses = [{
        paidBy: 'Alice',
        amount: 90,
        splits: { 'Alice': 30, 'Bob': 30, 'Charlie': 30 }
    }];
    
    const settlements = calculateSettlements(members, expenses);
    assertEqual(settlements.length, 2);
    
    // Bob and Charlie each owe Alice $30
    const totalToAlice = settlements
        .filter(s => s.to === 'Alice')
        .reduce((sum, s) => sum + s.amount, 0);
    assertEqual(totalToAlice, 60);
});

test('No settlement needed when balanced', () => {
    const members = ['Alice', 'Bob'];
    const expenses = [
        { paidBy: 'Alice', amount: 50, splits: { 'Alice': 25, 'Bob': 25 } },
        { paidBy: 'Bob', amount: 50, splits: { 'Alice': 25, 'Bob': 25 } }
    ];
    
    const settlements = calculateSettlements(members, expenses);
    assertEqual(settlements.length, 0);
});

test('Settlement minimizes transactions', () => {
    const members = ['Alice', 'Bob', 'Charlie'];
    const expenses = [
        { paidBy: 'Alice', amount: 30, splits: { 'Alice': 10, 'Bob': 10, 'Charlie': 10 } },
        { paidBy: 'Bob', amount: 30, splits: { 'Alice': 10, 'Bob': 10, 'Charlie': 10 } }
    ];
    
    // Alice: +30 - 10 - 10 = +10
    // Bob: +30 - 10 - 10 = +10
    // Charlie: -10 - 10 = -20
    
    const settlements = calculateSettlements(members, expenses);
    // Should be 2 settlements: Charlie pays Alice $10, Charlie pays Bob $10
    assertEqual(settlements.length, 2);
    
    const charliePayments = settlements.filter(s => s.from === 'Charlie');
    assertEqual(charliePayments.length, 2);
    
    const totalPaid = charliePayments.reduce((sum, s) => sum + s.amount, 0);
    assertEqual(totalPaid, 20);
});

// Test: Edge Cases
test('Single member with expense', () => {
    const members = ['Alice'];
    const expenses = [{
        paidBy: 'Alice',
        amount: 100,
        splits: { 'Alice': 100 }
    }];
    
    const balances = calculateBalances(members, expenses);
    assertEqual(balances['Alice'], 0);  // Paid for themselves
    
    const settlements = calculateSettlements(members, expenses);
    assertEqual(settlements.length, 0);
});

test('Very small amounts', () => {
    const members = ['Alice', 'Bob'];
    const expenses = [{
        paidBy: 'Alice',
        amount: 0.02,
        splits: { 'Alice': 0.01, 'Bob': 0.01 }
    }];
    
    const balances = calculateBalances(members, expenses);
    assertClose(balances['Alice'], 0.01);
    assertClose(balances['Bob'], -0.01);
});

test('Large amounts', () => {
    const members = ['Alice', 'Bob'];
    const expenses = [{
        paidBy: 'Alice',
        amount: 10000,
        splits: { 'Alice': 5000, 'Bob': 5000 }
    }];
    
    const balances = calculateBalances(members, expenses);
    assertEqual(balances['Alice'], 5000);
    assertEqual(balances['Bob'], -5000);
});

test('Unequal custom split', () => {
    const members = ['Alice', 'Bob', 'Charlie'];
    const expenses = [{
        paidBy: 'Alice',
        amount: 100,
        splits: { 'Alice': 50, 'Bob': 30, 'Charlie': 20 }
    }];
    
    const balances = calculateBalances(members, expenses);
    assertEqual(balances['Alice'], 50);   // 100 - 50
    assertEqual(balances['Bob'], -30);
    assertEqual(balances['Charlie'], -20);
});

// Test: Complex Scenarios
test('Trip scenario: multiple expenses, multiple payers', () => {
    const members = ['Alice', 'Bob', 'Charlie'];
    const expenses = [
        // Alice pays for hotel: $300 split equally
        { paidBy: 'Alice', amount: 300, splits: { 'Alice': 100, 'Bob': 100, 'Charlie': 100 } },
        // Bob pays for dinner: $90 split equally
        { paidBy: 'Bob', amount: 90, splits: { 'Alice': 30, 'Bob': 30, 'Charlie': 30 } },
        // Charlie pays for gas: $60 split equally
        { paidBy: 'Charlie', amount: 60, splits: { 'Alice': 20, 'Bob': 20, 'Charlie': 20 } }
    ];
    
    const balances = calculateBalances(members, expenses);
    // Alice: +300 - 100 - 30 - 20 = +150
    // Bob: +90 - 100 - 30 - 20 = -60
    // Charlie: +60 - 100 - 30 - 20 = -90
    
    assertEqual(balances['Alice'], 150);
    assertEqual(balances['Bob'], -60);
    assertEqual(balances['Charlie'], -90);
    
    const settlements = calculateSettlements(members, expenses);
    // Charlie owes Alice $90, Bob owes Alice $60
    const totalOwed = settlements.reduce((sum, s) => sum + s.amount, 0);
    assertEqual(totalOwed, 150);
});

// ============================================
// Summary
// ============================================

console.log('─'.repeat(40));
console.log(`\n📊 Results: ${testsPassed} passed, ${testsFailed} failed\n`);

if (testsFailed > 0) {
    process.exit(1);
}
