// frontend/src/components/dashboard/Task.jsx
import React from 'react';
import { Draggable } from '@hello-pangea/dnd'; // Changed import
import './Task.css';

// ... (keep formatDueDateForDisplay and getDueDateClass helpers)
const formatDueDateForDisplay = (dueDateString) => {
  if (!dueDateString) return '날짜 없음';
  try {
    const date = new Date(dueDateString);
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) { return '날짜 형식 오류'; }
};
const getDueDateClass = (dueDateString) => {
  if (!dueDateString) return '';
  try {
    const date = new Date(dueDateString);
    date.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(0,0,0,0);
    const diffTime = date - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'task__due-date--overdue';
    if (diffDays === 0) return 'task__due-date--today';
    return '';
  } catch (e) { return '';}
};


const Task = ({ task, index, onOpenModalForEdit, onDeleteTask, onToggleComplete }) => { // Added index prop
  const handleTaskClick = (e) => {
    // Prevent modal from opening if a button/checkbox inside task was clicked
    if (e.target.closest('button, input[type="checkbox"]')) {
      return;
    }
    onOpenModalForEdit(task);
  };

  const handleKeyPress = (e) => {
    // Allow triggering edit with Enter/Space, but not if a button/checkbox has focus within the task
    if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button, input[type="checkbox"]')) {
      e.preventDefault(); // Prevent space from scrolling, enter from submitting forms etc.
      handleTaskClick(e);
    }
  };

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          className={`task task--priority-${task.priority || 'medium'} ${snapshot.isDragging ? 'task--dragging' : ''}`}
          data-task-id={task.id}
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={handleTaskClick}
          onKeyPress={handleKeyPress}
          tabIndex={0}
          role="button"
          aria-label={`업무 수정: ${task.title}`}
        >
          <input
            type="checkbox"
            className="task__checkbox"
            checked={task.completed || false}
            onChange={(e) => { e.stopPropagation(); onToggleComplete(task);}}
            onClick={(e) => e.stopPropagation()}
            aria-label={`업무 ${task.completed ? '완료됨' : '미완료'}: ${task.title}`}
            // tabIndex={-1} // No longer needed if dragHandleProps are on the main div
          />
          <div className="task__content">
            <div className={`task__title ${task.completed ? 'task__title--completed' : ''}`}>
              {task.title}
            </div>
            {task.description && <p className="task__description">{task.description.substring(0,100)}{task.description.length > 100 ? '...' : ''}</p>}
            <div className="task__meta">
              {task.dueDate && (
                <div className={`task__meta-item ${getDueDateClass(task.dueDate)}`}>
                  <span>🗓️</span> {formatDueDateForDisplay(task.dueDate)}
                </div>
              )}
              {task.assignees && (
                <div className="task__meta-item">
                  <span>👤</span> {task.assignees}
                </div>
              )}
            </div>
            {task.tags && task.tags.length > 0 && (
              <div className="task__tags">
                {task.tags.map(tag => (
                  <span key={tag} className="task__tag">{tag}</span>
                ))}
              </div>
            )}
          </div>
          <button
            className="task__delete-btn"
            aria-label={`업무 삭제: ${task.title}`}
            onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id, task.title);}}
            // tabIndex={0} // No longer needed if dragHandleProps are on the main div
          >
            ×
          </button>
        </div>
      )}
    </Draggable>
  );
};
export default Task;
