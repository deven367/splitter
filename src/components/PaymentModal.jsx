import { useState, useEffect } from 'react';

function PaymentModal({ members, paymentData, onClose, onRecordPayment }) {
  const [from, setFrom] = useState(paymentData.from);
  const [to, setTo] = useState(paymentData.to);
  const [amount, setAmount] = useState(paymentData.amount);

  useEffect(() => {
    setFrom(paymentData.from);
    setTo(paymentData.to);
    setAmount(paymentData.amount);
  }, [paymentData]);

  const handleRecordPayment = () => {
    if (!from || !to) {
      alert('Please select both payer and payee');
      return;
    }
    if (from === to) {
      alert('Payer and payee cannot be the same person');
      return;
    }
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    const expense = {
      id: Date.now(),
      description: 'Payment',
      amount: amountNum,
      paidBy: from,
      splitBetween: [to],
      splits: { [to]: amountNum },
      date: new Date().toISOString(),
      type: 'payment'
    };

    onRecordPayment(expense);
    onClose();
  };

  const handleModalClick = (e) => {
    if (e.target.classList.contains('modal')) {
      onClose();
    }
  };

  return (
    <div className="modal" onClick={handleModalClick}>
      <div className="modal-content">
        <h2>💸 Record Payment</h2>
        <div className="expense-form">
          <div className="form-row">
            <label>Payer</label>
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">Select...</option>
              {members.map(member => (
                <option key={member} value={member}>{member}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Payee</label>
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Select...</option>
              {members.map(member => (
                <option key={member} value={member}>{member}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
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
          <div className="modal-buttons">
            <button onClick={handleRecordPayment} className="btn btn-primary">Record Payment</button>
            <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PaymentModal;
