// frontend/src/components/pgm/PgmSubColumn.jsx
import React from 'react';
import Task from '../dashboard/Task'; // Reusing Task component
import { Droppable } from '@hello-pangea/dnd'; // Import Droppable
import './PgmSubColumn.css';

const PgmSubColumn = ({ title, tasks, columnId, onOpenModalForAdd, onOpenModalForEdit, onDeleteTask, onToggleComplete }) => {
  return (
    <div className="sub-column">
      <div className="sub-column-header">
        <h3 className="sub-column-title">{title}</h3>
        <button
          className="action-btn action-btn--add sub-column-add-btn"
          onClick={() => onOpenModalForAdd(columnId)}
          aria-label={`${title} 컬럼에 항목 추가`}
        >
          +
        </button>
      </div>
      <Droppable droppableId={columnId} type="task">
        {(provided, snapshot) => (
          <div
            className={`sub-column-content ${snapshot.isDraggingOver ? 'pgm-sub-column--drag-over' : ''}`}
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {tasks && tasks.length > 0 ? (
              tasks.map((task, index) => ( // Make sure to pass index
                <Task
                  key={task.id}
                  task={task}
                  index={index} // Pass index
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
export default PgmSubColumn;
