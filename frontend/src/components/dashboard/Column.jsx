// frontend/src/components/dashboard/Column.jsx
import React from 'react';
import Task from './Task';
import { Droppable } from '@hello-pangea/dnd'; // Changed import
import './Column.css';

const Column = ({ column, tasks, onOpenModalForAdd, onOpenModalForEdit, onDeleteTask, onToggleComplete }) => {
  return (
    <div className="column" data-column-id={column.id}>
      <div className="column__header">
        <span className="column__title">{column.title}</span>
        <span className="column__counter">{tasks.length}</span>
        <button
          className="action-btn action-btn--add"
          aria-label={`${column.title} 컬럼에 새 업무 추가`}
          onClick={() => onOpenModalForAdd(column.id)}
        >
          +
        </button>
      </div>
      <Droppable droppableId={column.id} type="task">
        {(provided, snapshot) => (
          <div
            className={`column__content ${snapshot.isDraggingOver ? 'column__content--drag-over' : ''}`}
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {tasks && tasks.length > 0 ? (
              tasks.map((task, index) => ( // Pass index for Draggable key and index prop
                <Task
                  key={task.id}
                  task={task}
                  index={index} // Pass index to Draggable
                  onOpenModalForEdit={onOpenModalForEdit}
                  onDeleteTask={onDeleteTask}
                  onToggleComplete={onToggleComplete}
                />
              ))
            ) : (
              !snapshot.isDraggingOver && <p className="empty-state">업무가 없습니다.</p>
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};
export default Column;
