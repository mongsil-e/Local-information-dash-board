// frontend/src/components/pgm/PgmHistoryView.jsx
import React from 'react';
import PgmMainColumn from './PgmMainColumn';
import './PgmHistoryView.css';

const PgmHistoryView = ({ allPgmTasks, onOpenModalForAdd, onOpenModalForEdit, onDeleteTask, onToggleComplete }) => {
  const aviSubColumns = [
    { id: 'AVI-red', title: 'Main PGM' },
    { id: 'AVI-yellow', title: 'Vision PGM' }
  ];
  const attachSubColumns = [
    { id: 'ATTACH-black', title: 'Main PGM' },
    { id: 'ATTACH-pink', title: 'Vision PGM' }
  ];

  // Ensure allPgmTasks is an array before filtering
  const tasks = Array.isArray(allPgmTasks) ? allPgmTasks : [];

  return (
    <div className="main-columns-container"> {/* Assuming this class from original styles */}
      <PgmMainColumn
        title="AVI"
        subColumnsConfig={aviSubColumns}
        allTasks={tasks}
        onOpenModalForAdd={onOpenModalForAdd}
        onOpenModalForEdit={onOpenModalForEdit}
        onDeleteTask={onDeleteTask}
        onToggleComplete={onToggleComplete}
      />
      <PgmMainColumn
        title="ATTACH"
        subColumnsConfig={attachSubColumns}
        allTasks={tasks}
        onOpenModalForAdd={onOpenModalForAdd}
        onOpenModalForEdit={onOpenModalForEdit}
        onDeleteTask={onDeleteTask}
        onToggleComplete={onToggleComplete}
      />
    </div>
  );
};
export default PgmHistoryView;
