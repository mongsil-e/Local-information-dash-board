// frontend/src/components/pgm/PgmMainColumn.jsx
import React from 'react';
import PgmSubColumn from './PgmSubColumn';
import './PgmMainColumn.css';

const PgmMainColumn = ({ title, subColumnsConfig, allTasks, onOpenModalForAdd, onOpenModalForEdit, onDeleteTask, onToggleComplete }) => {
  return (
    <div className={`main-column ${title}-column`}> {/* e.g., AVI-column */}
      <h2 className="main-column-title">{title}</h2>
      <div className="sub-columns-container">
        {subColumnsConfig.map(subCol => {
          const tasksForSubColumn = allTasks.filter(task => task.columnId === subCol.id);
          return (
            <PgmSubColumn
              key={subCol.id}
              title={subCol.title}
              tasks={tasksForSubColumn}
              columnId={subCol.id}
              onOpenModalForAdd={onOpenModalForAdd}
              onOpenModalForEdit={onOpenModalForEdit}
              onDeleteTask={onDeleteTask}
              onToggleComplete={onToggleComplete}
            />
          );
        })}
      </div>
    </div>
  );
};
export default PgmMainColumn;
