// frontend/src/components/dashboard/Board.jsx
import React from 'react';
import Column from './Column';
import './Board.css';

const Board = ({ columns, tasks, onOpenModalForAdd, onOpenModalForEdit, onDeleteTask, onToggleComplete }) => { // Added new props
  if (!columns || columns.length === 0) {
    return <p className="empty-board-message">컬럼 데이터가 없습니다. (No columns to display.)</p>;
  }
  const allTasks = Array.isArray(tasks) ? tasks : [];

  return (
    <div className="board">
      {columns.map(column => {
        const tasksForColumn = allTasks.filter(task => task.columnId === column.id);
        return (
          <Column
            key={column.id}
            column={column}
            tasks={tasksForColumn}
            onOpenModalForAdd={onOpenModalForAdd}
            onOpenModalForEdit={onOpenModalForEdit}
            onDeleteTask={onDeleteTask} // Pass down
            onToggleComplete={onToggleComplete} // Pass down
          />
        );
      })}
    </div>
  );
};
export default Board;
