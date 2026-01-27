function SyncIndicator({ status }) {
  const statuses = {
    'pending': { text: '⏳ Pending...', class: 'pending' },
    'syncing': { text: '🔄 Syncing...', class: 'syncing' },
    'synced': { text: '✅ Synced', class: 'synced' },
    'error': { text: '❌ Sync failed', class: 'error' },
    'local': { text: '💾 Local only', class: 'local' }
  };

  const s = statuses[status] || statuses['local'];

  if (status === 'local') return null;

  return (
    <div className={`sync-indicator ${s.class}`} style={{ opacity: status === 'synced' ? 0 : 1 }}>
      {s.text}
    </div>
  );
}

export default SyncIndicator;
