import { useState, useEffect } from 'react';
import { calculatePercentageSplits } from '../utils/calculations';

function ExpenseForm({ members, onAddExpense }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [splitType, setSplitType] = useState('equal');
  const [splitBetween, setSplitBetween] = useState(new Set());
  const [customSplits, setCustomSplits] = useState({});
  const [percentageSplits, setPercentageSplits] = useState({});

  useEffect(() => {
    if (members.length > 0) {
      setSplitBetween(new Set(members));
    }
  }, [members]);

  const handleSplitToggle = (member) => {
    const newSplit = new Set(splitBetween);
    if (newSplit.has(member)) {
      newSplit.delete(member);
    } else {
      newSplit.add(member);
    }
    setSplitBetween(newSplit);
  };

  const handleAddExpense = () => {
    if (!description.trim()) { alert('Please enter a description'); return; }
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) { alert('Please enter a valid amount'); return; }
    if (!paidBy) { alert('Please select who paid'); return; }
    if (splitBetween.size === 0) { alert('Please select at least one person to split with'); return; }

    const splitBetweenArray = Array.from(splitBetween);
    let splits = {};

    if (splitType === 'equal') {
      const perPerson = amountNum / splitBetweenArray.length;
      splitBetweenArray.forEach(member => {
        splits[member] = Math.round(perPerson * 100) / 100;
      });

      const totalSplit = Object.values(splits).reduce((a, b) => a + b, 0);
      const diff = Math.round((amountNum - totalSplit) * 100) / 100;
      if (diff !== 0) splits[splitBetweenArray[0]] += diff;
    } else if (splitType === 'percentage') {
      const result = calculatePercentageSplits(amountNum, splitBetweenArray, (member) => {
        return parseFloat(percentageSplits[member]) || 0;
      });

      if (result.error) {
        alert(result.error);
        return;
      }

      splits = result.splits;
    } else {
      let totalCustom = 0;
      splitBetweenArray.forEach(member => {
        const customAmount = parseFloat(customSplits[member]) || 0;
        splits[member] = customAmount;
        totalCustom += customAmount;
      });

      if (Math.abs(totalCustom - amountNum) > 0.01) {
        alert(`Custom splits ($${totalCustom.toFixed(2)}) must equal the total ($${amountNum.toFixed(2)})`);
        return;
      }
    }

    const expense = {
      id: Date.now(),
      description: description.trim(),
      amount: amountNum,
      paidBy,
      splitBetween: splitBetweenArray,
      splits,
      date: new Date().toISOString()
    };

    onAddExpense(expense);

    setDescription('');
    setAmount('');
    setSplitType('equal');
    setCustomSplits({});
    setPercentageSplits({});
  };

  const selectedMembers = Array.from(splitBetween);

  return (
    <section className="card">
      <h2>➕ Add Expense</h2>
      <div className="expense-form">
        <div className="form-row-inline">
          <div className="form-field">
            <label>Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Dinner"
            />
          </div>
          <div className="form-field form-field-small">
            <label>Amount</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
            />
          </div>
        </div>
        <div className="form-row-inline">
          <div className="form-field">
            <label>Paid by</label>
            <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              <option value="">Select...</option>
              {members.map(member => (
                <option key={member} value={member}>{member}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Split Type</label>
            <select value={splitType} onChange={(e) => setSplitType(e.target.value)}>
              <option value="equal">Equal</option>
              <option value="percentage">Percentage</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <label>Split between</label>
          <div className="checkbox-group">
            {members.map(member => (
              <div key={member} className="checkbox-item">
                <input
                  type="checkbox"
                  id={`split_${member}`}
                  checked={splitBetween.has(member)}
                  onChange={() => handleSplitToggle(member)}
                />
                <label htmlFor={`split_${member}`}>{member}</label>
              </div>
            ))}
          </div>
        </div>

        {splitType === 'custom' && (
          <div className="form-row">
            <label>Custom Amounts</label>
            <div className="custom-split-grid">
              {selectedMembers.map(member => (
                <div key={member} className="custom-split-input">
                  <label>{member}</label>
                  <input
                    type="number"
                    value={customSplits[member] || ''}
                    onChange={(e) => setCustomSplits({ ...customSplits, [member]: e.target.value })}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {splitType === 'percentage' && (
          <div className="form-row">
            <label>Percentage Split</label>
            <div className="custom-split-grid">
              {selectedMembers.map(member => (
                <div key={member} className="custom-split-input">
                  <label>{member}</label>
                  <input
                    type="number"
                    value={percentageSplits[member] || ''}
                    onChange={(e) => setPercentageSplits({ ...percentageSplits, [member]: e.target.value })}
                    placeholder="0"
                    step="0.01"
                    min="0"
                    max="100"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={handleAddExpense} className="btn btn-primary btn-full">Add Expense</button>
      </div>
    </section>
  );
}

export default ExpenseForm;
