import { useState } from 'react';

function MembersList({ members, onAddMember, onRemoveMember }) {
  const [memberName, setMemberName] = useState('');

  const handleAdd = () => {
    const name = memberName.trim();
    if (!name) {
      alert('Please enter a member name');
      return;
    }

    if (members.includes(name)) {
      alert('This member already exists');
      return;
    }

    onAddMember(name);
    setMemberName('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleAdd();
  };

  return (
    <section className="card card-compact">
      <h2>👥 Members</h2>
      <div className="input-group">
        <input
          type="text"
          value={memberName}
          onChange={(e) => setMemberName(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Add member..."
        />
        <button onClick={handleAdd} className="btn btn-primary btn-small">+</button>
      </div>
      <div className="members-list">
        {members.length === 0 ? (
          <p className="empty-state">No members yet.</p>
        ) : (
          members.map(member => (
            <span key={member} className="member-tag">
              {member}
              <button className="remove-btn" onClick={() => onRemoveMember(member)}>&times;</button>
            </span>
          ))
        )}
      </div>
    </section>
  );
}

export default MembersList;
