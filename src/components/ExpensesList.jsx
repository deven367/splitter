function ExpensesList({ expenses, onDeleteExpense, onEditExpense }) {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <section className="card">
      <h2>
        📋 Expenses
        {expenses.length > 0 && (
          <span className="total-badge">${total.toFixed(2)}</span>
        )}
      </h2>
      <div className="expenses-list">
        {expenses.length === 0 ? (
          <p className="empty-state">No expenses yet.</p>
        ) : (
          expenses.map(expense => {
            const date = new Date(expense.date).toLocaleDateString();
            const isPayment = expense.type === 'payment';

            return (
              <div key={expense.id} className={`expense-item ${isPayment ? 'payment-item' : ''}`}>
                <div className="expense-info">
                  <h4>{isPayment ? '💸 Payment' : expense.description}</h4>
                  <p>
                    {isPayment
                      ? `${expense.paidBy} paid ${expense.splitBetween[0]} • ${date}`
                      : `${expense.paidBy} paid • ${date}`
                    }
                  </p>
                </div>
                <div className="expense-right">
                  <div className="expense-amount">${expense.amount.toFixed(2)}</div>
                  <div className="expense-actions">
                    {!isPayment && (
                      <button className="edit-btn" onClick={() => onEditExpense(expense.id)}>✎</button>
                    )}
                    <button onClick={() => onDeleteExpense(expense.id)}>✕</button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

export default ExpensesList;
