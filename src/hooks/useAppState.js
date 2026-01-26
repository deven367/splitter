import { useState, useEffect } from 'react';

export function useAppState(currentGroup, githubSync) {
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);

  // Load data from localStorage or GitHub
  const loadData = async () => {
    if (githubSync.githubConfig.token && githubSync.githubConfig.repo) {
      try {
        const data = await githubSync.loadFromGitHub();
        setMembers(data.members);
        setExpenses(data.expenses);
        return;
      } catch (error) {
        console.error('GitHub load failed, using localStorage:', error);
      }
    }

    const storageKey = `splitter_${currentGroup}`;
    const savedMembers = localStorage.getItem(`${storageKey}_members`);
    const savedExpenses = localStorage.getItem(`${storageKey}_expenses`);
    setMembers(savedMembers ? JSON.parse(savedMembers) : []);
    setExpenses(savedExpenses ? JSON.parse(savedExpenses) : []);
  };

  // Clear all data
  const clearAllData = () => {
    setMembers([]);
    setExpenses([]);
    const storageKey = `splitter_${currentGroup}`;
    localStorage.removeItem(`${storageKey}_members`);
    localStorage.removeItem(`${storageKey}_expenses`);
    githubSync.queueSync([], [], 'Clear all data');
  };

  useEffect(() => {
    loadData();
  }, [currentGroup]);

  return {
    members,
    setMembers,
    expenses,
    setExpenses,
    loadData,
    clearAllData
  };
}
